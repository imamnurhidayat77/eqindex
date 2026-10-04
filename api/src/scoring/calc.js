// EQIndex scoring engine (Charles v0.3) — PURE functions, no DB, no I/O.
// All numbers come from the active scoring_versions.params (rules); this file
// implements mechanics only, so admin can change every value without code.
// Sections reference the v0.3 document.

function divisionFor(heightCm, isWorldCup, rules) {
  if (isWorldCup) return 'world_cup';
  if (heightCm === null || heightCm === undefined || Number.isNaN(Number(heightCm))) return null;
  const h = Number(heightCm);
  const div = (rules.divisions || []).find((d) =>
    (d.min === null || d.min === undefined || h >= d.min) &&
    (d.max === null || d.max === undefined || h < d.max));
  return div ? div.key : null;
}

// §10: clear + double bonus + placing, capped per format.
function classPoints({ clear, doubleClear, place, twoPhase = false, oneRound = false }, points) {
  const P = points || {};
  const placingTable = Array.isArray(P.placing) ? P.placing : [5, 4, 3, 2, 1];
  let total = (clear ? (P.clear ?? 10) : 0)
    + (doubleClear ? (P.doubleBonus ?? 5) : 0)
    + ((place >= 1 && place <= placingTable.length) ? placingTable[place - 1] : 0);
  const cap = twoPhase ? (P.twoPhaseMax ?? 15) : oneRound ? (P.singleRoundMax ?? 15) : (P.classMax ?? 20);
  return Math.min(total, cap);
}

// §12: sum the N highest class scores. Returns { total, counted }.
function bestTen(scores, n = 10) {
  const top = [...(scores || [])].sort((a, b) => b - a).slice(0, Math.max(0, n));
  return { total: top.reduce((s, v) => s + v, 0), counted: top.length };
}

// §7: status routes over chronological starts [{ division, clear }].
// Returns the highest division key qualified, or null.
function assessStatus(starts, rules, divisionRank) {
  const S = rules.status || {};
  const clearN = S.clearRoute ?? 2, consecN = S.consecutiveRoute ?? 3;
  const partTop = S.participationTop ?? 6, partWin = S.participationWindow ?? 10;
  const rank = divisionRank || {};
  const divs = [...new Set((starts || []).map((s) => s.division).filter(Boolean))];
  const qualified = divs.filter((div) => {
    const inDiv = starts.filter((s) => s.division === div);
    // Route 1 — clear performance: last `clearN` starts within the division
    // are all clears (other-division starts between don't break the sequence,
    // a non-clear inside the division does).
    const lastClears = inDiv.slice(-clearN);
    if (lastClears.length >= clearN && lastClears.every((s) => s.clear)) return true;
    // Route 2 — consecutive participation: last `consecN` starts overall.
    const tail = starts.slice(-consecN);
    if (tail.length >= consecN && tail.every((s) => s.division === div)) return true;
    // Route 3 — recent participation: >= partTop of last partWin overall.
    if (starts.length >= partWin) {
      const win = starts.slice(-partWin);
      if (win.filter((s) => s.division === div).length >= partTop) return true;
    }
    return false;
  });
  qualified.sort((a, b) => (rank[b] ?? 0) - (rank[a] ?? 0));
  return qualified[0] || null;
}

// §9: one star per clear class; doubles upgrade (count once).
function starsFor(clears) {
  const out = {};
  for (const c of clears || []) {
    if (!c || !c.division) continue;
    (out[c.division] ||= { stars: 0, doubles: 0 });
    out[c.division].stars += 1;
    if (c.doubleClear) out[c.division].doubles += 1;
  }
  return out;
}

// §13: qualifying clears ÷ eligible starts, unrounded calc.
function clearPct(clears, starts) {
  const den = Math.max(0, Number(starts) || 0);
  const num = Math.max(0, Math.min(Number(clears) || 0, den));
  return { pct: den ? (100 * num) / den : 0, num, den };
}

// §13 awards: highest status division with >= minStarts; late promotion keeps
// lower-division eligibility when the higher level has < minStarts.
function awardDivision(statusDiv, startsByDiv, minStarts = 10, rank = {}) {
  const eligible = Object.entries(startsByDiv || {})
    .filter(([, n]) => Number(n) >= minStarts)
    .map(([d]) => d)
    .sort((a, b) => (rank[b] ?? 0) - (rank[a] ?? 0));
  if (statusDiv && Number(startsByDiv?.[statusDiv]) >= minStarts) return statusDiv;
  if (statusDiv && !eligible.includes(statusDiv)) {
    // Below threshold at the higher level: stay eligible below.
    const below = eligible.filter((d) => (rank[d] ?? 0) < (rank[statusDiv] ?? 0));
    if (below.length) return below[0];
    return eligible[0] || null;
  }
  return eligible[0] || null;
}

// Category match by class name/type (riders carry no category yet, §5).
// First matching category wins; used by Weekend Best + searchable labels.
function matchCategory(cls, cats) {
  const name = String(cls.name || cls.class_name || '').toLowerCase();
  const type = String(cls.class_type || cls.type || '');
  for (const c of cats || []) {
    const inTypes = (c.classTypes || []).includes(type);
    const inName = (c.nameContains || []).some((s) => name.includes(String(s).toLowerCase()));
    if (!inTypes && !inName) continue;
    const excluded = (c.excludeName || []).some((s) => name.includes(String(s).toLowerCase()));
    if (!excluded) return c;
  }
  return null;
}

module.exports = { divisionFor, classPoints, bestTen, assessStatus, starsFor, clearPct, awardDivision, matchCategory };
