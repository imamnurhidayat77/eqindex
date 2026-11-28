// Unit: merch quote (estimate only, checkout re-quotes server-side).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BACK_PREMIUM_CENTS, RIDER_MODELS, SHIFT_MAX, SHIFT_MIN, SPONSOR_DISCOUNT_CENTS, buildHoverTargets, canonicalFit, clampLogoOffset, clampShift, clampSpin, fitLogoInSlot, slotFrame, slotShiftLimits, slotSizeUnits, snapSpin, isMerchColor, isMerchSize, isUploadSlot, merchPositions, merchModel, merchProduct, merchProductData, merchProducts, merchCutoutSrc, newMerchProductDraft, parseMerchProduct, quoteMerch, riderModelFile, isHorseProduct, setMerchCatalog } from '../lib/merch.mjs';

test('unknown product returns null', () => {
  assert.equal(quoteMerch('nope', {}), null);
  assert.equal(merchProduct('nope'), null);
});

test('empty slots = base price, no discount', () => {
  const q = quoteMerch('jacket', {});
  assert.equal(q.baseCents, 14900);
  assert.equal(q.totalCents, 14900);
  assert.equal(q.filled, 0);
});

test('each sponsor logo discounts, back adds premium', () => {
  const q = quoteMerch('jacket', { 'chest-left': 'a', 'chest-right': 'b' });
  assert.equal(q.discountCents, 2 * SPONSOR_DISCOUNT_CENTS);
  assert.equal(q.premiumCents, 0);
  assert.equal(q.totalCents, 14900 - 2 * SPONSOR_DISCOUNT_CENTS);
  const qb = quoteMerch('jacket', { back: 'c' });
  assert.equal(qb.premiumCents, BACK_PREMIUM_CENTS);
  assert.equal(qb.totalCents, 14900 - SPONSOR_DISCOUNT_CENTS + BACK_PREMIUM_CENTS);
});

test('ignores unknown positions and blank logos, floors at zero', () => {
  const q = quoteMerch('cap', { nowhere: 'x', 'chest-left': ' ', back: '' });
  assert.equal(q.filled, 0);
  assert.equal(q.totalCents, 3900);
});

test('color/size allowlists gate buyer input', () => {
  assert.equal(isMerchColor('jacket', '#101418'), true);
  assert.equal(isMerchColor('jacket', '#ff00ff'), false);
  assert.equal(isMerchSize('cap', 'L/XL'), true);
  assert.equal(isMerchSize('cap', 'XL'), false);
});

test('uploaded club logos place without funding a discount', () => {
  assert.equal(isUploadSlot('upload:u1'), true);
  assert.equal(isUploadSlot('some-uuid'), false);
  const q = quoteMerch('jacket', { 'chest-left': 'upload:u1', 'chest-right': 'sponsor-a' });
  assert.equal(q.filled, 1);
  assert.equal(q.customCount, 1);
  assert.equal(q.discountCents, SPONSOR_DISCOUNT_CENTS);
  assert.equal(q.totalCents, 14900 - SPONSOR_DISCOUNT_CENTS);
});

test('buyer nudge clamps to the allowed range', () => {
  assert.equal(clampShift(0), 0);
  assert.equal(clampShift(7.64), 7.6);
  assert.equal(clampShift(SHIFT_MAX + 50), SHIFT_MAX);
  assert.equal(clampShift(SHIFT_MIN - 50), SHIFT_MIN);
  assert.equal(clampShift('junk'), 0);
  assert.equal(clampShift(undefined), 0);
});

test('buyer spin wraps to [-180, 180]', () => {
  assert.equal(clampSpin(0), 0);
  assert.equal(clampSpin(190), -170);
  assert.equal(clampSpin(-190), 170);
  assert.equal(clampSpin('junk'), 0);
});

test('back premium still applies for an uploaded back logo, discount does not', () => {
  const q = quoteMerch('jacket', { back: 'upload:u1' });
  assert.equal(q.filled, 0);
  assert.equal(q.customCount, 1);
  assert.equal(q.discountCents, 0);
  assert.equal(q.premiumCents, BACK_PREMIUM_CENTS);
  assert.equal(q.totalCents, 14900 + BACK_PREMIUM_CENTS);
});

