// Import batches (migration 117): one id per committed import run, so an
// import can be undone exactly. Pure helpers first (unit-tested), then the
// DB work for recording a batch and undoing it.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isBatchId = (v) => typeof v === 'string' && UUID_RE.test(v);

const ENTITY_TABLES = ['horses', 'riders', 'classes', 'events', 'venues'];
const emptyCreated = () => Object.fromEntries(ENTITY_TABLES.map((t) => [t, []]));
// Union of two `created` maps, de-duplicated, every table present.
function mergeCreated(a, b) {
  const out = emptyCreated();
  for (const t of ENTITY_TABLES) out[t] = [...new Set([...((a && a[t]) || []), ...((b && b[t]) || [])])];
  return out;
}

// Similar-name hints. 0.6 was calibrated with pg_trgm on real-looking
// pairs: typos score 0.60–0.77 ("BELA ROSE"/"BELLA ROSE" 0.75, "JON SMITH"/
// "JOHN SMITH" 0.62, "KAREN SMYTH"/"KAREN SMITH" 0.60) while different
// names fall below ("SARAH JAMES"/"SARAH JONES" 0.50, "ROSE"/"ROSIE" 0.38).
// The space-free score catches "MC DONALD" vs "MCDONALD".
const SIMILAR_MIN = 0.6;
// rows: [{query, id, name, normalized_name, score}] → Map(query → {id, name, score})
function pickSimilar(rows, min = SIMILAR_MIN) {
  const best = new Map();
  for (const r of rows || []) {
    const score = Number(r.score);
    if (!(score >= min) || r.normalized_name === r.query) continue;
    const cur = best.get(r.query);
    if (!cur || score > cur.score) best.set(r.query, { id: r.id, name: r.name, score: Math.round(score * 100) / 100 });
  }
  return best;
}

// Closest existing row for each new normalized name (dry-run hint). Runs on
// the pool, outside the import transaction: the rows that transaction just
// inserted are invisible (no self-matches) and a failure cannot abort it.
// Without pg_trgm (migration 116 not applied yet) it quietly returns nothing.
const SIMILAR_TABLES = new Set(['horses', 'riders']);
async function similarNames(db, table, names) {
  const list = [...new Set(names)].filter(Boolean);
  if (!list.length || !SIMILAR_TABLES.has(table)) return new Map();
  try {
    const { rows } = await db.query(
      `SELECT q.query, m.id, m.name, m.normalized_name, m.score
         FROM unnest($1::TEXT[]) AS q(query)
         CROSS JOIN LATERAL (
           SELECT id, name, normalized_name,
             GREATEST(similarity(normalized_name, q.query),
                      similarity(replace(normalized_name, ' ', ''), replace(q.query, ' ', ''))) AS score
             FROM ${table} WHERE normalized_name % q.query AND normalized_name <> q.query
            ORDER BY score DESC LIMIT 3) m`, [list]);
    return pickSimilar(rows);
  } catch {
    return new Map();
  }
}

// Server-side name gate: rows the review flagged as "name not in source".
// cells: the row's `ungrounded` cell ("horse", "horse,rider", "" …).
const isUngroundedCell = (v) => String(v ?? '').split(',').some((x) => ['horse', 'rider'].includes(x.trim()));

// Plain-language names for referencing tables (shown to admins).
const REF_LABELS = {
  round_results: 'results from other imports', classes: 'classes from other imports', events: 'other events',
  watchlist_items: 'watchlists', media: 'photos', packages: 'photo packages', claimed_photos: 'claimed photos',
  horse_aliases: 'name aliases', rider_aliases: 'name aliases', health_records: 'health records',
  training_records: 'training records', credit_bundles: 'credit bundles', rider_claims: 'profile claims',
  coach_athletes: 'coach rosters', saved_comparisons: 'saved comparisons', correction_reports: 'correction reports',
  horse_merges: 'horse merges', horse_not_duplicates: 'duplicate checks', sire_cleanup_log: 'sire clean-up history',
  venue_aliases: 'venue aliases', credit_packs: 'credit packs', event_volunteers: 'volunteers',
  reel_orders: 'reel orders', reel_products: 'reel products', sponsor_budgets: 'sponsor budgets',
  upload_intakes: 'photo uploads', wallet_transactions: 'wallet transactions',
};
const refLabel = (t) => REF_LABELS[t] || String(t).replace(/_/g, ' ');

