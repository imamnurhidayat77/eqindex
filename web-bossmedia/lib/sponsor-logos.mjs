// Buyer sponsor picking: up to MAX logos per photo (backend resolveLogoIds
// accepts 1–8). Rows shrink by count (1 / 2 / 3–4 / 5–8); overlay variants
// place one badge per corner up to 4, then collapse the rest into a single
// row badge at the first position — no overlap, no silent drops. Pure
// helper so node --test covers it.
export const MAX_SPONSOR_LOGOS = 8;

// Toggle one logo in the selection. Returns { ids, added, full }:
// - already picked → removed (added false)
// - new + room → appended (added true)
// - new + full → unchanged (full true, caller toasts)
export function toggleLogoIds(list, id, max = MAX_SPONSOR_LOGOS) {
  const cur = Array.isArray(list) ? list : [];
  const key = String(id);
  if (cur.includes(key)) return { ids: cur.filter((x) => x !== key), added: false, full: false };
  if (cur.length >= max) return { ids: cur, added: false, full: true };
  return { ids: [...cur, key], added: true, full: false };
}

// Buyer tag overrides for ONE design (096: class/subject, 097: result
// text): shown in this design only, canonical row untouched.
// Canonical-normalized key so "same design" comparisons (cart key, owned
// guard) stay in sync.
export function designTagsSig(t) {
  if (!t) return '';
  return `${t.class_name || ''}|${t.subject || ''}|${t.result || ''}`;
}

// Winner gating from the result text itself — no separate checkbox.
// Canonical win moments bypass this (the photo is already tagged win).
// "Clear", "2nd", debut-style results keep winner templates hidden.
export function isWinningResult(s) {
  return /^\s*(1st|winner|win\b|champion|gold|1(\s|$|-))/i.test(String(s || '').trim());
}

// Draft shape shared by TagEditor, LogoModal and the saved design.
// Old drafts carrying won:true (no result field) keep working: they read
// back as the default winner word instead of silently losing the gate.
export function normalizeTagDraft(t) {
  const result = String(t?.result || '').trim().slice(0, 40);
  return {
    class: String(t?.class || '').trim().slice(0, 100),
    result: result || (t?.won ? 'Winner' : ''),
  };
}