test('positions differ per product', () => {
  assert.deepEqual(merchPositions('cap').map((p) => p.id), ['front', 'side-left', 'side-right', 'back']);
  assert.deepEqual(merchPositions('saddle-blanket').map((p) => p.id), ['side-left', 'side-right', 'back']);
  assert.deepEqual(merchPositions('ear-bonnet').map((p) => p.id), ['forehead', 'ear-left', 'ear-right']);
  assert.deepEqual(merchPositions('jacket').map((p) => p.id),
    ['chest-left', 'chest-right', 'sleeve-left', 'sleeve-right', 'back']);
  assert.deepEqual(merchPositions('jacket').map((p) => p.label),
    ['Left chest', 'Right chest', 'Left sleeve', 'Right sleeve', 'Back']);
  assert.deepEqual(merchPositions('nope'), []);
});

test('every rider top has a model file and chest slots', () => {
  for (const id of ['jacket', 'polo', 'tee']) {
    assert.match(RIDER_MODELS[id]?.file || '', /\.glb$/);
    const ids = merchPositions(id).map((p) => p.id);
    assert.ok(ids.includes('chest-left') && ids.includes('chest-right') && ids.includes('back'));
  }
  assert.deepEqual(merchPositions('jacket').map((p) => p.id),
    ['chest-left', 'chest-right', 'sleeve-left', 'sleeve-right', 'back']);
  for (const id of ['polo', 'tee']) {
    assert.deepEqual(merchPositions(id).map((p) => p.id),
      ['chest-left', 'chest-right', 'sleeve-left', 'sleeve-right', 'back']);
  }
});

test('canonicalFit normalizes any unit into garment space', () => {
  // Jacket (metre-ish) and polo (centimetre-ish) land in the same space.
  const j = canonicalFit({ minX: -0.393, maxX: 0.393, minY: 0, minZ: -0.192, maxZ: 0.192 });
  const p = canonicalFit({ minX: -39.9, maxX: 39.9, minY: 0, minZ: -19.1, maxZ: 19.1 });
  assert.ok(Math.abs(j.scale - 1 / 0.786) < 0.001);
  assert.ok(Math.abs(p.scale - 1 / 79.8) < 0.0001);
  assert.deepEqual(j.offset, [0, 0, 0]);
  assert.deepEqual(p.offset, [0, 0, 0]);
  const off = canonicalFit({ minX: 10, maxX: 12, minY: 5, minZ: -1, maxZ: 1 });
  assert.deepEqual([off.scale, ...off.offset], [0.5, -5.5, -2.5, 0]);
});

test('buildHoverTargets covers every supported position, filled or not', () => {
  const defs = {
    'chest-left': [-0.24, 0.82, 0.234, 0, -0.25, 0.14],
    back: [0, 0.76, -0.246, 0, Math.PI, 0.55],
  };
  const ok = new Set(['a', 'b']);
  const slotSize = (pos) => (pos === 'back' ? { w: 0.5, h: 0.6 } : { w: 0.2, h: 0.2 });
  const out = buildHoverTargets(defs, {
    slots: { 'chest-left': 'a', back: '', nowhere: 'b' },
    ok, zoom: {}, aspects: { a: 2 }, shift: { 'chest-left': { x: 50, y: -4 } }, refW: 1, slotSize,
  });
  // Both defs positions land (unknown `nowhere` is ignored); empties carry
  // a null id so hover and tap keep working on them.
  assert.equal(out.length, 2);
  const near = (v, e) => assert.ok(Math.abs(v - e) < 1e-9, `${v} ≈ ${e}`);
  const [chest, back] = out;
  assert.equal(chest.id, 'a');
  // 2:1 logo fills 80% of the 0.2 slot width.
  near(chest.w, 0.16);
  near(chest.h, 0.08);
  // A 50% nudge would leave the slot: it stops at the slot edge, measured
  // along the slot's own right axis, so the logo still touches the surface.
  const along = (chest.x - chest.sx) * chest.right[0] + (chest.y - chest.sy) * chest.right[1] + (chest.z - chest.sz) * chest.right[2];
  near(along, (0.2 - 0.16) / 2);
  assert.equal(back.id, null);
  near(back.slotW, 0.5);
  // Facing vectors: chest faces the viewer, back faces away.
  near(chest.fx, Math.sin(-0.25));
  near(chest.fz, Math.cos(-0.25));
  near(back.fz, -1);
  // Back slot right axis points to world -x: dragging right on screen while
  // viewing the back moves the logo the right way.
  near(back.right[0], -1);
});

