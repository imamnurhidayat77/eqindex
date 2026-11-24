// Unit: lib/cart.js key contract (offline, localStorage stubbed).
// The cart key shape is load-bearing: CartClient matches items on
// mediaId + tierId + logo set, and payAll splits on kind/mediaId/tierId.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { readCart, addToCart, removeFromCart, clearCart, cartCount, markCartPending, settleCartPending } =
  await import('../lib/cart.js');

const media = (over = {}) => ({
  key: 'media:m1:t1', kind: 'media', priceCents: 3500,
  mediaId: 'm1', tierId: 't1', ...over,
});

test('addToCart dedupes by key, removeFromCart drops one row', () => {
  clearCart();
  addToCart(media());
  addToCart(media()); // same key → ignored
  assert.equal(readCart().length, 1);
  addToCart(media({ key: 'media:m1:t2', tierId: 't2' }));
  assert.equal(readCart().length, 2);
  assert.equal(cartCount(), 2);
  removeFromCart('media:m1:t1');
  assert.deepEqual(readCart().map((x) => x.key), ['media:m1:t2']);
  clearCart();
  assert.equal(readCart().length, 0);
});

test('logo design is part of the key so plain vs design never collide', () => {
  clearCart();
  addToCart(media());
  addToCart(media({ key: 'media:m1:t1:logos:9:banner-wave', logoIds: ['9'], logoTemplate: 'banner-wave' }));
  assert.equal(readCart().length, 2);
  clearCart();
});

test('readCart survives corrupt storage', () => {
  store.set('bossmedia:cart', 'not-json{{{');
  assert.deepEqual(readCart(), []);
  assert.equal(cartCount(), 0);
  store.delete('bossmedia:cart');
});

test('reel payload rows keep kind=reel for the payAll split', () => {
  clearCart();
  addToCart({ key: 'reel:p1:ev1:abc', kind: 'reel', priceCents: 9900, reelPayload: { product_id: 'p1' } });
  const [row] = readCart();
  assert.equal(row.kind, 'reel');
  assert.ok(row.reelPayload && row.reelPayload.product_id === 'p1');
  const photoItems = readCart().filter((it) => it.kind !== 'reel' && it.mediaId && it.tierId);
  assert.equal(photoItems.length, 0);
  clearCart();
});

test('cart keeps items through Stripe until the purchase is paid', () => {
  clearCart();
  addToCart(media());
  addToCart(media({ key: 'media:m2:t1', mediaId: 'm2' }));
  markCartPending(['p1'], ['media:m1:t1']);
  // Cancelled on Stripe: nothing settles, cart is still full.
  assert.equal(readCart().length, 2);
  // An unrelated paid purchase must not empty this cart.
  assert.equal(settleCartPending(['other']), false);
  assert.equal(readCart().length, 2);
  // Paid: only the items of that checkout leave.
  assert.equal(settleCartPending(['p1']), true);
  assert.deepEqual(readCart().map((x) => x.key), ['media:m2:t1']);
  assert.equal(settleCartPending(['p1']), false);
  clearCart();
});
