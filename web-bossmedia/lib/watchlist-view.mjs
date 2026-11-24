// Pure helpers for the watchlist page: section order, "N new" counts,
// card captions and the per-section last-seen store (localStorage).

export const SEEN_STORAGE_KEY = 'bm:watchlist-seen';

const time = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isNaN(t) ? 0 : t;
};

// Newest photo timestamp of a section, 0 when it has none.
export const latestAt = (photos) => photos.reduce((max, x) => Math.max(max, time(x.created_at)), 0);

// Sections with the most recent photo first; empty sections keep their
// original (followed-most-recently) order at the end.
export function sortSections(rows, shotsById) {
  return rows
    .map((w, i) => ({ w, i, at: latestAt(shotsById[w.id] || []) }))
    .sort((a, b) => b.at - a.at || a.i - b.i)
    .map((x) => x.w);
}

// Photos newer than the last visit. No previous visit = nothing is "new"
// (otherwise every first-time follow would light up).
export function countNew(photos, lastSeenMs) {
  if (!lastSeenMs) return 0;
  return photos.filter((x) => time(x.created_at) > lastSeenMs).length;
}

export const cardCaption = (x) => [x.rider, x.horse].filter(Boolean).join(' × ') || x.event_name || 'Untitled';

export const TYPE_LABEL = { event: 'Event', rider: 'Rider', horse: 'Horse', combination: 'Pair' };

// localStorage can throw (private mode, disabled storage) — the page must
// keep working, so failures read as "never seen" and writes are dropped.
export function readSeen(storage) {
  try {
    const v = JSON.parse(storage?.getItem(SEEN_STORAGE_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function writeSeen(storage, ids, nowMs) {
  try {
    const next = { ...readSeen(storage) };
    for (const id of ids) next[id] = nowMs;
    storage?.setItem(SEEN_STORAGE_KEY, JSON.stringify(next));
  } catch { /* storage unavailable: badges just reset next visit */ }
}