test('logo fits inside its print area and snaps', () => {
  const near = (v, e) => assert.ok(Math.abs(v - e) < 1e-9, `${v} ≈ ${e}`);
  // Tall logo in a wide slot is limited by height.
  const tall = fitLogoInSlot({ slotW: 0.4, slotH: 0.1, aspect: 0.5, zoom: 1 });
  near(tall.h, 0.08);
  // Zoom never grows past the slot.
  const huge = fitLogoInSlot({ slotW: 0.2, slotH: 0.2, aspect: 1, zoom: 5 });
  near(huge.w, 0.2);
  // 90 degree spin swaps the box used for clamping.
  const c = clampLogoOffset({ slotW: 0.4, slotH: 0.2, w: 0.2, h: 0.1, spinDeg: 90, x: 1, y: 1 });
  near(c.x, (0.4 - 0.1) / 2);
  near(c.y, (0.2 - 0.2) / 2);
  assert.equal(clampLogoOffset({ slotW: 1, slotH: 1, w: 0.1, h: 0.1, x: 0.01, y: 0.2, snap: 0.02 }).x, 0);
  assert.equal(snapSpin(87), 90);
  assert.equal(snapSpin(80), 80);
  assert.equal(snapSpin(-178), -180);
  // Slot frame: a slot turned to face +x has its right axis pointing to -z.
  const f = slotFrame(0, Math.PI / 2, 0);
  near(f.normal[0], 1);
  near(f.right[2], -1);
  assert.deepEqual(slotSizeUnits('jacket', 'chest-left', 1), { w: 100 / 600, h: 100 / 600 });
  assert.equal(slotSizeUnits('nope', 'chest-left'), null);
});

test('quote only counts the current product positions', () => {
  // Shirt slots don't leak into the cap quote (and vice versa).
  const q = quoteMerch('cap', { front: 'a', 'side-left': 'b', 'chest-left': 'c', back: 'd' });
  assert.equal(q.filled, 3);
  assert.equal(q.discountCents, 3 * SPONSOR_DISCOUNT_CENTS);
  assert.equal(q.premiumCents, BACK_PREMIUM_CENTS);
  assert.equal(q.totalCents, 3900 - 3 * SPONSOR_DISCOUNT_CENTS + BACK_PREMIUM_CENTS);
  const qb = quoteMerch('saddle-blanket', { 'side-left': 'a', forehead: 'b' });
  assert.equal(qb.filled, 1);
  assert.equal(qb.totalCents, 12900 - SPONSOR_DISCOUNT_CENTS);
});

test('quote uses each sponsor funded amount and lines sum to the total', () => {
  const ctx = {
    discountFor: (id) => ({ s1: 1200, s2: 700 }[id] || 0),
    sponsorOf: (id) => ({ s1: 'paknsave', s2: 'farmlands' }[id] || id),
  };
  const q = quoteMerch('jacket', { 'chest-left': 'club:demo-club', 'chest-right': 's1', 'sleeve-left': 's2', back: 'upload:blob:x' }, ctx);
  assert.equal(q.discountCents, 1900);
  assert.equal(q.premiumCents, BACK_PREMIUM_CENTS);
  assert.equal(q.totalCents, 14900 - 1900 + BACK_PREMIUM_CENTS);
  assert.equal(q.lines.reduce((sum, l) => sum + (l.kind === 'cap' ? 0 : l.cents), 0), q.totalCents);
  assert.equal(q.lines.find((l) => l.kind === 'club').cents, 0);
});

