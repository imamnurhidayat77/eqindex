// Import Assistant review table: group mapped records by class and work out
// which rows need a human look. Pure (no React) so it is unit-tested.

export const ISSUE_LABELS = {
  ungrounded: 'name not in source',
  failed: 'failed validation',
  no_series: 'series class, no series_key',
  placing: 'check placings',
  similar_horse: 'similar horse exists',
  similar_rider: 'similar rider exists',
};
// Neutral facts from the dry-run: shown as badges, never counted as issues
// (a new show is full of new horses — flagging them hid the real problems).
export const INFO_LABELS = { new_horse: 'new horse', new_rider: 'new rider', new_class: 'new class' };

const isFinished = (r) => (r.status || 'finished') === 'finished';
const sameText = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

// Standard competition ranking: each sorted placing repeats the previous one
// (a tie) or equals its position. 1,1,3 is fine; 1,2,4 and 1,1,2 are not.
// Mirrors placingWarnings in api/src/lib/assist.js.
export function placingsLookWrong(places) {
  return oddPlacings(places).length > 0;
}
// Positions (into `places`) that break the ranking — only these rows get the
// warning, so one gap does not flag a whole 190-row class.
export function oddPlacings(places) {
  const order = places.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  return order.filter(([p], k) => p !== k + 1 && p !== order[k - 1]?.[0]).map(([, i]) => i);
}

// Failed dry-run rows grouped by error message, most frequent first:
// [{ message, count, indexes: Set(record index) }].
export function failureSummary(preview) {
  const byMessage = new Map();
  for (const r of preview?.rows || []) {
    if (r.ok) continue;
    for (const message of r.errors?.length ? r.errors : ['failed']) {
      if (!byMessage.has(message)) byMessage.set(message, { message, count: 0, indexes: new Set() });
      const m = byMessage.get(message);
      m.count++;
      m.indexes.add(r.line - 1);
    }
  }
  return [...byMessage.values()].sort((a, b) => b.count - a.count);
}
export const DUPLICATE_ERROR = 'duplicate of an existing round';

// records: analysis.records. preview: the latest dry-run for THESE records
// (rows carry 1-based `line` = record index + 1), or null.
// Returns [{ key, name, date, rows: [{ index, record, result, issues, info }], issueCount, failedCount }].
export function reviewGroups(records, preview) {
  const results = new Map((preview?.rows || []).map((r) => [r.line - 1, r]));
  const blocking = new Set((preview?.summary?.series_blocking || []).map((b) => b.name));
  const groups = new Map();
  (records || []).forEach((record, index) => {
    const key = `${record.class_name || ''}|${record.class_date || ''}`;
    if (!groups.has(key)) groups.set(key, { key, name: record.class_name || '', date: record.class_date || '', rows: [] });
    const result = results.get(index) || null;
    const issues = [], info = [];
    if (record.ungrounded?.length) issues.push('ungrounded');
    if (result && !result.ok) issues.push('failed');
    if (blocking.has(record.class_name) && !record.series_key) issues.push('no_series');
    if (result?.ok) {
      // A suggestion already taken (name now equals it) is no longer an issue.
      for (const [f, field] of [['similar_horse', 'horse_name'], ['similar_rider', 'rider_name']]) {
        const sim = result.preview?.[f];
        if (sim && sameText(sim.name, record[field]) === false) issues.push(f);
      }
      for (const f of Object.keys(INFO_LABELS)) if (result.preview?.[f]) info.push(f);
    }
    groups.get(key).rows.push({ index, record, result, issues, info });
  });
  return [...groups.values()].map((g) => {
    const placed = g.rows.filter((row) => isFinished(row.record) && parseInt(row.record.placing, 10) >= 1);
    for (const i of oddPlacings(placed.map((row) => parseInt(row.record.placing, 10)))) placed[i].issues.push('placing');
    return {
      ...g,
      issueCount: g.rows.filter((row) => row.issues.length).length,
      failedCount: g.rows.filter((row) => row.issues.includes('failed')).length,
    };
  });
}

// New analysis with replaced records and recounted stats (edit/delete).
export function withRecords(analysis, records) {
  return {
    ...analysis,
    records,
    stats: { ...analysis.stats, rounds: records.length, with_series: records.filter((r) => r.series_key).length },
  };
}
