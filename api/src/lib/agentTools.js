// Tools for the Import Assistant agent (Phase 1: reads; Phase 2: memory).
// Reads (SELECTs, Equipe API, series master) never write. Memory tools write
// ONLY to the admin's own assistant_memory rows — never to results, events
// or horses. Validate/preview/Commit stay human-driven via the UI buttons.
const pool = require('../db');

const SERIES_FALLBACK = [
  { series_key: 'pro-am-series', display_name: 'Pro Am' },
  { series_key: 'young-rider-series', display_name: 'Young Rider' },
  { series_key: 'junior-rider-series', display_name: 'Junior Rider' },
  { series_key: 'amateur-rider-series', display_name: 'Amateur Rider' },
  { series_key: 'grand-prix-series', display_name: 'Grand Prix' },
  { series_key: 'young-horse-series', display_name: 'Young Horse' },
];

const TOOL_DEFS = [
  {
    type: 'function',
    name: 'equipe_show',
    description: 'Fetch an Equipe show by ID (from an online.equipe.com/shows/ID link). Returns the meeting name and per-class entry counts. Use before saying anything about a show link.',
    parameters: {
      type: 'object',
      properties: { show_id: { type: 'string', description: 'Numeric Equipe show ID' } },
      required: ['show_id'],
    },
  },
  {
    type: 'function',
    name: 'evoevents_event',
    description: 'Fetch an EvoEvents event by ID (from an evoevents.co.nz/results/ID link). Returns the meeting name, dates and per-class entry counts. Use before saying anything about an EvoEvents link — full horse/rider names come straight from the results tables, no PDF needed.',
    parameters: {
      type: 'object',
      properties: { event_id: { type: 'string', description: 'Numeric EvoEvents results ID' } },
      required: ['event_id'],
    },
  },
  {
    type: 'function',
    name: 'events_list',
    description: 'List recent events in the database (for picking an import target).',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Max events, 1-20', default: 10 } },
    },
  },
  {
    type: 'function',
    name: 'horses_search',
    description: 'Check whether a horse name already exists in the database (spelling check before import).',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Name fragment' },
        limit: { type: 'integer', default: 5 },
      },
      required: ['q'],
    },
  },
  {
    type: 'function',
    name: 'riders_search',
    description: 'Check whether a rider name already exists in the database (spelling check before import).',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Name fragment' },
        limit: { type: 'integer', default: 5 },
      },
      required: ['q'],
    },
  },
  {
    type: 'function',
    name: 'series_list',
    description: 'List the known series (series_key + display name) for tagging classes. Never invent a series_key — only use keys from this list.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'memory_save',
    description: 'Remember a lasting admin preference (e.g. class-name fragment → series_key, default venue). Visible only to this admin and applied automatically next time. Kind is series_map (key: lowercase class-name fragment, value: {series_key}) or note (key: label, value: {text}).',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'series_map or note' },
        key: { type: 'string', description: 'Fragment or label, lowercase' },
        value: { type: 'object', description: '{series_key} or {text}' },
      },
      required: ['kind', 'key', 'value'],
    },
  },
  {
    type: 'function',
    name: 'memory_list',
    description: 'Recall this admin\'s remembered preferences (series mappings, notes) when unsure how they like things tagged.',
    parameters: {
      type: 'object',
      properties: { kind: { type: 'string', description: 'series_map, note, or empty for all' } },
    },
  },
];

function clampInt(v, fb, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fb;
  return Math.min(hi, Math.max(lo, n));
}

async function equipe_show({ show_id }) {
  const id = String(show_id || '').match(/\d+/);
  if (!id) return { error: 'need a numeric Equipe show ID' };
  try {
    const { equipeRecords } = require('./equipe');
    const out = await equipeRecords(id[0], { skipPractice: true });
    const classes = new Map();
    for (const r of out.records) {
      const k = r.class_name || 'unknown';
      classes.set(k, (classes.get(k) || 0) + 1);
    }
    return {
      meeting: out.meeting,
      classes: [...classes.entries()].map(([name, entries]) => ({ name, entries })),
      total_rounds: out.records.length,
      skipped: out.skipped.length,
    };
  } catch (e) {
    return { error: `Equipe fetch failed: ${e.message}` };
  }
}