// Which created entities can go: only those nothing else references.
// entities: [{table, id, name, refs: [{table, column, count}]}]
function planRemoval(entities) {
  const remove = [], keep = [];
  for (const e of entities) {
    const used = (e.refs || []).filter((r) => r.count > 0);
    if (used.length) keep.push({ table: e.table, id: e.id, name: e.name, reason: `still used by ${[...new Set(used.map((r) => refLabel(r.table)))].join(', ')}` });
    else remove.push({ table: e.table, id: e.id, name: e.name });
  }
  return { remove, keep };
}

// A fill is reverted only while the column still holds what the import
// wrote; anything an admin changed since is left alone.
// fills: [{table, id, column, old, new}]; current: Map(`${table}|${id}|${column}` → value)
function revertableFills(fills, current) {
  const revert = [], skip = [];
  for (const f of fills || []) {
    const key = `${f.table}|${f.id}|${f.column}`;
    if (!current.has(key)) skip.push({ ...f, reason: 'row no longer exists' });
    else if (String(current.get(key) ?? '') === String(f.new ?? '')) revert.push(f);
    else skip.push({ ...f, reason: 'changed since the import' });
  }
  return { revert, skip };
}

// ---- DB work ---------------------------------------------------------------

// Columns an import may fill on existing rows (fixed list: identifiers are
// interpolated into SQL, so they must never come from the request).
const FILL_COLUMNS = {
  horses: ['breed', 'age', 'gender', 'sire', 'dam', 'damsire', 'breeder', 'country', 'color', 'year_of_birth'],
  riders: ['region', 'series_category', 'nationality'],
  classes: ['series_key', 'is_world_cup', 'arena_name', 'arena_type', 'surface', 'start_time', 'field_size'],
  events: ['venue', 'venue_country', 'region', 'arena_type', 'venue_id'],
};
// References that are not foreign keys (found by column name; see the
// undo notes in migration 117). Logs and derived caches are not "uses".
const SOFT_REFS = {
  horses: [['media', 'horse_id'], ['packages', 'horse_id'], ['saved_comparisons', 'a_id'], ['saved_comparisons', 'b_id'],
    ['watchlist_items', 'entity_id'], ['correction_reports', 'entity_id'], ['horse_merges', 'from_id'], ['horse_merges', 'into_id'],
    ['sire_cleanup_log', 'horse_id']],
  riders: [['media', 'rider_id'], ['packages', 'rider_id'], ['saved_comparisons', 'a_id'], ['saved_comparisons', 'b_id'],
    ['watchlist_items', 'entity_id'], ['correction_reports', 'entity_id']],
  classes: [['media', 'class_id']],
  events: [['media', 'event_id'], ['packages', 'event_id']],
  venues: [],
};
const IGNORED_FK_TABLES = new Set(['import_logs', 'import_batches']);

// Update only columns that are NULL (events.venue also when 'Unknown', the
// auto-created placeholder) and return what actually changed, in one round
// trip: the self-join exposes the pre-update row.
async function fillIfNull(client, table, id, values) {
  const cols = FILL_COLUMNS[table].filter((c) => values[c] !== null && values[c] !== undefined);
  if (!cols.length) return [];
  const blank = (c) => (table === 'events' && c === 'venue' ? `(o.venue IS NULL OR o.venue = 'Unknown')` : `o.${c} IS NULL`);
  const sql = `UPDATE ${table} t SET ${cols.map((c, i) => `${c} = CASE WHEN ${blank(c)} THEN $${i + 2} ELSE t.${c} END`).join(', ')}
    FROM ${table} o WHERE t.id = $1 AND o.id = t.id AND (${cols.map(blank).join(' OR ')})
    RETURNING ${cols.map((c) => `o.${c} AS "old_${c}", t.${c} AS "new_${c}"`).join(', ')}`;
  const { rows } = await client.query(sql, [id, ...cols.map((c) => values[c])]);
  if (!rows.length) return [];
  return cols
    .filter((c) => String(rows[0][`old_${c}`] ?? '') !== String(rows[0][`new_${c}`] ?? ''))
    .map((c) => ({ table, id, column: c, old: rows[0][`old_${c}`] ?? null, new: rows[0][`new_${c}`] }));
}

