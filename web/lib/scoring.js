// Live scoring rules for methodology displays — NEVER hardcode numbers.
// Active version first, built-in v0.3 defaults when nothing is live, null
// when the API is unreachable (callers then hide the line, never guess).
import { getJSON } from './api.js';

export async function getRules() {
  try {
    const a = await getJSON('/scoring/active');
    if (a?.data?.params) return { meta: { version: a.data.version, season: a.data.season, label: a.data.label, activated_at: a.data.activated_at, live: true }, params: a.data.params };
  } catch { /* fall through to defaults */ }
  try {
    const d = await getJSON('/scoring/defaults');
    if (d?.data) return { meta: { version: null, season: null, label: 'v0.3 defaults', live: false }, params: d.data };
  } catch { /* API down */ }
  return null;
}

// One-line formula summary — series mode shows series scales, internal
// mode shows the placing-points breakdown, e.g. "clear 10 · double 5 · placing 5/4/3/2/1 · cap 20".
export function pointsLine(params) {
  if ((params?.mode || 'eqindex') === 'esnz') {
    const ez = params.esnz || {};
    const gp = (ez.scales?.grand_prix || []).join('/');
    const pr = (ez.scales?.premier || []).join('/');
    return `Series scales · GP ${gp || '–'} · Premier ${pr || '–'} · ${ez.scope === 'all_classes' ? 'all classes' : 'series classes only'}`;
  }
  const P = params?.points || {};
  const placing = Array.isArray(P.placing) ? P.placing.join('/') : '–';
  return `clear ${P.clear ?? '–'} · double ${P.doubleBonus ?? '–'} · placing ${placing} · cap ${P.classMax ?? '–'}`;
}

// Per-round points under the given rules (mirrors the DB trigger in
// migration 039). place 1–5 only; non-finishers score 0.
export function rulePoints({ place, clear, doubleClear, finished = true }, params) {
  if (!finished) return 0;
  const P = params?.points || {};
  const p = Number(place);
  const table = Array.isArray(P.placing) ? P.placing : [];
  const placing = p >= 1 && p <= table.length ? Number(table[p - 1]) || 0 : 0;
  const total = (clear ? Number(P.clear) || 0 : 0) + (doubleClear ? Number(P.doubleBonus) || 0 : 0) + placing;
  return Math.min(total, Number(P.classMax) || 20);
}

// "Points · v2" tag for table footnotes; legacy rows predate stamping.
export function rulesTag(meta) {
  if (!meta) return 'Points';
  return meta.live && meta.version != null ? `Points · v${meta.version}` : 'Points · defaults';
}
