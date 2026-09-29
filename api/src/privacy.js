// Privacy opt-out (migration 033) — mask opted-out rider/horse names for
// non-admin callers. Aggregates, points and partnerships are untouched; only
// DISPLAYED names become stable pseudonyms ("Rider 3F9A").
//
// Design notes:
// - Pseudonyms are deterministic (md5 of kind+id): stable across renders,
//   no extra storage, links/partnerships keep working via ids.
// - Slugs are nulled when masked (they embed the real name); clients fall
//   back to id-based URLs (existing `slug || id` pattern).
// - Admins always see real names (role check in the middleware below).
// - Fail-open: if migration 033 hasn't been applied yet, everything behaves
//   exactly as before instead of 500ing (deploy order: code first, migrate
//   right after — window stays safe).
const crypto = require('crypto');

function pseudo(kind, id) {
  const h = crypto.createHash('md5').update(`${kind}:${id}`).digest('hex').slice(0, 4).toUpperCase();
  return `${kind} ${h}`;
}

// Anonymity sets, refreshed at most once a minute. Opt-outs are rare, so a
// full-set refresh (2 tiny indexed queries) beats per-request lookups and
// keeps the anonymous GET cache meaningful.
const TTL_MS = 60 * 1000;
let cache = { t: 0, enabled: false, sets: undefined };

async function loadSets(pool) {
  const now = Date.now();
  if (cache.sets !== undefined && now - cache.t < TTL_MS) return cache;
  let next = { t: now, enabled: false, sets: null };
  try {
    const [r, h] = await Promise.all([
      pool.query(`SELECT id, normalized_name FROM riders WHERE visibility = 'anonymous'`),
      pool.query(`SELECT id, normalized_name FROM horses WHERE visibility = 'anonymous'`),
    ]);
    next.enabled = true;
    next.sets = {
      riderIds: new Set(r.rows.map((x) => x.id)),
      horseIds: new Set(h.rows.map((x) => x.id)),
      riderNorm: new Map(r.rows.map((x) => [x.normalized_name, x.id])),
      horseNorm: new Map(h.rows.map((x) => [x.normalized_name, x.id])),
    };
  } catch (e) {
    // Missing column = migration not applied yet → stay all-public.
    if (!/visibility/i.test(e.message || '')) throw e;
    next = { t: now, enabled: false, sets: null };
  }
  cache = next;
  return cache;
}

function bustPrivacyCache() { cache.t = 0; }

// ---- entity-row masking (detail endpoints call these explicitly) ----
function maskRiderRow(row, sets) {
  if (!row || !sets || !sets.riderIds.has(row.id)) return row;
  row.name = pseudo('Rider', row.id);
  row.slug = null;
  row.first_name = null;
  row.last_name = null;
  row.bio = null;
  row.image_url = null;
  row.is_anonymous = true;
  return row;
}

function maskHorseRow(row, sets) {
  if (!row || !sets || !sets.horseIds.has(row.id)) return row;
  row.name = pseudo('Horse', row.id);
  row.slug = null;
  row.image_url = null;
  row.owner_name = null;
  row.is_anonymous = true;
  return row;
}

// ---- generic walker for stat/ranking/history/standings rows ----
function applySets(body, sets) {
  const walk = (node) => {
    if (Array.isArray(node)) { for (const x of node) walk(x); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.rider === 'string' && typeof node.rider_id === 'string'
        && sets.riderIds.has(node.rider_id)) {
      node.rider = pseudo('Rider', node.rider_id);
      if ('rider_slug' in node) node.rider_slug = null;
      node.rider_anonymous = true;
    }
    if (typeof node.horse === 'string' && typeof node.horse_id === 'string'
        && sets.horseIds.has(node.horse_id)) {
      node.horse = pseudo('Horse', node.horse_id);
      if ('horse_slug' in node) node.horse_slug = null;
      node.horse_anonymous = true;
    }
    // series standings keep names as scraped text (no ids) — match via the
    // stored normalized columns against indexed normalized_name.
    if (typeof node.rider_name === 'string' && typeof node.normalized_rider === 'string') {
      const id = sets.riderNorm.get(node.normalized_rider);
      if (id) { node.rider_name = pseudo('Rider', id); node.rider_anonymous = true; }
    }
    if (typeof node.horse_name === 'string' && typeof node.normalized_horse === 'string') {
      const id = sets.horseNorm.get(node.normalized_horse);
      if (id) { node.horse_name = pseudo('Horse', id); node.horse_anonymous = true; }
    }
    // watchlist labels: combination is a single "Horse × Rider" string,
    // single-entity items carry the raw name in `name`.
    if (typeof node.name === 'string') {
      if (node.entity_type === 'combination'
          && typeof node.horse_id === 'string' && typeof node.rider_id === 'string') {
        const parts = node.name.split(' × ');
        if (parts.length === 2) {
          let anon = false;
          if (sets.horseIds.has(node.horse_id)) { parts[0] = pseudo('Horse', node.horse_id); anon = true; }
          if (sets.riderIds.has(node.rider_id)) { parts[1] = pseudo('Rider', node.rider_id); anon = true; }
          if (anon) { node.name = parts.join(' × '); node.combination_anonymous = true; }
        }
      } else if (node.entity_type === 'horse'
          && typeof node.horse_id === 'string' && sets.horseIds.has(node.horse_id)) {
        node.name = pseudo('Horse', node.horse_id);
        node.horse_anonymous = true;
      } else if (node.entity_type === 'rider'
          && typeof node.rider_id === 'string' && sets.riderIds.has(node.rider_id)) {
        node.name = pseudo('Rider', node.rider_id);
        node.rider_anonymous = true;
      }
    }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(body);
  return body;
}

// Fast pre-scan: skip the DB entirely when the body has no maskable shape.
function hasCandidates(body) {
  let found = false;
  const scan = (node) => {
    if (found) return;
    if (Array.isArray(node)) { for (const x of node) { scan(x); if (found) return; } return; }
    if (!node || typeof node !== 'object') return;
    if ((typeof node.rider_id === 'string' && typeof node.rider === 'string')
        || (typeof node.horse_id === 'string' && typeof node.horse === 'string')
        || (typeof node.rider_name === 'string' && typeof node.normalized_rider === 'string')
        || (typeof node.horse_name === 'string' && typeof node.normalized_horse === 'string')
        || (typeof node.name === 'string' && typeof node.entity_type === 'string')) { found = true; return; }
    for (const k of Object.keys(node)) { scan(node[k]); if (found) return; }
  };
  scan(body);
  return found;
}

async function maskResponse(pool, body) {
  if (!body || typeof body !== 'object' || !hasCandidates(body)) return body;
  const { enabled, sets } = await loadSets(pool);
  if (!enabled) return body;
  return applySets(body, sets);
}

async function privacySets(pool) {
  const { enabled, sets } = await loadSets(pool);
  return enabled ? sets : null;
}

module.exports = {
  pseudo, maskResponse, maskRiderRow, maskHorseRow, privacySets,
  bustPrivacyCache,
  privacyEnabled: async (pool) => (await loadSets(pool)).enabled,
};