// Start (or continue, for the next chunk / a Resume) a batch inside the
// import transaction. Refuses another admin's batch and an undone one.
async function openBatch(client, { id, actorId, actorName, source, filename }) {
  await client.query(
    `INSERT INTO import_batches (id, actor_id, actor_name, source, filename) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO NOTHING`, [id, actorId || null, actorName || null, source, filename || null]);
  const b = (await client.query('SELECT actor_id, status FROM import_batches WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (String(b.actor_id || '') !== String(actorId || '')) return 'this import batch belongs to another admin — start a new commit';
  if (b.status !== 'active') return 'this import was undone — validate again and start a new commit';
  return null;
}

async function closeBatch(client, id, { ok, failed, seriesAck, namesAck, created, fills }) {
  const prev = (await client.query('SELECT created FROM import_batches WHERE id = $1', [id])).rows[0];
  await client.query(
    `UPDATE import_batches SET rows_ok = rows_ok + $2, rows_failed = rows_failed + $3, chunks = chunks + 1,
       series_ack = series_ack OR $4, names_ack = names_ack OR $5, created = $6, fills = fills || $7::JSONB, updated_at = NOW()
     WHERE id = $1`,
    [id, ok, failed, !!seriesAck, !!namesAck, JSON.stringify(mergeCreated(prev?.created, created)), JSON.stringify(fills)]);
}

let fkCache = null;
// Every FK pointing at the entity tables, from the catalog (so tables added
// later are covered without touching this file).
async function foreignRefs(client) {
  if (fkCache) return fkCache;
  const { rows } = await client.query(
    `SELECT c.confrelid::regclass::text AS target, c.conrelid::regclass::text AS tbl, a.attname AS col
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid::regclass::text = ANY($1)`, [ENTITY_TABLES]);
  fkCache = {};
  for (const r of rows) if (!IGNORED_FK_TABLES.has(r.tbl)) (fkCache[r.target] ||= []).push([r.tbl, r.col]);
  return fkCache;
}

async function refsOf(client, table, id) {
  const fks = (await foreignRefs(client))[table] || [];
  const refs = [];
  for (const [tbl, col] of [...fks, ...SOFT_REFS[table]]) {
    const { rows } = await client.query(`SELECT COUNT(*)::INT AS n FROM ${tbl} WHERE ${col} = $1`, [id]);
    refs.push({ table: tbl, column: col, count: rows[0].n });
  }
  return refs;
}

class UndoError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

// Undo one batch inside the caller's transaction. dryRun: the caller rolls
// back; the returned summary is the preview. Throws UndoError for 404/409.
async function undoBatch(client, batchId, { actorId } = {}) {
  const batch = (await client.query('SELECT * FROM import_batches WHERE id = $1 FOR UPDATE', [batchId])).rows[0];
  if (!batch) throw new UndoError(404, 'import batch not found');
  if (batch.status === 'undone') {
    return { already_undone: true, message: `This import was already undone on ${new Date(batch.undone_at).toISOString().slice(0, 16).replace('T', ' ')} UTC — nothing to do.` };
  }
  const results = (await client.query(
    'SELECT id, class_id FROM round_results WHERE import_batch_id = $1', [batchId])).rows;
  const created = mergeCreated(batch.created, null);
  // A horse merge re-pointed rows this import added (or swallowed a horse it
  // created); undoing now would break that merge's own undo.
  const merges = (await client.query(
    `SELECT m.id, m.from_row->>'name' AS from_name, h.name AS into_name, m.created_at
       FROM horse_merges m LEFT JOIN horses h ON h.id = m.into_id
      WHERE m.undone_at IS NULL AND (m.from_id = ANY($1::UUID[])
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.moved->'round_results', '[]'::JSONB)) x WHERE x = ANY($2::TEXT[])))`,
    [created.horses, results.map((r) => r.id)])).rows;
  if (merges.length) {
    throw new UndoError(409, `Undo blocked: ${merges.map((m) => `"${m.from_name}" was merged into "${m.into_name || 'another horse'}"`).join('; ')} after this import. Undo that merge first (Admin → Horses → Merges), then undo this import.`,
      { merges });
  }

  // 1. Results, with the per-row recalc trigger off; each class recalculated once below.
  await client.query('ALTER TABLE round_results DISABLE TRIGGER round_results_esnz_share_del_trg');
  await client.query('DELETE FROM round_results WHERE import_batch_id = $1', [batchId]);
  await client.query('ALTER TABLE round_results ENABLE TRIGGER round_results_esnz_share_del_trg');
  const touched = new Set(results.map((r) => r.class_id));

  // 2. Fills on rows that existed before — only while still the import's value.
  const current = new Map();
  for (const f of batch.fills || []) {
    if (!FILL_COLUMNS[f.table]?.includes(f.column)) continue; // never interpolate unknown identifiers
    const { rows } = await client.query(`SELECT ${f.column} AS v FROM ${f.table} WHERE id = $1`, [f.id]);
    if (rows.length) current.set(`${f.table}|${f.id}|${f.column}`, rows[0].v);
  }
  const fills = revertableFills((batch.fills || []).filter((f) => FILL_COLUMNS[f.table]?.includes(f.column)), current);
  for (const f of fills.revert) {
    await client.query(`UPDATE ${f.table} SET ${f.column} = $2 WHERE id = $1`, [f.id, f.old]);
    if (f.table === 'classes') touched.add(f.id);
  }

  // 3. Created rows, children first; each one only if nothing references it.
  const removed = [], kept = [];
  const names = { horses: 'name', riders: 'name', classes: 'name', events: 'name', venues: 'name' };
  for (const table of ['classes', 'events', 'venues', 'horses', 'riders']) {
    const entities = [];
    for (const id of created[table]) {
      const row = (await client.query(`SELECT ${names[table]} AS name FROM ${table} WHERE id = $1`, [id])).rows[0];
      if (!row) continue; // already gone (deleted or merged away)
      entities.push({ table, id, name: row.name, refs: await refsOf(client, table, id) });
    }
    const plan = planRemoval(entities);
    for (const e of plan.remove) {
      await client.query(`DELETE FROM ${table} WHERE id = $1`, [e.id]);
      if (table === 'horses' || table === 'riders') {
        await client.query('DELETE FROM ranking_snapshots WHERE entity_id = $1', [e.id]);
      }
      if (table === 'classes') touched.delete(e.id);
    }
    removed.push(...plan.remove);
    kept.push(...plan.keep);
  }

  // 4. Recalculate the classes that lost results or got a fill reverted.
  for (const cid of touched) {
    const exists = (await client.query('SELECT 1 FROM classes WHERE id = $1', [cid])).rows.length;
    if (exists) await client.query('SELECT esnz_recalc_class($1)', [cid]);
  }

  const summary = {
    results_deleted: results.length,
    removed: Object.fromEntries(ENTITY_TABLES.map((t) => [t, removed.filter((e) => e.table === t).length])),
    kept,
    fills_reverted: fills.revert.length,
    fills_skipped: fills.skip.map(({ table, column, reason }) => ({ table, column, reason })),
    classes_recalculated: touched.size,
  };
  await client.query(
    `UPDATE import_batches SET status = 'undone', undone_at = NOW(), undone_by = $2, undo_summary = $3 WHERE id = $1`,
    [batchId, actorId || null, JSON.stringify(summary)]);
  return summary;
}

module.exports = {
  isBatchId, emptyCreated, mergeCreated, SIMILAR_MIN, pickSimilar, similarNames, isUngroundedCell,
  planRemoval, revertableFills, FILL_COLUMNS, fillIfNull, openBatch, closeBatch, undoBatch, UndoError,
};
