// Shared Import Assistant builders (used by the chat route and the
// background job runner — one definition, no drift between the two).
const pool = require('../db');
const { autoTagRecords } = require('./seriesKeys');

// Name key used for import matching: accents stripped, uppercase,
// punctuation removed, spaces collapsed. Shared with routes/admin.js.
function normName(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// AI grounding gate: a mapped horse/rider name must appear in the source
// text (spaces ignored, to survive PDF line splits; or every word present,
// for "SURNAME Firstname" reordering). Flags rows with `ungrounded`
// ['horse'|'rider'] and returns how many rows were flagged.
function groundRecords(records, sourceText) {
  // Newlines/tabs → spaces first: normName drops them, gluing "JOHN\n2" into one word.
  const src = normName(String(sourceText || '').replace(/\s+/g, ' '));
  const tight = src.replace(/ /g, '');
  const words = new Set(src.split(' '));
  const found = (name) => {
    const n = normName(name);
    return !n || tight.includes(n.replace(/ /g, '')) || n.split(' ').every((w) => words.has(w));
  };
  let flagged = 0;
  for (const r of records) {
    const miss = [];
    if (!found(r.horse_name)) miss.push('horse');
    if (!found(r.rider_name)) miss.push('rider');
    if (miss.length) { r.ungrounded = miss; flagged++; } else delete r.ungrounded;
  }
  return flagged;
}
const ungroundedWarning = (n) => `${n} row(s) have names not found in the source text — check them before commit`;

// Placing sanity per class (warnings only — ties are legal). Standard
// competition ranking: each sorted placing must repeat the previous one
// (tie) or equal its position (1,1,3 ok; 1,2,4 or 1,1,2 flagged).
const MAX_PLACING_WARNINGS = 5;
function placingWarnings(records) {
  const byClass = new Map();
  for (const r of records) {
    if ((r.status || 'finished') !== 'finished') continue;
    const p = parseInt(r.placing, 10);
    if (!(p >= 1) || !r.class_name) continue;
    const k = `${r.class_name}|${r.class_date || ''}`;
    if (!byClass.has(k)) byClass.set(k, { name: r.class_name, places: [] });
    byClass.get(k).places.push(p);
  }
  const odd = [];
  for (const { name, places } of byClass.values()) {
    const s = places.sort((a, b) => a - b);
    if (s.some((p, i) => p !== i + 1 && p !== s[i - 1])) odd.push({ name, places: s });
  }
  const out = odd.slice(0, MAX_PLACING_WARNINGS).map(({ name, places }) => (
    `Check placings in "${String(name).slice(0, 60)}": ${places.slice(0, 12).join(', ')}${places.length > 12 ? '…' : ''} (gap or unusual tie)`));
  if (odd.length > MAX_PLACING_WARNINGS) out.push(`${odd.length - MAX_PLACING_WARNINGS} more class(es) have placings to check`);
  return out;
}

// Remembered series patterns shorter than this match far too much
// ("am" hits "Amateur", "Grand Slam"…) — rejected on save, ignored on load.
const MIN_SERIES_PATTERN = 4;
const isUsableSeriesPattern = (p) => String(p || '').trim().length >= MIN_SERIES_PATTERN;

// Valid series keys from the registry, or null when the registry is empty
// or unreadable (then nothing is rejected — the gate needs a source).
async function loadSeriesKeys(db = pool) {
  try {
    const { rows } = await db.query('SELECT series_key FROM series_info');
    return rows.length ? new Set(rows.map((r) => r.series_key)) : null;
  } catch { return null; }
}

function summarizeAssist(type, meta, records, skipped) {
  // Built-in series auto-tag runs here so EVERY import flow (csv-rule,
  // evoevents-rule, ai, equipe, evoevents-fetch) gets it — remembered
  // per-admin mappings applied earlier keep precedence (tagged rows skip).
  const auto = autoTagRecords(records);
  const withSeries = records.filter((r) => r.series_key).length;
  const finished = records.filter((r) => (r.status || 'finished') === 'finished').length;
  const warnings = [];
  if (auto.tagged) {
    const byKey = {};
    for (const r of records) if (r.series_suggested) byKey[r.series_key] = (byKey[r.series_key] || 0) + 1;
    warnings.push(`Auto-tagged ${auto.tagged} row(s) to a series from the class name (${Object.entries(byKey).map(([k, n]) => `${k} ×${n}`).join(', ')}) — check the Series column before committing`);
  }
  for (const v of auto.verify.slice(0, 5)) {
    warnings.push(`Verify series link: "${v.name.slice(0, 60)}" mentions a series but matched no key (${v.rows} row(s)) — set a series_key or confirm non-series (scores 0 without one)`);
  }
  if (auto.verify.length > 5) warnings.push(`${auto.verify.length - 5} more class(es) need a series verdict`);
  warnings.push(...placingWarnings(records));
  for (const [, name, why] of (skipped || []).slice(0, 8)) warnings.push(`skipped: ${String(name).slice(0, 50)} — ${why}`);
  return {
    detected: { type, ...meta },
    records,
    warnings,
    stats: {
      rounds: records.length,
      with_series: withSeries,
      finished,
      non_finished: records.length - finished,
      new_check: 'run Validate & preview to see new horses/riders and points',
    },
  };
}

// Quote-aware CSV parser ("Smith, John" stays one cell). Shared by the
// CSV import route and the Import Assistant's csv-rule path.
function parseCsv(text) {
  const rows = [];
  let cur = [''], q = false;
  const push = () => { rows.push(cur); cur = ['']; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; } else q = false; }
      else cur[cur.length - 1] += c;
    } else if (c === '"') q = true;
    else if (c === ',') cur.push('');
    else if (c === '\n') push();
    else if (c === '\r') { /* skip */ }
    else cur[cur.length - 1] += c;
  }
  if (cur.length > 1 || cur[0] !== '') push();
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