test('one sponsor discounts once per item and discount is capped', () => {
  const same = quoteMerch('jacket', { 'chest-left': 'a', 'chest-right': 'b' }, { sponsorOf: () => 'same', discountFor: () => 1000 });
  assert.equal(same.discountCents, 1000);
  const big = quoteMerch('cap', { front: 'a', 'side-left': 'b', 'side-right': 'c' }, { discountFor: () => 1500 });
  assert.equal(big.capped, true);
  assert.equal(big.discountCents, Math.floor(3900 * 0.4));
  assert.equal(big.totalCents, 3900 - Math.floor(3900 * 0.4) + BACK_PREMIUM_CENTS * 0);
});

test('club placeholder is configured for every product', async () => {
  const { merchClub } = await import('../lib/merch-config.mjs');
  const club = merchClub('demo-club');
  assert.ok(club && club.locked);
  for (const p of ['jacket', 'polo', 'tee', 'cap', 'saddle-blanket', 'rug-light', 'rug-warm', 'ear-bonnet']) {
    assert.ok(merchPositions(p).some((s) => s.id === club.defaults[p]), `${p} default slot`);
  }
  assert.equal(merchClub('nope'), null);
});

test('shift limits match the slot print area', () => {
  // Jacket chest: 100 mm of a 600 mm jacket = 16.7% wide. A 2:1 logo at
  // zoom 1 is 80% of that wide, so it can travel 10% of the area each way.
  const lim = slotShiftLimits('jacket', 'chest-left', { aspect: 2, zoom: 1 });
  assert.ok(Math.abs(lim.mx - (100 / 600) * 100 * 0.1) < 1e-9);
  assert.ok(lim.my > lim.mx);
  assert.equal(lim.maxZoom, 1.25);
  // At full size there is no room left along the long side.
  assert.ok(slotShiftLimits('jacket', 'chest-left', { aspect: 2, zoom: 1.25 }).mx < 1e-9);
  // Unknown slot falls back to the stored bounds.
  assert.equal(slotShiftLimits('jacket', 'nope').mx, SHIFT_MAX);
});

test('order quote: per-unit price, discount cap, delivery and GST share', async () => {
  const { quoteMerchOrder } = await import('../lib/merch.mjs');
  const { merchOrderSettings } = await import('../lib/merch.mjs');
  const R = merchOrderSettings();
  const slots = { 'chest-left': 'logo-a' };
  const one = quoteMerchOrder('jacket', slots, [{ size: 'M', qty: 1 }], { discountFor: () => 1200, strict: true }, 'courier');
  assert.equal(one.units, 1);
  assert.equal(one.discountCents, 1200);
  assert.equal(one.shippingCents, R.courierCents);
  assert.equal(one.totalCents, 14900 - 1200 + R.courierCents);
  assert.equal(one.gstCents, Math.round((one.totalCents * 0.15) / 1.15));
  const many = quoteMerchOrder('jacket', slots, [{ size: 'M', qty: 30 }, { size: 'L', qty: 20 }], { discountFor: () => 1200, strict: true }, 'courier');
  assert.equal(many.units, 50);
  assert.equal(many.discountCents, R.sponsorCapCents);
  assert.ok(many.discountCapped);
  assert.equal(many.shippingCents, 0); // over the free courier threshold
  assert.equal(many.totalCents, 14900 * 50 - R.sponsorCapCents);
});

test('order quote: strict mode gives no unfunded sponsor discount', async () => {
  const { quoteMerchOrder } = await import('../lib/merch.mjs');
  const q = quoteMerchOrder('tee', { 'chest-left': 'logo-a' }, [{ size: 'M', qty: 2 }], { discountFor: () => 0, strict: true }, 'courier');
  assert.equal(q.discountCents, 0);
  assert.equal(quoteMerchOrder('tee', {}, [], {}, 'courier'), null);
  assert.equal(quoteMerchOrder('tee', {}, [{ size: 'M', qty: 1 }], {}, 'drone'), null);
});

test('order settings: admin values win, bad values fall back, club pickup is never offered', async () => {
  const { merchOrderSettings, quoteMerchOrder } = await import('../lib/merch.mjs');
  // An old stored pickupEnabled: true must not bring pickup back.
  const s = merchOrderSettings({ courierCents: 900, freeOverCents: 0, pickupEnabled: true, sponsorCapCents: -5 });
  assert.equal('pickupEnabled' in s, false);
  assert.equal(s.courierCents, 900);
  assert.equal(s.freeOverCents, 0);
  assert.equal(s.sponsorCapCents, merchOrderSettings().sponsorCapCents);
  assert.equal(quoteMerchOrder('tee', {}, [{ size: 'M', qty: 1 }], {}, 'pickup', s), null);
  const big = quoteMerchOrder('jacket', {}, [{ size: 'M', qty: 10 }], {}, 'courier', s);
  assert.equal(big.shippingCents, 900); // freeOver 0 = never free
});

