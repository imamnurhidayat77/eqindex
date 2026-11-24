// Drops later items whose `id` was already seen, keeping first-seen order.
// The watchlist flattens several followed subjects into one lightbox list,
// and the same photo can belong to more than one subject.
export function uniqueById(items) {
  const seen = new Set();
  return items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}
