// EQ scoring + derived badges. Formula is transparent and documented:
// base 45 + clear% weight + fault penalty + experience bonus, clamped 0–99.
export function eqScore(clearPct, avgFaults, starts) {
  const v = 45 + Number(clearPct) * 0.5 - Number(avgFaults) * 2.5
    + Math.min(Number(starts), 20) * 0.3;
  return Math.max(0, Math.min(99, Math.round(v)));
}

// Trend badge from last-5-starts clear% vs overall clear%.
export function trendBadge(overallClear, recentRows) {
  if (!recentRows || !recentRows.length) return ['Stable', 'gray'];
  const n = recentRows.length;
  const last5 = 100 * recentRows.filter((r) => r.clear_round).length / n;
  const diff = last5 - Number(overallClear);
  if (diff > 5) return ['Improving', 'goldfill'];
  if (diff < -5) return ['Declining', 'red'];
  if (Number(overallClear) >= 80 && n <= 5) return ['Rising', 'green'];
  return ['Stable', 'gray'];
}

export function consistencyPts(stddev) {
  if (stddev === null || stddev === undefined) return null;
  return Math.max(0, Math.round(100 - Math.min(70, Number(stddev) * 12)));
}

// Composite field/event strength 5–99 from clear% and average faults.
export function fieldScore(clearPct, avgFaults) {
  const v = 70 + (Number(clearPct) - 35) * 0.5 - (Number(avgFaults) - 4) * 5;
  return Math.max(5, Math.min(99, Math.round(v)));
}

export function strengthLabel(score) {
  if (score >= 75) return 'Elite';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  return 'Developing';
}

export function ordinal(n) {
  if (n === null || n === undefined) return '–';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Briefing §5 points preview (mirrors SQL brief_points): base × multiplier.
export function briefPoints(place, classType = 'Standard') {
  const p = Number(place);
  if (!p || p < 1 || p > 10) return 0;
  const base = [12, 9, 7, 6, 5, 4, 3, 2, 1, 1][p - 1];
  const mult = { 'Grand Prix': 2.0, Premier: 1.5, Open: 1.25, Amateur: 0.75, Pony: 0.75 }[classType] ?? 1.0;
  return Math.max(0, Math.round(base * mult));
}