// ---- live catalog (merch_products rows over the built-in defaults) ----

const jacketEdit = (patch = {}) => ({ id: 'jacket', ...merchProductData(merchProduct('jacket')), ...patch });

test('a default product survives its own stored form unchanged', () => {
  setMerchCatalog([]);
  for (const p of merchProducts({ all: true })) {
    const { product, errors } = parseMerchProduct({ id: p.id, ...merchProductData(p) });
    assert.deepEqual(errors, []);
    assert.deepEqual(product, p);
  }
});

test('a stored row changes price, colours, sizes and slots everywhere', () => {
  setMerchCatalog([]);
  const data = merchProductData(merchProduct('jacket'));
  data.baseCents = 15900;
  data.colorList = [{ hex: '#ABCDEF', name: 'Sky' }];
  data.sizes = ['M', 'L'];
  data.slotList = data.slotList.map((s) => (s.id === 'sleeve-left' ? { ...s, active: false } : s.id === 'back' ? { ...s, premiumCents: 800, label: 'Big back' } : s));
  assert.deepEqual(setMerchCatalog([{ id: 'jacket', data }]), []);
  assert.equal(merchProduct('jacket').baseCents, 15900);
  assert.ok(isMerchColor('jacket', '#abcdef'));
  assert.ok(!isMerchColor('jacket', '#101418'));
  assert.ok(isMerchSize('jacket', 'M') && !isMerchSize('jacket', 'XS'));
  assert.ok(!merchPositions('jacket').some((p) => p.id === 'sleeve-left'));
  const q = quoteMerch('jacket', { back: 'club:x', 'sleeve-left': 'club:x' });
  assert.equal(q.totalCents, 15900 + 800);
  assert.ok(q.lines.some((l) => l.label.startsWith('Big back')));
  setMerchCatalog([]);
  assert.equal(merchProduct('jacket').baseCents, 14900);
});

test('hidden products leave the storefront but still resolve for old orders', () => {
  setMerchCatalog([{ id: 'cap', data: { ...merchProductData(merchProduct('cap')), status: 'hidden' } }]);
  assert.ok(!merchProducts().some((p) => p.id === 'cap'));
  assert.equal(merchProduct('cap').label, 'Cap');
  setMerchCatalog([]);
});

test('catalog edits are checked before they reach the store', () => {
  setMerchCatalog([]);
  const bad = (patch) => parseMerchProduct(jacketEdit(patch)).errors;
  assert.deepEqual(parseMerchProduct({ id: 'hoodie' }).errors, ['choose the 3D model this product uses']);
  assert.ok(bad({ baseCents: -1 }).length);
  assert.ok(bad({ baseCents: 10.5 }).length);
  assert.ok(bad({ colorList: [{ hex: 'red', name: 'Red' }] }).length);
  assert.ok(bad({ colorList: [] }).length);
  assert.ok(bad({ sizes: ['M', 'M'] }).length);
  assert.ok(bad({ category: 'all' }).length);
  assert.ok(bad({ status: 'deleted' }).length);
  assert.ok(bad({ slotList: [{ id: 'forehead', label: 'X', widthMm: 50, heightMm: 50 }] }).length);
  assert.ok(bad({ slotList: merchProductData(merchProduct('jacket')).slotList.map((s) => ({ ...s, active: false })) }).length);
  assert.ok(bad({ slotList: [{ ...merchProductData(merchProduct('jacket')).slotList[0], widthMm: 5 }] }).length);
  // A broken stored row keeps the default and is reported, never breaks the store.
  assert.deepEqual(setMerchCatalog([{ id: 'jacket', data: { baseCents: 'free' } }, { id: 'hoodie', data: {} }]), ['jacket', 'hoodie']);
  assert.equal(merchProduct('jacket').baseCents, 14900);
  setMerchCatalog([]);
});