async function evoevents_event({ event_id }) {
  const id = String(event_id || '').match(/\d+/);
  if (!id) return { error: 'need a numeric EvoEvents results ID' };
  try {
    const { evoeventsRecords } = require('./evoeventsFetch');
    const out = await evoeventsRecords(id[0]);
    const classes = new Map();
    for (const r of out.records) {
      const k = r.class_name || 'unknown';
      classes.set(k, (classes.get(k) || 0) + 1);
    }
    return {
      meeting: out.meeting,
      date_start: out.event.date_start,
      date_end: out.event.date_end,
      classes: [...classes.entries()].map(([name, entries]) => ({ name, entries })),
      total_rounds: out.records.length,
      skipped: out.skipped.length,
    };
  } catch (e) {
    return { error: `EvoEvents fetch failed: ${e.message}` };
  }
}

async function events_list({ limit }) {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, date_start, venue FROM events ORDER BY date_start DESC LIMIT $1',
      [clampInt(limit, 10, 1, 20)]);
    return { events: rows };
  } catch (e) {
    return { error: `events lookup failed: ${e.message}` };
  }
}

async function horses_search({ q, limit }) {
  if (!String(q || '').trim()) return { error: 'need a name fragment' };
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM horses WHERE name ILIKE $1 ORDER BY name LIMIT $2',
      [`%${String(q).trim()}%`, clampInt(limit, 5, 1, 10)]);
    return { horses: rows };
  } catch (e) {
    return { error: `horse lookup failed: ${e.message}` };
  }
}

async function riders_search({ q, limit }) {
  if (!String(q || '').trim()) return { error: 'need a name fragment' };
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM riders WHERE name ILIKE $1 ORDER BY name LIMIT $2',
      [`%${String(q).trim()}%`, clampInt(limit, 5, 1, 10)]);
    return { riders: rows };
  } catch (e) {
    return { error: `rider lookup failed: ${e.message}` };
  }
}

async function series_list() {
  try {
    const { rows } = await pool.query(
      'SELECT series_key, display_name FROM series_info ORDER BY series_key');
    if (rows.length) return { series: rows };
  } catch { /* fall through to seed list */ }
  return { series: SERIES_FALLBACK };
}

const MEMORY_KINDS = ['series_map', 'note'];

async function memory_save({ kind, key, value }, ctx) {
  if (!ctx?.userId) return { error: 'not logged in' };
  if (!MEMORY_KINDS.includes(kind)) return { error: `kind must be ${MEMORY_KINDS.join(' or ')}` };
  const k = String(key || '').trim().toLowerCase().slice(0, 120);
  if (!k) return { error: 'need a key' };
  if (!value || typeof value !== 'object') return { error: 'need a value object' };
  if (kind === 'series_map' && !String(value.series_key || '').trim()) {
    return { error: 'series_map value needs {series_key}' };
  }
  if (kind === 'note' && !String(value.text || '').trim()) return { error: 'note value needs {text}' };
  const v = kind === 'series_map'
    ? { series_key: String(value.series_key).trim() }
    : { text: String(value.text).slice(0, 500) };
  try {
    await pool.query(
      `INSERT INTO assistant_memory (user_id, kind, key, value, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, kind, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [ctx.userId, kind, k, v]);
    return { saved: true, kind, key: k };
  } catch (e) {
    return { error: `memory save failed: ${e.message}` };
  }
}

async function memory_list({ kind }, ctx) {
  if (!ctx?.userId) return { error: 'not logged in' };
  try {
    const conds = ['user_id = $1'];
    const params = [ctx.userId];
    if (kind) {
      if (!MEMORY_KINDS.includes(kind)) return { error: `kind must be ${MEMORY_KINDS.join(' or ')}` };
      params.push(kind);
      conds.push(`kind = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT kind, key, value, updated_at FROM assistant_memory
       WHERE ${conds.join(' AND ')} ORDER BY updated_at DESC LIMIT 50`, params);
    return { memories: rows };
  } catch (e) {
    return { error: `memory lookup failed: ${e.message}` };
  }
}

const HANDLERS = { equipe_show, evoevents_event, events_list, horses_search, riders_search, series_list, memory_save, memory_list };

// Never throws for known tools — errors come back as data so the model
// can recover and answer. Unknown tools are rejected the same way.
async function runTool(name, args, ctx) {
  const fn = HANDLERS[name];
  if (!fn) return { error: `unknown tool: ${name}` };
  try {
    const out = await fn(args && typeof args === 'object' ? args : {}, ctx || {});
    return out && typeof out === 'object' ? out : { result: out };
  } catch (e) {
    return { error: `${name} failed: ${e.message}` };
  }
}

module.exports = { TOOL_DEFS, runTool };
