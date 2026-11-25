// Import Assistant review table: group mapped records by class and work out
// which rows need a human look. Pure (no React) so it is unit-tested.

export const ISSUE_LABELS = {
  ungrounded: 'name not in source',
  failed: 'failed validation',
  no_series: 'series class, no series_key',
  placing: 'check placings',
  new_horse: 'new horse',
  new_rider: 'new rider',
  new_class: 'new class',
  similar_horse: 'similar horse exists',
  similar_rider: 'similar rider exists',
};

const isFinished = (r) => (r.status || 'finished') === 'finished';

// Standard competition ranking: each sorted placing repeats the previous one
// (a tie) or equals its position. 1,1,3 is fine; 1,2,4 and 1,1,2 are not.
// Mirrors placingWarnings in api/src/lib/assist.js.
export function placingsLookWrong(places) {
  const s = [...places].sort((a, b) => a - b);
  return s.some((p, i) => p !== i + 1 && p !== s[i - 1]);
}

// records: analysis.records. preview: the latest dry-run for THESE records
// (rows carry 1-based `line` = record index + 1), or null.
// Returns [{ key, name, date, rows: [{ index, record, result, issues }], issueCount }].
export function reviewGroups(records, preview) {
  const results = new Map((preview?.rows || []).map((r) => [r.line - 1, r]));
  const blocking = new Set((preview?.summary?.series_blocking || []).map((b) => b.name));
  const groups = new Map();
  (records || []).forEach((record, index) => {
    const key = `${record.class_name || ''}|${record.class_date || ''}`;
    if (!groups.has(key)) groups.set(key, { key, name: record.class_name || '', date: record.class_date || '', rows: [] });
    const result = results.get(index) || null;
    const issues = [];
    if (record.ungrounded?.length) issues.push('ungrounded');
    if (result && !result.ok) issues.push('failed');
    if (blocking.has(record.class_name) && !record.series_key) issues.push('no_series');
    if (result?.ok) {
      for (const f of ['new_horse', 'new_rider', 'new_class', 'similar_horse', 'similar_rider']) if (result.preview?.[f]) issues.push(f);
    }
    groups.get(key).rows.push({ index, record, result, issues });
  });
  return [...groups.values()].map((g) => {
    const placed = g.rows.filter((row) => isFinished(row.record) && parseInt(row.record.placing, 10) >= 1);
    if (placingsLookWrong(placed.map((row) => parseInt(row.record.placing, 10)))) {
      for (const row of placed) row.issues.push('placing');
    }
    return { ...g, issueCount: g.rows.filter((row) => row.issues.length).length };
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