test('a new product reuses a built-in model with its own name, price and slots', () => {
  setMerchCatalog([]);
  const draft = newMerchProductDraft('club-hoodie', 'jacket');
  assert.equal(draft.status, 'hidden');
  draft.label = 'Club hoodie';
  draft.baseCents = 9900;
  draft.modelFile = '/models/rider/hoodie.glb';
  draft.slotList = draft.slotList.map((x) => (x.id === 'back' ? { ...x, widthMm: 280 } : x));
  const { product, errors } = parseMerchProduct(draft);
  assert.deepEqual(errors, []);
  assert.deepEqual(setMerchCatalog([{ id: 'club-hoodie', data: merchProductData(product) }]), []);
  assert.equal(merchModel('club-hoodie'), 'jacket');
  assert.equal(riderModelFile('club-hoodie'), '/models/rider/hoodie.glb');
  assert.equal(riderModelFile('jacket'), RIDER_MODELS.jacket.file);
  assert.equal(merchCutoutSrc('club-hoodie'), '/merch/jacket/cutout.png');
  assert.ok(!merchProducts().some((p) => p.id === 'club-hoodie'), 'hidden until shown');
  assert.equal(merchPositions('club-hoodie').find((p) => p.id === 'back').widthMm, 280);
  assert.equal(merchPositions('jacket').find((p) => p.id === 'back').widthMm, 300);
  assert.equal(quoteMerch('club-hoodie', {}).totalCents, 9900);
  assert.ok(slotSizeUnits('club-hoodie', 'back', 1).w > 0, 'garment width comes from the model');
  setMerchCatalog([]);
});

test('admin-placed slots: new spots need a pose and then price and validate like any slot', async () => {
  const { poseFromHit, slotPose } = await import('../lib/merch.mjs');
  setMerchCatalog([]);
  const data = merchProductData(merchProduct('jacket'));
  const pose = poseFromHit([0.1, 0.5, 0.2], [0, 0, 1]);
  const extra = { id: 'hem-left', label: 'Left hem', widthMm: 60, heightMm: 30, premiumCents: 300, active: true };
  // No pose: refused, the 3D view would have nowhere to draw it.
  assert.ok(parseMerchProduct({ id: 'jacket', ...data, slotList: [...data.slotList, extra] }).errors.some((e) => e.includes('hem-left')));
  assert.ok(parseMerchProduct({ id: 'jacket', ...data, slotList: [...data.slotList, { ...extra, place: { product: { ...pose, x: 'a' } } }] }).errors.length);
  assert.ok(parseMerchProduct({ id: 'jacket', ...data, slotList: [...data.slotList, { ...extra, place: { moon: pose } }] }).errors.length);
  assert.ok(parseMerchProduct({ id: 'jacket', ...data, slotList: [...data.slotList, { ...extra, id: 'Bad Id', place: { product: pose } }] }).errors.length);
  const row = { ...data, slotList: [...data.slotList, { ...extra, place: { product: pose } }] };
  assert.deepEqual(setMerchCatalog([{ id: 'jacket', data: merchProductData(parseMerchProduct({ id: 'jacket', ...row }).product) }]), []);
  assert.ok(merchPositions('jacket').some((p) => p.id === 'hem-left' && p.widthMm === 60));
  assert.deepEqual(slotPose('jacket', 'hem-left', 'product'), pose);
  assert.equal(slotPose('jacket', 'hem-left', 'horse'), null);
  assert.ok(slotSizeUnits('jacket', 'hem-left', 1).w > 0);
  // Same quote path as the server: the premium is charged, a sponsor discounts.
  const q = quoteMerch('jacket', { 'hem-left': 'club:x' });
  assert.equal(q.totalCents, 14900 + 300);
  const sq = quoteMerch('jacket', { 'hem-left': 'sponsor-a' }, { strict: true, discountFor: () => 700 });
  assert.equal(sq.discountCents, 700);
  setMerchCatalog([]);
  assert.ok(!merchPositions('jacket').some((p) => p.id === 'hem-left'));
  // Rugs are also drawn on the horse: a new spot needs that pose too.
  const rug = merchProductData(merchProduct('rug-warm'));
  const spot = { ...extra, id: 'neck', place: { product: pose } };
  assert.ok(parseMerchProduct({ id: 'rug-warm', ...rug, slotList: [...rug.slotList, spot] }).errors.some((e) => e.includes('Show horse')));
  assert.deepEqual(parseMerchProduct({ id: 'rug-warm', ...rug, slotList: [...rug.slotList, { ...spot, place: { product: pose, horse: pose } }] }).errors, []);
});

