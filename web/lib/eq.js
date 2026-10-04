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

// Shrink a clear rate toward the circuit prior so thin samples can't top a
// leaderboard: shrunk = (clears + k·prior) / (starts + k), in percent units.
// prior is a 0–1 rate (default 0.5), k is pseudo-rounds of prior weight.
export function shrunkClear(clears, starts, prior = 0.5, k = 10) {
  const c = Number(clears) || 0, n = Number(starts) || 0;
  const p = Math.max(0, Math.min(1, Number(prior) || 0));
  return (100 * (c + k * p)) / (n + k);
}

// Wilson score interval (95%) for clears/starts, returned as [lo, hi] in
// percent units. Honest uncertainty bars for leaderboard displays.
export function wilson(clears, starts, z = 1.96) {
  const n = Number(starts) || 0;
  if (n <= 0) return [0, 100];
  const c = Math.max(0, Math.min(n, Number(clears) || 0));
  const phat = c / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const mid = phat + z2 / (2 * n);
  const half = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return [
    Math.max(0, 100 * (mid - half) / denom),
    Math.min(100, 100 * (mid + half) / denom),
  ];
}

// Sample-confidence badge from round volume: [label, badgeKey].
// Mirrors the EI convention — under 5 rounds is Thin, over 15 is High.
export function confidenceBadge(starts) {
  const n = Number(starts) || 0;
  if (n < 5) return ['Thin', 'red'];
  if (n <= 15) return ['Medium', 'goldfill'];
  return ['High', 'green'];
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

// NOTE: per-round points live in lib/scoring.js rulePoints (reads live rules).
// The old Briefing §5 base × multiplier helper was removed with the full
// cutover (migration 039) — do not reintroduce hardcoded tables here.
