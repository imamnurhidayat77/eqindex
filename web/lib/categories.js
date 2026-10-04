// Category option lists — derived ONLY from the rider_categories master
// table (Admin → Categories, GET /categories or /admin/categories).
// Never hardcode category names here; the admin owns the vocabulary.
// Stored values are master KEYs (migration 038).

// Legacy fallback when the API is unreachable: the seed buckets from
// migration 037. Clearly marked — real lists always come from the master.
export const FALLBACK_CATS = [
  { key: 'pro', title: 'Best Pro Rider', label: 'Pro Rider' },
  { key: 'young', title: 'Best Young Rider', label: 'Young Rider' },
  { key: 'junior', title: 'Best Junior Rider', label: 'Junior Rider' },
  { key: 'amateur', title: 'Best Amateur', label: 'Amateur' },
  { key: 'pony', title: 'Best Pony Rider', label: 'Pony Rider' },
];

// Options for selects storing a master key: [{ value: key, label }].
// Unknown stored values (deleted bucket) still render so saved data is
// never invisible in the form.
export function keyOptions(cats, current = null) {
  const list = (cats && cats.length ? cats : FALLBACK_CATS)
    .map((c) => ({ value: c.key, label: c.label || c.title || c.key }));
  if (current && !list.some((o) => o.value === current)) {
    list.push({ value: current, label: `${current} (removed)` });
  }
  return list;
}

// Human label for a stored key (table cells, pills).
export function keyLabel(cats, key) {
  if (!key) return '—';
  const c = (cats && cats.length ? cats : FALLBACK_CATS).find((x) => x.key === key);
  return c ? (c.label || c.title || c.key) : key;
}

// Backwards-compat shim for old ?series= URLs and legacy stored values.
// Option LISTS never use this — only to resolve an incoming string to a key.
const LEGACY_LABEL_TO_KEY = {
  junior: 'junior',
  'junior rider': 'junior',
  'young rider': 'young',
  amateur: 'amateur',
  pony: 'pony',
  'pony rider': 'pony',
  pro: 'pro',
  'pro rider': 'pro',
};

export function resolveKey(cats, value) {
  const v = String(value || '').toLowerCase().trim();
  if (!v) return '';
  const list = cats && cats.length ? cats : FALLBACK_CATS;
  const byKey = list.find((x) => x.key.toLowerCase() === v);
  if (byKey) return byKey.key;
  const byLabel = list.find((x) => String(x.label || x.title || '').toLowerCase() === v);
  if (byLabel) return byLabel.key;
  return LEGACY_LABEL_TO_KEY[v] && list.some((x) => x.key === LEGACY_LABEL_TO_KEY[v])
    ? LEGACY_LABEL_TO_KEY[v] : '';
}
