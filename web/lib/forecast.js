// Form forecasting + recommendations. All models are transparent, documented,
// and derived ONLY from observed rounds — no fabricated signals.
//
// projectForm: weighted least-squares trend (weight = starts per period) over
//   chronological monthly EQ/clear/faults, projected one period ahead.
// recommendHeight: picks the highest-volume band with clear% >= 60 as optimal,
//   and flags the next band up as stretch goal when optimal clear% >= 70.
// matchupEdge: reads EQ gap + sample size into a favored side + confidence.
// suggestPartners: ranks unridden horses by EQ penalised for height-class
//   distance from the rider's proven best height (exploratory fit, not destiny).

function wlinreg(ys, ws) {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const W = ws.reduce((s, w) => s + w, 0) || 1;
  const mx = xs.reduce((s, x, i) => s + x * ws[i], 0) / W;
  const my = ys.reduce((s, y, i) => s + y * ws[i], 0) / W;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += ws[i] * (xs[i] - mx) * (ys[i] - my);
    den += ws[i] * (xs[i] - mx) * (xs[i] - mx);
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx, mean: my };
}

export function projectForm(monthly) {
  const pts = (monthly || []).filter((m) => Number(m.starts) > 0);
  const totalStarts = pts.reduce((s, m) => s + Number(m.starts), 0);
  if (pts.length < 3 || totalStarts < 6) {
    return null; // honest: not enough signal to project
  }
  const ws = pts.map((m) => Number(m.starts));
  const eqR = wlinreg(pts.map((m) => Number(m.eq)), ws);
  const clR = wlinreg(pts.map((m) => Number(m.clear)), ws);
  const faR = wlinreg(pts.map((m) => Number(m.faults)), ws);
  const nx = pts.length; // one period ahead
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
  const eq = clamp(eqR.intercept + eqR.slope * nx, 0, 99);
  const clear = clamp(clR.intercept + clR.slope * nx, 0, 100);
  const faults = Math.max(0, Math.round((faR.intercept + faR.slope * nx) * 100) / 100);
  const direction = eqR.slope > 1.5 ? 'up' : eqR.slope < -1.5 ? 'down' : 'flat';
  const confidence = pts.length >= 5 && totalStarts >= 15 ? 'High'
    : pts.length >= 3 && totalStarts >= 8 ? 'Medium' : 'Low';
  return { eq, clear, faults, slope: Math.round(eqR.slope * 10) / 10, direction, confidence, periods: pts.length, starts: totalStarts };
}

export function recommendHeight(bands) {
  const bs = (bands || []).filter((b) => Number(b.rounds) > 0)
    .sort((a, b) => Number(a.cm) - Number(b.cm));
  if (!bs.length) return null;
  const eligible = bs.filter((b) => Number(b.rounds) >= 2 && Number(b.clear) >= 60);
  const optimal = eligible.sort((a, b) => Number(b.rounds) - Number(a.rounds))[0]
    || [...bs].sort((a, b) => Number(b.clear) - Number(a.clear))[0];
  const idx = bs.indexOf(optimal);
  const next = bs[idx + 1] || null;
  const stretch = next && Number(optimal.clear) >= 70 ? next : null;
  return { optimal, stretch };
}

export function matchupEdge(aEQ, bEQ, aStarts, bStarts) {
  const gap = Number(aEQ) - Number(bEQ);
  const minStarts = Math.min(Number(aStarts), Number(bStarts));
  if (Math.abs(gap) < 3) return { favored: 'Even', edge: 0, confidence: 'Low', line: 'Too close to call' };
  const confidence = Math.abs(gap) >= 8 && minStarts >= 8 ? 'High'
    : Math.abs(gap) >= 5 || minStarts >= 5 ? 'Medium' : 'Low';
  const side = gap > 0 ? 'A' : 'B';
  return {
    favored: side, edge: Math.abs(Math.round(gap)), confidence,
    line: `${side} favored by ${Math.abs(Math.round(gap))} EQ`,
  };
}

export function suggestPartners({ riddenIds = [], riderBestCm = null, horses = [] }) {
  const ridden = new Set(riddenIds);
  return horses
    .filter((h) => !ridden.has(h.id) && Number(h.starts) >= 3)
    .map((h) => {
      const dist = riderBestCm && h.bestCm
        ? Math.abs(Number(h.bestCm) - Number(riderBestCm)) : 30;
      const fit = Math.round(Number(h.eq) - dist * 0.8);
      return { ...h, heightGap: Math.round(dist), fit };
    })
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 3);
}
