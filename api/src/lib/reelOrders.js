// Rules for the reel file linked to a pre-book order. Pure, so it is unit tested.
// The buyer's download follows reel_orders.media_id, so once an order is ready
// or delivered the file may be swapped for a new version but never removed,
// and a cancelled order is locked.
function reelMediaError(status, mediaId) {
  if (status === 'cancelled') return 'a cancelled order cannot change its reel';
  if (!mediaId && ['ready', 'delivered'].includes(status)) return 'this order needs a reel: change it to another reel instead of removing it';
  return null;
}

// Buyer wording when a delivered reel is replaced with a new version.
function reelUpdatedCopy(o) {
  const what = [o.product_name, o.horse_name].filter(Boolean).join(' of ') || 'pre-book reel';
  return {
    title: 'Your reel was updated',
    body: `We sent a new version of your ${what}${o.event_name ? ` from ${o.event_name}` : ''}. Download it again from My media to get the latest cut.`,
  };
}

module.exports = { reelMediaError, reelUpdatedCopy };