test('poseFromHit faces the slot out of the surface, upright', async () => {
  const { poseFromHit } = await import('../lib/merch.mjs');
  for (const n of [[0, 0, 1], [1, 0, 0], [-0.6, 0.3, -0.74], [0, 1, 0], [0.2, -0.97, 0.1]]) {
    const len = Math.hypot(...n);
    const p = poseFromHit([0, 0, 0], n);
    const f = slotFrame(p.rx, p.ry, p.rz);
    f.normal.forEach((c, i) => assert.ok(Math.abs(c - n[i] / len) < 1e-3, `normal ${n}`));
    // Up is never tilted sideways on a wall: no horizontal right axis drift.
    if (Math.abs(n[1] / len) < 0.95) assert.ok(Math.abs(f.right[1]) < 1e-3, `right stays level for ${n}`);
  }
});

test('new product checks: id, model and own 3D file', () => {
  setMerchCatalog([]);
  const ok = newMerchProductDraft('rug-pro', 'rug-warm');
  assert.deepEqual(parseMerchProduct(ok).errors, []);
  assert.ok(isHorseProduct('rug-warm'));
  assert.ok(parseMerchProduct({ ...ok, id: 'Rug Pro' }).errors[0].includes('product id'));
  assert.ok(parseMerchProduct({ ...ok, model: 'boots' }).errors[0].includes('3D model'));
  assert.ok(parseMerchProduct({ ...ok, modelFile: '/models/rider/x.glb' }).errors.some((e) => e.includes('own 3D file')));
  const top = newMerchProductDraft('tee-2', 'tee');
  assert.ok(parseMerchProduct({ ...top, modelFile: 'https://evil.example/x.glb' }).errors.some((e) => e.includes('own 3D file')));
  // A built-in product keeps its own model whatever the row says.
  const { product } = parseMerchProduct({ id: 'jacket', ...merchProductData(merchProduct('jacket')), model: 'cap' });
  assert.equal(product.model, 'jacket');
  assert.equal(newMerchProductDraft('x1', 'nope'), null);
});

test('admin price rules drive every quote and fall back when stored values are bad', async () => {
  const { currentMerchSettings, merchOrderSettings, quoteMerchOrder, setMerchSettings } = await import('../lib/merch.mjs');
  setMerchCatalog([]);
  const s = setMerchSettings({ maxDiscountPct: 10, fallbackSponsorDiscountCents: 300, uploadLogoCents: 250, sponsorDiscountOncePerItem: false });
  assert.equal(currentMerchSettings(), s);
  const q = quoteMerch('jacket', { 'chest-left': 'a', 'chest-right': 'a', back: 'upload:blob:x' });
  assert.equal(q.premiumCents, 250);
  // Same sponsor twice now discounts twice, then the 10% limit caps it.
  assert.equal(q.discountCents, Math.min(600, Math.floor(14900 * 0.1)));
  assert.equal(quoteMerch('jacket', { 'chest-left': 'a' }).discountCents, 300);
  // A quote can still pass its own settings (the server does).
  assert.equal(quoteMerch('jacket', { 'chest-left': 'a' }, { settings: merchOrderSettings() }).discountCents, SPONSOR_DISCOUNT_CENTS);
  assert.equal(quoteMerchOrder('jacket', { back: 'upload:blob:x' }, [{ size: 'M', qty: 2 }], {}, 'courier').goodsCents, 2 * (14900 + 250));
  const bad = setMerchSettings({ maxDiscountPct: 95, uploadLogoCents: -1, sponsorDiscountOncePerItem: 'yes' });
  assert.deepEqual([bad.maxDiscountPct, bad.uploadLogoCents, bad.sponsorDiscountOncePerItem], [40, 0, true]);
  setMerchSettings({});
});
