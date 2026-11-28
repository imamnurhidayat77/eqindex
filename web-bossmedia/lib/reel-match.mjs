// Which library reels fit a pre-book order: same event and same horse first,
// so the admin does not send the wrong rider's cut. Pure for node --test.

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// 'both' | 'event' | 'horse' | null
export function reelMatch(reel, order) {
  const event = !!order.event_id && reel.event_id === order.event_id;
  const horse = !!norm(order.horse_name) && norm(reel.horse) === norm(order.horse_name);
  if (event && horse) return 'both';
  if (event) return 'event';
  if (horse) return 'horse';
  return null;
}

const RANK = { both: 0, horse: 1, event: 2 };

// Matching reels only, best match first, newest first within a rank.
export function suggestedReels(reels, order) {
  const seen = new Set();
  return reels
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .map((r) => ({ r, m: reelMatch(r, order) }))
    .filter((x) => x.m)
    .sort((a, b) => RANK[a.m] - RANK[b.m] || String(b.r.created_at).localeCompare(String(a.r.created_at)))
    .map((x) => ({ ...x.r, match: x.m }));
}

export const MATCH_LABEL = { both: 'Same event and horse', event: 'Same event', horse: 'Same horse' };

// Pre-book queue search: every word must appear in one of the order's fields.
const ORDER_FIELDS = ['product_name', 'buyer_email', 'phone', 'horse_name', 'event_name', 'class_name', 'ring', 'back_number'];
export function orderMatches(order, term) {
  const words = norm(term).split(' ').filter(Boolean);
  if (!words.length) return true;
  const text = norm(ORDER_FIELDS.map((f) => order[f]).filter((v) => v != null).join(' '));
  return words.every((w) => text.includes(w));
}
