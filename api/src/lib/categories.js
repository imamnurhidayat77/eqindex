// Rider category master keys — the vocabulary lives in the
// rider_categories table (Admin → Categories, migration 037).
// This module is the API-side helper: canonical-key validation with the seed
// list as fallback (pre-migration / table unreachable), plus mapping of
// legacy label values (pre-038 data, CSV input) to keys.

const SEED_KEYS = ['pro', 'young', 'junior', 'amateur', 'pony'];

// Legacy stored/CSV labels → master keys. Values with no fitting bucket
// (Under 25, Tertiary, Open) resolve to null: unmappable, admin sets the
// bucket explicitly (or creates one in Admin → Categories).
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

const norm = (s) => String(s || '').toLowerCase().trim();

// Resolve any input value to a master key, or null when unmappable.
// masterKeys: valid keys (from DB when available, SEED_KEYS otherwise).
function canonCategoryKey(value, masterKeys) {
  const v = norm(value);
  if (!v) return null;
  const keys = (masterKeys && masterKeys.length ? masterKeys : SEED_KEYS).map(norm);
  if (keys.includes(v)) return v; // already a master key
  const mapped = LEGACY_LABEL_TO_KEY[v];
  if (mapped && keys.includes(mapped)) return mapped;
  return null;
}

// Cached master keys from the DB (60s). Fail-open: seed keys when the table
// is missing/unreachable so imports and edits never hard-fail.
let keysCache = { t: 0, keys: null };
async function masterCategoryKeys(pool) {
  if (Date.now() - keysCache.t < 60 * 1000 && keysCache.keys) return keysCache.keys;
  try {
    const { rows } = await pool.query('SELECT key FROM rider_categories WHERE is_active');
    if (rows.length) keysCache = { t: Date.now(), keys: rows.map((r) => r.key) };
  } catch { /* pre-migration: fall through */ }
  return keysCache.keys || SEED_KEYS;
}
function bustCategoryKeys() { keysCache.t = 0; }

module.exports = { SEED_KEYS, LEGACY_LABEL_TO_KEY, canonCategoryKey, masterCategoryKeys, bustCategoryKeys };
