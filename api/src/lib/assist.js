// Shared Import Assistant builders (used by the chat route and the
// background job runner — one definition, no drift between the two).
const pool = require('../db');
const { autoTagRecords } = require('./seriesKeys');

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

// Load this admin's remembered series mappings: [{pattern, series_key}].
async function loadSeriesMap(userId) {
  if (!userId) return [];
  try {
    const { rows } = await pool.query(
      'SELECT key, value FROM assistant_memory WHERE user_id = $1 AND kind = $2',
      [userId, 'series_map']);
    return rows
      .map((r) => ({ pattern: String(r.key || '').toLowerCase(), series_key: r.value?.series_key }))
      .filter((m) => m.pattern && m.series_key);
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
function mapResultToReply({ records, dropped, prose, truncated, filename, tagged }) {
  for (const r of records) delete r.start_order;
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
  if (tagged) warnings.push(`${tagged} row(s) tagged from your remembered series mappings`);
  warnings.push(...analysis.warnings);
  const noSeries = records.filter((r) => !r.series_key).length;
  return {
    reply: `Mapped ${records.length} rounds from ${filename || 'your text'}${dropped ? ` (${dropped} dropped)` : ''}${tagged ? ` (${tagged} series-tagged from memory)` : ''}. ${noSeries ? `${noSeries} have no series — tell me which classes are series classes (e.g. "class 9 is pro-am") and I'll tag them. ` : ''}Review below, then validate & commit — nothing saved yet.`,
    analysis: { ...analysis, warnings },
  };
}

module.exports = { summarizeAssist, loadSeriesMap, applySeriesMap, mapResultToReply };