// Organiser header spellings → canonical import keys.
const CSV_HEADER_ALIAS = {
  class: 'class_name', rider: 'rider_name', horse: 'horse_name',
  finish_place: 'placing', place: 'placing', jump_faults: 'faults',
  time_seconds: 'time', height: 'height_cm', series: 'series_key',
  prize_money: 'prize', event: 'event_name', event_date: 'date_start',
};
const normHeader = (h) => String(h).trim().toLowerCase().replace(/\s+/g, '_');

// Deterministic csv-rule: text whose first row is a CSV header with
// class + rider + horse columns → canonical records. null = not that CSV.
function csvRuleRecords(text) {
  const grid = parseCsv(String(text || '').trim());
  if (grid.length < 2) return null;
  const cols = grid[0].map(normHeader).map((h) => CSV_HEADER_ALIAS[h] || h);
  if (!['class_name', 'rider_name', 'horse_name'].every((k) => cols.includes(k))) return null;
  return grid.slice(1).map((cells) => {
    const r = {};
    cols.forEach((k, i) => {
      const v = String(cells[i] ?? '').trim();
      if (v) r[k] = v;
    });
    return r;
  });
}

// Load this admin's remembered series mappings: [{pattern, series_key}].
// Too-short patterns and keys missing from series_info are skipped (kept
// in the table, just no longer applied).
async function loadSeriesMap(userId) {
  if (!userId) return [];
  try {
    const { rows } = await pool.query(
      'SELECT key, value FROM assistant_memory WHERE user_id = $1 AND kind = $2',
      [userId, 'series_map']);
    const valid = await loadSeriesKeys();
    return rows
      .map((r) => ({ pattern: String(r.key || '').toLowerCase(), series_key: r.value?.series_key }))
      .filter((m) => isUsableSeriesPattern(m.pattern) && m.series_key && (!valid || valid.has(m.series_key)));
  } catch { return []; }
}

// Tag untagged records whose class name contains a remembered pattern.
// Returns how many rows were tagged (reported, never silent).
async function applySeriesMap(records, userId) {
  const maps = await loadSeriesMap(userId);
  if (!maps.length) return 0;
  let tagged = 0;
  for (const r of records || []) {
    if (r.series_key) continue;
    const name = String(r.class_name || '').toLowerCase();
    const hit = maps.find((m) => name.includes(m.pattern));
    if (hit) {
      r.series_key = hit.series_key;
      tagged++;
    }
  }
  return tagged;
}

// Build the chat/job reply + analysis from mapped records (single
// definition so sync chat, jobs and /assist read identically).
function mapResultToReply({ records, dropped, prose, truncated, filename, tagged, sourceText }) {
  for (const r of records) delete r.start_order;
  const ungrounded = sourceText ? groundRecords(records, sourceText) : 0;
  if (!records.length) {
    const say = prose
      ? `Here's what I made of ${filename || 'the text'}: ${prose.slice(0, 600)}${prose.length > 600 ? '…' : ''} — but I couldn't pull complete result rows (need class + rider + horse on each). Paste a couple of example rows so I can see the layout?`
      : `I read ${filename || 'the text'} but couldn't find any complete result rows (need class + rider + horse on each). Could you paste a couple of example rows so I can see the layout?`;
    return { reply: say, analysis: null };
  }
  const analysis = summarizeAssist('ai', { filename: filename || null }, records, []);
  const warnings = [];
  if (dropped) warnings.push(`${dropped} row(s) dropped (missing class/rider/horse)`);
  if (truncated) warnings.push('File is very long — only the first ~72KB was mapped. Split the PDF by day/ring and send the rest separately.');
  if (ungrounded) warnings.unshift(ungroundedWarning(ungrounded));
  if (tagged) warnings.push(`${tagged} row(s) tagged from your remembered series mappings`);
  warnings.push(...analysis.warnings);
  const noSeries = records.filter((r) => !r.series_key).length;
  return {
    reply: `Mapped ${records.length} rounds from ${filename || 'your text'}${dropped ? ` (${dropped} dropped)` : ''}${tagged ? ` (${tagged} series-tagged from memory)` : ''}. ${noSeries ? `${noSeries} have no series — tell me which classes are series classes (e.g. "class 9 is pro-am") and I'll tag them. ` : ''}Review below, then validate & commit — nothing saved yet.`,
    analysis: { ...analysis, warnings },
  };
}

module.exports = {
  summarizeAssist, loadSeriesMap, applySeriesMap, mapResultToReply, parseCsv, csvRuleRecords,
  normName, groundRecords, ungroundedWarning, placingWarnings, isUsableSeriesPattern, MIN_SERIES_PATTERN, loadSeriesKeys,
};
