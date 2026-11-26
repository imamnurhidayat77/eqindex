function paging(req, def = 20, max = 500) {
  const limit = Math.min(parseInt(req.query.limit || def, 10) || def, max);
  const minStarts = Math.max(parseInt(req.query.min_starts || 0, 10) || 0, 0);
  return { limit, minStarts };
}

// Numeric query param or null (blank/garbage never reach SQL as NaN).
function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// Keyset ("seek") paging over (created_at DESC, id DESC). Unlike OFFSET it
// costs the same on page 1 and page 500, and rows inserted while someone
// scrolls never shift or duplicate the next page. The cursor carries the
// microsecond timestamp as Postgres prints it, so no precision is lost.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;

// Select this alongside the row so keysetPage can build the next cursor.
const cursorTsSql = (col) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS _cursor_ts`;

// null = no cursor (first page), false = malformed (caller answers 400).
function readCursor(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const [ts, id] = Buffer.from(String(raw).slice(0, 200), 'base64url').toString('utf8').split('|');
  return CURSOR_TS_RE.test(ts || '') && UUID_RE.test(id || '') ? { ts, id } : false;
}

// Pushes the cursor params and returns the WHERE fragment.
function keysetCond(createdCol, idCol, cursor, params) {
  params.push(cursor.ts, cursor.id);
  const n = params.length;
  return `(${createdCol}, ${idCol}) < (($${n - 1}::timestamp AT TIME ZONE 'UTC'), $${n}::uuid)`;
}

// Rows were fetched with LIMIT limit + 1: the extra row only says "more".
function keysetPage(rows, limit) {
  const data = rows.slice(0, limit);
  const last = data[data.length - 1];
  const next_cursor = rows.length > limit && last
    ? Buffer.from(`${last._cursor_ts}|${last.id}`).toString('base64url') : null;
  for (const r of data) delete r._cursor_ts;
  return { data, next_cursor };
}

// User text for ILIKE: trimmed, capped, with LIKE wildcards escaped.
function likeTerm(raw, max = 100) {
  const s = String(raw || '').trim().slice(0, max);
  return s ? `%${s.replace(/[\\%_]/g, (c) => '\\' + c)}%` : null;
}

module.exports = { paging, numOrNull, cursorTsSql, readCursor, keysetCond, keysetPage, likeTerm };
