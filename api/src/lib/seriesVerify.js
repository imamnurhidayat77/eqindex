// Series verify workflow (anti-Sophia) + official-board cross-check.
// Helpers shared by the import gate, the Series Review page and the
// official-board diff. Name matching: exact → alias tables → token
// Jaccard (reported as uncertain, never silently merged).
const pool = require('../db');
const { seriesLike } = require('./seriesKeys');
const { seriesCountFor } = require('../routes/scoring');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const normClass = (s) => String(s || '').trim().toLowerCase();

// ---- verdicts (exact class names judged genuinely non-series) ----
async function loadVerdicts() {
  try {
    const { rows } = await pool.query('SELECT class_name FROM series_verdicts');
    return new Set(rows.map((r) => r.class_name));
  } catch { return new Set(); }
}

function filterUnjudged(names, verdicts) {
  return [...new Set((names || []).map(normClass).filter(Boolean))].filter((n) => !verdicts.has(n));
}

async function recordVerdicts(names, userId, note) {
  const clean = [...new Set((names || []).map(normClass).filter(Boolean))];
  if (!clean.length) return 0;
  const { rowCount } = await pool.query(
    `INSERT INTO series_verdicts (class_name, verdict, decided_by, note)
     SELECT u, 'non_series', $2, $3 FROM unnest($1::text[]) u
     ON CONFLICT (class_name) DO UPDATE SET decided_by = EXCLUDED.decided_by,
       note = EXCLUDED.note, decided_at = NOW()`,
    [clean, userId || null, note || null]);
  return rowCount;
}

