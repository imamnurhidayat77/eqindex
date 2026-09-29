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

module.exports = { paging, numOrNull };