// ---- existing DB: untagged classes + signals ----
async function listUntaggedClasses({ limit = 200 } = {}) {
  const { rows } = await pool.query(
    `SELECT c.id AS class_id, c.name, c.series_key, c.height_cm, e.name AS event,
            e.id AS event_id, MIN(c.class_date) AS class_date,
            COUNT(rr.id)::INT AS rounds,
            COUNT(*) FILTER (WHERE rr.points > 0)::INT AS scored
     FROM classes c JOIN events e ON e.id = c.event_id
     LEFT JOIN round_results rr ON rr.class_id = c.id
     WHERE c.series_key IS NULL
       AND NOT EXISTS (SELECT 1 FROM series_verdicts v WHERE v.class_name = LOWER(TRIM(c.name)))
     GROUP BY c.id, c.name, c.series_key, c.height_cm, e.name, e.id
     ORDER BY COUNT(rr.id) DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    ...r,
    series_like: seriesLike(r.name),
    height_null: r.height_cm === null || r.height_cm === undefined,
  }));
}

async function tagClasses(items, userId) {
  // items: [{class_id?, name?, series_key}] — exact id preferred, else all
  // classes with the exact (normalized) name. Returns counts.
  let tagged = 0;
  const tagKey = (s) => String(s || '').trim();
  for (const it of items || []) {
    const key = tagKey(it.series_key);
    if (!key) continue;
    if (it.class_id) {
      const r = await pool.query(
        'UPDATE classes SET series_key = $2 WHERE id = $1 AND series_key IS NULL', [it.class_id, key]);
      tagged += r.rowCount;
    } else if (it.name) {
      const r = await pool.query(
        'UPDATE classes SET series_key = $2 WHERE LOWER(TRIM(name)) = $1 AND series_key IS NULL',
        [normClass(it.name), key]);
      tagged += r.rowCount;
    }
  }
  return { tagged };
}

// ---- height specs ----
async function listHeightSpecs() {
  const { rows } = await pool.query('SELECT * FROM series_height_specs ORDER BY series_key').catch(() => ({ rows: [] }));
  return rows;
}

async function upsertHeightSpec({ series_key, default_height_cm, source }) {
  const key = String(series_key || '').trim();
  const h = parseInt(default_height_cm, 10);
  if (!key) throw Object.assign(new Error('need {series_key}'), { status: 400 });
  if (!Number.isInteger(h) || h < 50 || h > 200) {
    throw Object.assign(new Error('default_height_cm must be 50..200'), { status: 400 });
  }
  const { rows } = await pool.query(
    `INSERT INTO series_height_specs (series_key, default_height_cm, source, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (series_key) DO UPDATE SET default_height_cm = EXCLUDED.default_height_cm,
       source = EXCLUDED.source, updated_at = NOW() RETURNING *`,
    [key, h, String(source || '').slice(0, 160)]);
  return rows[0];
}

// Official per-series height bands (ESNZ Jumping Series Conditions).
// Premier Shows run the upper band; all other shows the lower one.
// 5/6YO split by calendar (before Jan 1 vs from Jan 1); 7YO splits by
// championship majors vs ordinary shows. Tertiary has no fixed height
// (runs inside a host class) — always null here.
// Returns cm or null when indeterminable. Upper bound convention,
// matching the importer's range handling ("1.25-1.35m" → 135).
const MAJOR_KINDS = ['national_championship', 'series_final', 'islands', 'hoy', 'national_young_horse'];

function officialSpecHeight(seriesKey, { tier, classDate, eventKind } = {}) {
  const premier = String(tier || '').toLowerCase() === 'premier';
  const major = MAJOR_KINDS.includes(String(eventKind || '').toLowerCase());
  let d = null;
  if (classDate) { const t = new Date(classDate); if (!Number.isNaN(t.getTime())) d = t; }
  switch (String(seriesKey || '')) {
    case 'young-rider-series': return premier ? 140 : 135;
    case 'junior-rider-series': return premier ? 130 : 125;
    case 'pro-am-series': return 130;
    case 'amateur-rider-series': return 120;
    case 'grand-prix-series': return 150;
    case 'premier-league-series': return 160;
    case 'pony-grand-prix-series': return premier ? 135 : 130;
    case 'tertiary-series': return null;
    case 'five-yo-series': return d ? (d.getMonth() >= 7 ? 110 : 115) : null;
    case 'six-yo-series': return d ? (d.getMonth() >= 7 ? 120 : 125) : null;
    case 'seven-yo-series': return major ? 135 : 130;
    default: return null;
  }
}

async function applyHeightSpecs() {
  // Explicit admin overrides first, official bands for the rest (see
  // officialSpecHeight). Only NULL heights are filled, never overwritten.
  // Height feeds Model B views live; series points are unaffected.
  const specs = await listHeightSpecs();
  const over = Object.fromEntries(specs.map((s) => [s.series_key, s.default_height_cm]));
  const { rows } = await pool.query(
    `SELECT c.id, c.series_key, COALESCE(c.class_date, e.date_start) AS class_date, e.tier, e.event_kind
     FROM classes c JOIN events e ON e.id = c.event_id
     WHERE c.height_cm IS NULL AND c.series_key IS NOT NULL`);
  const bySeries = {};
  let filled = 0;
  const noRule = {};
  for (const c of rows) {
    const h = over[c.series_key] ?? officialSpecHeight(c.series_key, {
      tier: c.tier, classDate: c.class_date, eventKind: c.event_kind,
    });
    if (!Number.isInteger(h)) {
      noRule[c.series_key] = (noRule[c.series_key] || 0) + 1;
      continue;
    }
    await pool.query('UPDATE classes SET height_cm = $2 WHERE id = $1', [c.id, h]);
    filled++;
    bySeries[c.series_key] = (bySeries[c.series_key] || 0) + 1;
  }
  return { classes: filled, bySeries, noRule };
}

// ---- official board parsing (ESNZ resultClass pages or pasted text) ----
function tablesFromHtml(html) {
  const tables = [];
  for (const m of String(html || '').matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows = [];
    for (const rm of m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells = [...rm[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((c) => c[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim());
      if (cells.some((c) => c)) rows.push(cells);
    }
    if (rows.length > 1) tables.push(rows);
  }
  return tables;
}

function boardFromTable(table) {
  // Header: Rider | Horse | Place | Total | <events...>. It is rarely the
  // first row (title rows come first) — scan for it.
  const isHead = (cells) => {
    const h = cells.map((x) => norm(x));
    return h.some((x) => x.includes('rider')) && h.some((x) => x.includes('total'));
  };
  const headIdx = table.findIndex(isHead);
  if (headIdx < 0) return null;
  const head = table[headIdx].map((h) => norm(h));
  const ri = head.findIndex((h) => h.includes('rider'));
  const hoi = head.findIndex((h) => h.includes('horse'));
  const pi = head.findIndex((h) => h.includes('place'));
  const ti = head.findIndex((h) => h.includes('total'));
  if (ri < 0 || ti < 0) return null;
  const firstEv = Math.max(ri, hoi, pi, ti) + 1;
  const events = table[headIdx].slice(firstEv).map((e) => e.trim()).filter(Boolean);
  const width = table[headIdx].length;
  const rows = [];
  for (const cells of table.slice(headIdx + 1)) {
    const rider = (cells[ri] || '').trim();
    if (!rider) continue;
    const total = parseFloat(String(cells[ti] || '').replace(',', '.'));
    const row = { rider, horse: hoi >= 0 ? (cells[hoi] || '').trim() : '', total: Number.isFinite(total) ? total : 0, cells: {} };
    events.forEach((ev, i) => {
      const v = parseFloat(String(cells[width - events.length + i] || '').replace(',', '.'));
      if (ev && Number.isFinite(v) && v > 0) row.cells[ev] = v;
    });
    rows.push(row);
  }
  return rows.length ? { events, rows } : null;
}

function egressAllowed(raw) {
  // Even ADMIN-supplied URLs must not reach cloud metadata or the intranet.
  let u;
  try { u = new URL(String(raw)); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (['localhost', 'metadata.google.internal'].includes(h)) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) {
    const p = h.split('.').map(Number);
    if (p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
      || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254)) return false;
  }
  return true;
}

async function fetchOfficialBoard(url) {
  if (!egressAllowed(url)) {
    throw Object.assign(new Error('official_url must be a public http(s) page'), { status: 400 });
  }
  // EvoEvents blocks bare server fetches (403) — a browser UA gets a 302
  // to the canonical class URL and a 200 (fetch follows redirects).
  const res = await fetch(String(url), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw Object.assign(new Error(`official board fetch failed (${res.status})`), { status: 502 });
  const html = await res.text();
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
  for (const t of tablesFromHtml(html)) {
    const board = boardFromTable(t);
    if (board) return { title: title.replace(/\s+/g, ' ').trim().slice(0, 160), ...board };
  }
  throw Object.assign(new Error('no results table found on that page (paste the board text instead)'), { status: 422 });
}

function parseOfficialText(text) {
  // Tolerant: lines like "Lucy Fell ... 122" or "1. Lucy Fell 122".
  // Without a table we take trailing number as total; events unknown.
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.trim().match(/^(?:\d+[.)]\s*)?([A-Za-z'’\-][A-Za-z'’\-.\s]{1,60}?)\s+(\d+(?:\.\d+)?)\s*$/);
    if (m) rows.push({ rider: m[1].trim(), horse: '', total: Number(m[2]), cells: {} });
  }
  if (!rows.length) throw Object.assign(new Error('could not parse any rider rows — paste "Name points" lines'), { status: 422 });
  return { events: [], rows };
}

// ---- alias-aware name matching ----
async function loadAliases() {
  const map = new Map(); // norm(alias) -> norm(canonical)
  try {
    const h = await pool.query('SELECT name, horse_id FROM horse_aliases');
    const horses = await pool.query('SELECT id, name FROM horses');
    const hn = Object.fromEntries(horses.rows.map((r) => [r.id, r.name]));
    for (const r of h.rows) if (hn[r.horse_id]) map.set(norm(r.name), norm(hn[r.horse_id]));
  } catch { /* tables may not exist */ }
  try {
    const r = await pool.query('SELECT name, rider_id FROM rider_aliases');
    const riders = await pool.query('SELECT id, name FROM riders');
    const rn = Object.fromEntries(riders.rows.map((x) => [x.id, x.name]));
    for (const x of r.rows) if (rn[x.rider_id]) map.set(norm(x.name), norm(rn[x.rider_id]));
  } catch { /* ignore */ }
  return map;
}

const tokens = (s) => new Set(norm(s).split(' ').filter(Boolean));
function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function matchRider(name, ours, aliases) {
  const n = norm(name);
  if (ours.has(n)) return { key: n, via: 'exact' };
  if (aliases.has(n) && ours.has(aliases.get(n))) return { key: aliases.get(n), via: 'alias' };
  let best = null, bestScore = 0;
  for (const k of ours.keys()) {
    const s = jaccard(n, k);
    if (s > bestScore) { bestScore = s; best = k; }
  }
  if (best && bestScore >= 0.8) return { key: best, via: 'fuzzy' };
  return null;
}

// ---- our board (same bestOf rule as the public series page) ----
async function ourSeriesTotals(seriesKey) {
  const cfgQ = await pool.query(
    `SELECT params->'esnz'->'series' AS series FROM scoring_versions
     WHERE status = 'active' AND (params->>'mode') = 'esnz' ORDER BY season DESC LIMIT 1`).catch(() => ({ rows: [] }));
  const cfg = (cfgQ.rows[0]?.series || {})[seriesKey] || {};
  const infoQ = await pool.query('SELECT best_of FROM series_info WHERE series_key = $1', [seriesKey]).catch(() => ({ rows: [] }));
  const { rows } = await pool.query(
    `SELECT r.name AS rider, h.name AS horse, e.name AS event, SUM(rr.points)::INT AS pts
     FROM round_results rr JOIN classes c ON c.id = rr.class_id
     JOIN riders r ON r.id = rr.rider_id JOIN horses h ON h.id = rr.horse_id
     JOIN events e ON e.id = rr.event_id
     WHERE c.series_key = $1 GROUP BY r.name, h.name, e.name`, [seriesKey]);
  // Per-rider event scores (combos merged, mirroring the public board).
  const byRider = {};
  for (const row of rows) {
    const entry = (byRider[row.rider] ||= { scores: [] });
    entry.scores.push(row.pts);
  }
  // bestOf: seriesCountFor needs held-class count; approximate with distinct
  // event-rounds present (same spirit: cap runaway totals, never hide all).
  const classCountQ = await pool.query('SELECT COUNT(DISTINCT class_id)::INT AS n FROM round_results rr JOIN classes c ON c.id=rr.class_id WHERE c.series_key=$1', [seriesKey]).catch(() => ({ rows: [{ n: 0 }] }));
  const n = seriesCountFor(cfg, classCountQ.rows[0]?.n || 0) || infoQ.rows[0]?.best_of || null;
  const totals = {};
  for (const [rider, v] of Object.entries(byRider)) {
    const s = v.scores.sort((a, b) => b - a);
    totals[rider] = (n ? s.slice(0, n) : s).reduce((a, b) => a + b, 0);
  }
  return { totals, bestOf: n };
}

async function diffSeriesBoard(seriesKey, official) {
  const ours = await ourSeriesTotals(seriesKey);
  const aliases = await loadAliases();
  const ourKeys = new Map(Object.keys(ours.totals).map((r) => [norm(r), r]));
  const out = { series: seriesKey, bestOf: ours.bestOf, matched: 0, uncertain: [], missingHere: [], extraHere: [], deltas: [] };
  const seen = new Set();
  for (const o of official.rows || []) {
    const m = matchRider(o.rider, ourKeys, aliases);
    if (!m) {
      // official has points but we have no such rider at all
      if (o.total > 0) out.missingHere.push({ rider: o.rider, official: o.total });
      continue;
    }
    seen.add(m.key);
    if (m.via === 'fuzzy') out.uncertain.push({ official: o.rider, ours: ourKeys.get(m.key), via: 'fuzzy' });
    else out.matched++;
    const diff = o.total - (ours.totals[ourKeys.get(m.key)] || 0);
    if (diff !== 0) out.deltas.push({ rider: ourKeys.get(m.key), ours: ours.totals[ourKeys.get(m.key)] || 0, official: o.total, diff });
  }
  for (const [k, display] of ourKeys) {
    if (!seen.has(k) && (ours.totals[display] || 0) > 0) out.extraHere.push({ rider: display, ours: ours.totals[display] });
  }
  return out;
}

module.exports = {
  norm, normClass, loadVerdicts, filterUnjudged, recordVerdicts,
  listUntaggedClasses, tagClasses,
  listHeightSpecs, upsertHeightSpec, applyHeightSpecs,
  fetchOfficialBoard, parseOfficialText, diffSeriesBoard, ourSeriesTotals,
};
