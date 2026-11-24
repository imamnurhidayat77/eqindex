import { GARMENT_WIDTH_MM, MERCH_ORDER_RULES, MERCH_PRICING_RULES, merchClub } from './merch-config.mjs';

// Merch customizer (Paladin concept): pure helpers, no DOM.
// Sponsor rule mirrors /api/sponsor-logos — the picker only lists logos
// the server returns (funded, registered sponsors). Pricing here is an
// ESTIMATE shown live; checkout must re-quote server-side.
export const MERCH_POSITIONS = [
  { id: 'chest-left', label: 'Left chest', short: 'L Chest' },
  { id: 'chest-right', label: 'Right chest', short: 'R Chest' },
  { id: 'sleeve-left', label: 'Left sleeve', short: 'L Sleeve' },
  { id: 'sleeve-right', label: 'Right sleeve', short: 'R Sleeve' },
  { id: 'shoulder-left', label: 'Left shoulder', short: 'L Shoulder' },
  { id: 'shoulder-right', label: 'Right shoulder', short: 'R Shoulder' },
  { id: 'back', label: 'Back', short: 'Back' },
  // Cap, horse gear and bonnet slots (labels below differ per product).
  { id: 'front', label: 'Front', short: 'Front' },
  { id: 'side-left', label: 'Left side', short: 'L Side' },
  { id: 'side-right', label: 'Right side', short: 'R Side' },
  { id: 'forehead', label: 'Forehead', short: 'Forehead' },
  { id: 'ear-left', label: 'Left ear', short: 'L Ear' },
  { id: 'ear-right', label: 'Right ear', short: 'R Ear' },
];

// Placement differs per product. Jacket: left and right chest, left and
// right sleeve, back (Imam's call, 2026-11-23; the written concept said
// shoulders: swap the two sleeve ids for 'shoulder-left'/'shoulder-right'
// and flip LEGACY_SLOT_MAP to go back). Polo/tee keep chest/sleeve,
// caps take front/side, horse gear takes sides, bonnets forehead + ears.
// 'back' keeps its id everywhere so the rear premium rule stays one line.
const MERCH_POSITIONS_BY_PRODUCT = {
  jacket: ['chest-left', 'chest-right', 'sleeve-left', 'sleeve-right', 'back'],
  polo: ['chest-left', 'chest-right', 'sleeve-left', 'sleeve-right', 'back'],
  tee: ['chest-left', 'chest-right', 'sleeve-left', 'sleeve-right', 'back'],
  cap: ['front', 'side-left', 'side-right', 'back'],
  'saddle-blanket': ['side-left', 'side-right', 'back'],
  'rug-light': ['side-left', 'side-right', 'back'],
  'rug-warm': ['side-left', 'side-right', 'back'],
  'ear-bonnet': ['forehead', 'ear-left', 'ear-right'],
};

const MERCH_POSITION_LABELS = {
  'chest-left': 'Left chest', 'chest-right': 'Right chest',
  'sleeve-left': 'Left sleeve', 'sleeve-right': 'Right sleeve',
  'shoulder-left': 'Left shoulder', 'shoulder-right': 'Right shoulder',
  back: 'Back', front: 'Front',
  'side-left': 'Left side', 'side-right': 'Right side',
  forehead: 'Forehead', 'ear-left': 'Left ear', 'ear-right': 'Right ear',
};

const MERCH_POSITION_SHORTS = Object.fromEntries(
  MERCH_POSITIONS.map((p) => [p.id, p.short || p.label]),
);

// Print area per slot, in mm. PROVISIONAL: industry-typical sizes until
// Paladin confirms the real ones. Every slot is data here (size + price
// effect), so the preview, the price and later production read one table.
export const SLOT_SIZES_PROVISIONAL = true;
const SLOT_SPECS = {
  'chest-left': { widthMm: 100, heightMm: 100 },
  'chest-right': { widthMm: 100, heightMm: 100 },
  'shoulder-left': { widthMm: 80, heightMm: 80 },
  'shoulder-right': { widthMm: 80, heightMm: 80 },
  'sleeve-left': { widthMm: 80, heightMm: 100 },
  'sleeve-right': { widthMm: 80, heightMm: 100 },
  back: { widthMm: 300, heightMm: 350 },
  front: { widthMm: 110, heightMm: 60 },
  'side-left': { widthMm: 300, heightMm: 200 },
  'side-right': { widthMm: 300, heightMm: 200 },
  forehead: { widthMm: 90, heightMm: 50 },
  'ear-left': { widthMm: 40, heightMm: 40 },
  'ear-right': { widthMm: 40, heightMm: 40 },
};

// Products whose slots share an id but not a size (a cap side is not a
// rug side). PROVISIONAL like the table above.
const SLOT_SPECS_BY_PRODUCT = {
  cap: {
    'side-left': { widthMm: 60, heightMm: 40 },
    'side-right': { widthMm: 60, heightMm: 40 },
    back: { widthMm: 100, heightMm: 50 },
  },
  // Horse gear: sized to the flat panel of the generated models (rug side
  // panel ~1.1 m long, pad side below the saddle flap, rug rump), so a
  // sponsor reads from the arena rail.
  'rug-warm': {
    'side-left': { widthMm: 700, heightMm: 450 },
    'side-right': { widthMm: 700, heightMm: 450 },
    back: { widthMm: 360, heightMm: 220 },
  },
  'rug-light': {
    'side-left': { widthMm: 700, heightMm: 450 },
    'side-right': { widthMm: 700, heightMm: 450 },
    back: { widthMm: 360, heightMm: 220 },
  },
  'saddle-blanket': {
    'side-left': { widthMm: 380, heightMm: 260 },
    'side-right': { widthMm: 380, heightMm: 260 },
    back: { widthMm: 200, heightMm: 110 },
  },
  'ear-bonnet': {
    forehead: { widthMm: 140, heightMm: 70 },
  },
};
function slotSpec(productId, slotId) {
  return SLOT_SPECS_BY_PRODUCT[String(productId)]?.[String(slotId)] || SLOT_SPECS[String(slotId)] || null;
}

export function merchPositions(productId) {
  const ids = MERCH_POSITIONS_BY_PRODUCT[String(productId)] || [];
  return ids.map((id) => {
    const spec = slotSpec(productId, id) || {};
    return {
      id,
      label: MERCH_POSITION_LABELS[id] || id,
      short: MERCH_POSITION_SHORTS[id] || MERCH_POSITION_LABELS[id] || id,
      widthMm: spec.widthMm || null,
      heightMm: spec.heightMm || null,
      premiumCents: Number(MERCH_PRICING_RULES.slotPremiumCents[id]) || 0,
    };
  });
}

// Saved drafts from when the jacket used shoulder slots: carry a jacket
// shoulder logo over to the sleeve on the same side.
const LEGACY_SLOT_MAP = {
  jacket: { 'shoulder-left': 'sleeve-left', 'shoulder-right': 'sleeve-right' },
};
export function migrateSlotId(productId, slotId) {
  return LEGACY_SLOT_MAP[String(productId)]?.[String(slotId)] || String(slotId);
}

// Storefront categories: apparel (rider tops), headwear (caps), accessories
// (horse extras), rugs (saddle blankets + turnout rugs). `badge` is a
// display-only highlight, never pricing.
export const MERCH_CATEGORIES = [
  { id: 'all', label: 'All Products' },
  { id: 'apparel', label: 'Apparel' },
  { id: 'headwear', label: 'Headwear' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'rugs', label: 'Rugs & Mats' },
];

export const MERCH_PRODUCTS = [
  { id: 'jacket', label: 'Jacket', group: 'Rider', category: 'apparel', badge: 'Bestseller', baseCents: 14900, colors: ['#101418', '#0e2a4a', '#5b1a1a', '#e8e4da'], sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'], blurb: 'Hooded softshell · logos on the chest, sleeves and back' },
  { id: 'polo', label: 'Polo shirt', group: 'Rider', category: 'apparel', baseCents: 6900, colors: ['#101418', '#0e2a4a', '#ffffff', '#1d5c3a'], sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'], blurb: 'Classic polo · logos on the chest, sleeves and back' },
  { id: 'tee', label: 'T-shirt', group: 'Rider', category: 'apparel', baseCents: 4900, colors: ['#101418', '#ffffff', '#0e2a4a', '#5b1a1a'], sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'], blurb: 'Everyday tee · logos on the chest, sleeves and back' },
  { id: 'cap', label: 'Cap', group: 'Rider', category: 'headwear', baseCents: 3900, colors: ['#101418', '#0e2a4a', '#1d5c3a', '#e8e4da'], sizes: ['S/M', 'L/XL'], blurb: 'Six-panel cap · logos on the front, sides and back' },
  { id: 'saddle-blanket', label: 'Saddle blanket', group: 'Horse', category: 'rugs', baseCents: 12900, colors: ['#101418', '#0e2a4a', '#5b1a1a', '#ffffff'], sizes: ['Pony', 'Cob', 'Full'], blurb: 'Quilted blanket · sponsor panels on both sides and the rear' },
  { id: 'ear-bonnet', label: 'Ear bonnet', group: 'Horse', category: 'accessories', baseCents: 5900, colors: ['#101418', '#0e2a4a', '#5b1a1a'], sizes: ['Pony', 'Cob', 'Full'], blurb: 'Match-day bonnet · logo on the forehead and ears' },
  { id: 'rug-light', label: 'Lightweight rug', group: 'Horse', category: 'rugs', baseCents: 17900, colors: ['#101418', '#0e2a4a', '#5b1a1a'], sizes: ['4\'0', '4\'3', '4\'6', '5\'0', '5\'3'], blurb: 'Turnout rug · large side panels and the rear' },
  { id: 'rug-warm', label: 'Warm rug', group: 'Horse', category: 'rugs', badge: 'Premium', baseCents: 21900, colors: ['#101418', '#0e2a4a', '#5b1a1a'], sizes: ['4\'0', '4\'3', '4\'6', '5\'0', '5\'3'], blurb: 'Warm turnout rug · large side panels and the rear' },
];

// Estimate rules (display only, checkout re-quotes):
// - each filled sponsor position: −NZ$5 (sponsor-funded estimate)
// - back position: no premium by default (MERCH_PRICING_RULES.slotPremiumCents)
export const SPONSOR_DISCOUNT_CENTS = MERCH_PRICING_RULES.fallbackSponsorDiscountCents;
export const BACK_PREMIUM_CENTS = Number(MERCH_PRICING_RULES.slotPremiumCents.back) || 0;

// Buyer logo nudge: percent of garment width along the slot's own surface
// axes (right/up as seen facing the slot). The real limit is the slot's
// print area (clampLogoOffset); this only bounds stored values.
export const SHIFT_MIN = -30;
export const SHIFT_MAX = 30;
export function clampShift(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  // 0.1% steps: 1% of a jacket is 6 mm, too coarse for a print position.
  return Math.min(SHIFT_MAX, Math.max(SHIFT_MIN, Math.round(n * 10) / 10));
}

// Buyer logo spin: degrees, wrapped to [-180, 180].
export function clampSpin(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(((((n + 180) % 360) + 360) % 360) - 180);
}

// Local axes of a slot oriented by Euler angles (three.js 'XYZ' order):
// right/up span the print surface, normal points out of the garment.
export function slotFrame(rx = 0, ry = 0, rz = 0) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  // Columns of Rx * Ry * Rz.
  return {
    right: [cy * cz, sx * sy * cz + cx * sz, -cx * sy * cz + sx * sz],
    up: [-cy * sz, -sx * sy * sz + cx * cz, cx * sy * sz + sx * cz],
    normal: [sy, -sx * cy, cx * cy],
  };
}

// Print area of a slot in model units (refW = garment width in units).
export function slotSizeUnits(productId, slotId, refW = 1) {
  const spec = slotSpec(productId, slotId);
  const garmentMm = GARMENT_WIDTH_MM[String(productId)];
  if (!spec || !garmentMm) return null;
  return { w: (spec.widthMm / garmentMm) * refW, h: (spec.heightMm / garmentMm) * refW };
}

// Logo size inside a slot: default fills 80% of the area, zoom scales it,
// and it never outgrows the area in either direction.
export const LOGO_ZOOM_MIN = 0.4;
export function fitLogoInSlot({ slotW, slotH, aspect = 1, zoom = 1 }) {
  const a = Math.max(0.05, Number(aspect) || 1);
  const maxW = Math.min(slotW, slotH * a);
  const base = 0.8 * maxW;
  const z = Math.max(LOGO_ZOOM_MIN, Number(zoom) || 1);
  const w = Math.min(maxW, base * z);
  return { w, h: w / a, maxZoom: maxW / base };
}

// Keeps the (rotated) logo box inside the slot and snaps to the centre
// lines when within `snap` units. x/y and the result are in model units.
export function clampLogoOffset({ slotW, slotH, w, h, spinDeg = 0, x = 0, y = 0, snap = 0 }) {
  const t = (Number(spinDeg) || 0) * (Math.PI / 180);
  const bw = Math.abs(w * Math.cos(t)) + Math.abs(h * Math.sin(t));
  const bh = Math.abs(w * Math.sin(t)) + Math.abs(h * Math.cos(t));
  const mx = Math.max(0, (slotW - bw) / 2);
  const my = Math.max(0, (slotH - bh) / 2);
  let cx = Math.min(mx, Math.max(-mx, Number(x) || 0));
  let cy = Math.min(my, Math.max(-my, Number(y) || 0));
  if (Math.abs(cx) < snap) cx = 0;
  if (Math.abs(cy) < snap) cy = 0;
  return { x: cx, y: cy, snappedX: cx === 0, snappedY: cy === 0 };
}

// How far a logo may move inside its slot, in percent of garment width
// (the unit slotShift is stored in). Same maths as the 3D clamp, so the
// sliders and arrow keys stop exactly where the logo stops.
export function slotShiftLimits(productId, slotId, { aspect = 2, zoom = 1, spin = 0 } = {}) {
  const box = logoBoxInSlot(productId, slotId, { aspect, zoom });
  if (!box) return { mx: SHIFT_MAX, my: SHIFT_MAX, maxZoom: 1.25 };
  const far = clampLogoOffset({ slotW: box.slotW, slotH: box.slotH, w: box.w, h: box.h, spinDeg: spin, x: 1e6, y: 1e6 });
  return { mx: Math.min(SHIFT_MAX, far.x), my: Math.min(SHIFT_MAX, far.y), maxZoom: box.maxZoom };
}

// Print area and logo box of one slot in shift units (percent of garment
// width), so the 2D placement pad and the 3D decal share one geometry.
export function logoBoxInSlot(productId, slotId, { aspect = 2, zoom = 1 } = {}) {
  const size = slotSizeUnits(productId, slotId, 100);
  if (!size) return null;
  const { w, h, maxZoom } = fitLogoInSlot({ slotW: size.w, slotH: size.h, aspect, zoom });
  return { slotW: size.w, slotH: size.h, w, h, maxZoom };
}

// Same-origin logo bytes (WebGL rejects cross-origin images without CORS).
// `upload:` ids are buyer-side object URLs, `club:` ids the club storefront
// logo under /public, anything else a registered sponsor logo.
export const LOGO_URL = (id) => {
  const v = String(id);
  if (v.startsWith('upload:')) return v.slice('upload:'.length);
  if (v.startsWith('club:')) return merchClub(v.slice('club:'.length))?.logo || '/merch-logo/missing';
  if (v.startsWith('my:')) return `/merch-logo/${v.slice('my:'.length)}`;
  return `/merch-logo/${v}`;
};

// Rotation snaps to the nearest quarter turn within 6 degrees.
export function snapSpin(deg) {
  const d = clampSpin(deg);
  const q = Math.round(d / 90) * 90;
  return Math.abs(d - q) <= 6 ? clampSpin(q) : d;
}

// One record per supported slot (filled or not), shared by the 3D decals,
// hover tooltip, tap-to-select and drag. defs[pos] is either
// { x, y, z, rx, ry, rz, depth? } or the legacy tuple
// [x, y, z, rx, ry, wFrac, depth?]. `slotSize(pos)` returns the print area
// in units; without it the area is derived from the tuple's wFrac.
// The returned centre already includes the buyer offset, clamped to the slot.
export function buildHoverTargets(defs, { slots, ok, zoom, aspects, shift, refW, slotSize }) {
  const out = [];
  const rw = Number(refW) || 1;
  for (const pos of Object.keys(defs || {})) {
    const raw = defs[pos];
    if (!raw) continue;
    const d = Array.isArray(raw)
      ? { x: raw[0], y: raw[1], z: raw[2], rx: raw[3], ry: raw[4], rz: 0, wFrac: raw[5], depth: raw[6] }
      : raw;
    const rawId = (slots || {})[pos];
    const id = rawId && ok.has(String(rawId)) ? String(rawId) : null;
    const size = (slotSize && slotSize(pos)) || { w: ((d.wFrac || 0.15) * rw) / 0.8, h: ((d.wFrac || 0.15) * rw) / 0.8 };
    const aspect = (id && Number(aspects?.[id])) || 2;
    const { w, h } = fitLogoInSlot({ slotW: size.w, slotH: size.h, aspect, zoom: Number(zoom?.[pos]) || 1 });
    const nudge = shift?.[pos] || {};
    const spin = Number(nudge.r) || 0;
    const off = clampLogoOffset({
      slotW: size.w, slotH: size.h, w, h, spinDeg: spin,
      x: ((Number(nudge.x) || 0) / 100) * rw,
      y: ((Number(nudge.y) || 0) / 100) * rw,
    });
    const f = slotFrame(d.rx || 0, d.ry || 0, d.rz || 0);
    out.push({
      pos,
      id,
      // Slot centre (no offset) and logo centre (with offset).
      sx: d.x, sy: d.y, sz: d.z,
      x: d.x + f.right[0] * off.x + f.up[0] * off.y,
      y: d.y + f.right[1] * off.x + f.up[1] * off.y,
      z: d.z + f.right[2] * off.x + f.up[2] * off.y,
      rx: d.rx || 0, ry: d.ry || 0, rz: d.rz || 0,
      right: f.right, up: f.up,
      fx: f.normal[0], fy: f.normal[1], fz: f.normal[2],
      w, h, slotW: size.w, slotH: size.h, spin, mirror: !!nudge.f,
      depth: d.depth || null,
    });
  }
  return out;
}

// Gear rendered on the 3D Warmblood (separate GLB templates) rather than
// on the rider mannequin. Kept here (dependency-free) so the configurator
// can switch stage mood without statically importing three.js.
export const HORSE_PRODUCTS = new Set(['saddle-blanket', 'ear-bonnet', 'rug-light', 'rug-warm']);

// ---------------------------------------------------------------------------
// Adding a product or swapping a 3D model (no component changes needed):
// 1. MERCH_PRODUCTS: append { id, label, group, baseCents, colors, sizes, blurb }.
// 2. MERCH_POSITIONS_BY_PRODUCT: append id → slot ids (reuse the ids above;
//    'back' keeps its rear-premium pricing everywhere). New anatomy? Add the
//    slot here + a DECALS entry for its layout.
// 3. Tops only: RIDER_MODELS gets id → { file }. The mesh auto-normalizes
//    into canonical garment space (width 1, hem at y=0), so the ONE shared
//    'top-glb' decal table fits any top model — swapping the .glb file needs
//    no retuning as long as proportions stay shirt-like. Non-top products
//    render procedurally (TopGarment/CapGarment/FlatGarment/BonnetGarment)
//    or via HorseScene, switching on group/product id in Merch3D.
// Stale slot ids in saved drafts are ignored (quote + preview filter by the
// current product's allowlist), so renames degrade gracefully.
// ---------------------------------------------------------------------------

// Rider top GLBs. Any Y-up, hem-at-bottom mesh works — normalization (below)
// absorbs unit/scale differences between generator outputs.
export const RIDER_MODELS = {
  jacket: { file: '/models/rider/jacket.glb' },
  polo: { file: '/models/rider/polo-white-buttons.glb' },
  tee: { file: '/models/rider/tshirt.glb' },
};

// Canonical garment space: width 1, hem (min y) at 0, x/z centred. Uniform
// scale, so folds keep their proportions and normals stay valid.
// Pure math over a bounding box — the three.js glue lives in Merch3D.
export function canonicalFit(box) {
  const w = Math.max(1e-6, box.maxX - box.minX);
  const scale = 1 / w;
  const clean = (v) => (v === 0 ? 0 : v); // drop -0 for strict equality
  return {
    scale,
    offset: [
      clean((-(box.minX + box.maxX) / 2) * scale),
      clean(-box.minY * scale),
      clean((-(box.minZ + box.maxZ) / 2) * scale),
    ],
  };
}

export function merchProduct(id) {
  return MERCH_PRODUCTS.find((p) => p.id === String(id)) || null;
}

export function isMerchColor(productId, color) {
  const p = merchProduct(productId);
  return !!p && p.colors.includes(String(color).toLowerCase()) ;
}

export function isMerchSize(productId, size) {
  const p = merchProduct(productId);
  return !!p && p.sizes.includes(String(size));
}

// Real product photos (2D, no 3D): drop files under
// public/merch/<product-id>/<view>.jpg (.jpg/.jpeg/.png/.webp all resolve
// in that order). Views are front, side-left, side-right and back.
// Position ids map to the closest photo view so Step 1 cards and Step 4
// placement cards show the real garment angle.
export const MERCH_PHOTO_VIEWS = ['front', 'side-left', 'side-right', 'back'];

const MERCH_POS_TO_VIEW = {
  'chest-left': 'front', 'chest-right': 'front', front: 'front', forehead: 'front',
  'sleeve-left': 'side-left', 'side-left': 'side-left', 'ear-left': 'side-left',
  'shoulder-left': 'side-left',
  'sleeve-right': 'side-right', 'side-right': 'side-right', 'ear-right': 'side-right',
  'shoulder-right': 'side-right',
  back: 'back',
};

export function merchPhotoView(positionId) {
  return MERCH_POS_TO_VIEW[String(positionId)] || 'front';
}

export function merchPhotoSrc(productId, view) {
  return `/merch/${String(productId)}/${String(view)}.jpg`;
}

// Transparent 3D cutout for the storefront (one hero angle per product,
// alpha background). Customiser minis keep the JPG angles above.
export function merchCutoutSrc(productId) {
  return `/merch/${String(productId)}/cutout.png`;
}

// Buyer-uploaded club logos ride as `upload:<key>` slot values. They are
// placed on the product but fund NO discount — only registered sponsor
// logos (server-filtered) discount, so the sponsor subsidy model holds.
// slots: { positionId: logoId|null }. Only counts non-empty strings.
// `mlogo:<id>` is the same artwork once uploaded with an order (server side).
// `my:<id>` is a logo saved to the buyer's account ("My sponsor logos",
// shared with photos): the buyer's own artwork, so never discounted.
export function isUploadSlot(v) {
  const s = String(v || '');
  return s.startsWith('upload:') || s.startsWith('mlogo:') || s.startsWith('my:');
}

// Slot values: a sponsor logo id, `upload:<url>` (member artwork) or
// `club:<clubId>` (the club's own logo, included in the base price).
export function isClubSlot(v) {
  return String(v || '').startsWith('club:');
}

// Live estimate (display only; checkout must re-quote server-side with the
// same rules). Rules live in merch-config.mjs. ctx (all optional):
//   discountFor(logoId) -> cents the sponsor funds (from /api/sponsor-discounts)
//   sponsorOf(logoId)   -> sponsor key, so one sponsor discounts once per item
//   labelFor(value)     -> human label for a slot value
// Returns totals plus `lines`, the exact breakdown that sums to the total,
// so every price on screen is read from one object.
export function quoteMerch(productId, slots, ctx = {}) {
  const p = merchProduct(productId);
  if (!p) return null;
  const rules = MERCH_PRICING_RULES;
  const order = MERCH_POSITIONS_BY_PRODUCT[String(productId)] || [];
  const label = (v) => (ctx.labelFor ? ctx.labelFor(v) : String(v));
  const lines = [{ kind: 'base', label: `${p.label} base price`, cents: p.baseCents }];
  let discount = 0;
  let premium = 0;
  let filled = 0;
  let customCount = 0;
  let hasBack = false;
  const seenSponsors = new Set();
  for (const pos of order) {
    const v = String((slots || {})[pos] || '').trim();
    if (!v) continue;
    const where = MERCH_POSITION_LABELS[pos] || pos;
    if (pos === 'back') hasBack = true;
    if (isClubSlot(v)) {
      lines.push({ kind: 'club', slot: pos, label: `${where}: ${label(v)} (included)`, cents: 0 });
    } else if (isUploadSlot(v)) {
      customCount += 1;
      const extra = Number(rules.logoPremiumCents.upload) || 0;
      premium += extra;
      lines.push({ kind: 'upload', slot: pos, label: `${where}: ${label(v)}, no discount`, cents: extra });
    } else {
      filled += 1;
      const key = String(ctx.sponsorOf ? ctx.sponsorOf(v) : v).toLowerCase();
      const funded = ctx.discountFor ? Number(ctx.discountFor(v)) : NaN;
      // strict (server quote): only a funded budget discounts, never the
      // display fallback.
      const fallback = ctx.strict ? 0 : rules.fallbackSponsorDiscountCents;
      let amount = Number.isFinite(funded) && funded > 0 ? funded : fallback;
      let note = '';
      if (rules.sponsorDiscountOncePerItem && seenSponsors.has(key)) {
        amount = 0;
        note = ' (sponsor already counted)';
      }
      seenSponsors.add(key);
      discount += amount;
      lines.push({ kind: 'sponsor', slot: pos, label: `${where}: ${label(v)}${note}`, cents: -amount });
    }
    const slotExtra = Number(rules.slotPremiumCents[pos]) || 0;
    if (slotExtra) {
      premium += slotExtra;
      lines.push({ kind: 'premium', slot: pos, label: `${where}: large placement`, cents: slotExtra });
    }
  }
  const maxDiscount = Math.floor((p.baseCents * rules.maxDiscountPct) / 100);
  let capped = false;
  if (discount > maxDiscount) {
    lines.push({ kind: 'cap', label: `Discount limit (max ${rules.maxDiscountPct}% per item)`, cents: discount - maxDiscount });
    discount = maxDiscount;
    capped = true;
  }
  const total = Math.max(0, p.baseCents - discount + premium);
  return { baseCents: p.baseCents, filled, customCount, hasBack, discountCents: discount, premiumCents: premium, totalCents: total, capped, lines };
}

// Price effect of filling a slot, for the slot list ("+NZ$8").
export function slotPremiumCents(slotId) {
  return Number(MERCH_PRICING_RULES.slotPremiumCents[String(slotId)]) || 0;
}

// Live order settings: admin values over the defaults, each one checked
// so a bad stored value falls back instead of breaking prices.
export function merchOrderSettings(stored = {}) {
  const d = MERCH_ORDER_RULES.defaults;
  const cents = (v, dflt) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 1000000 ? Number(v) : dflt);
  const s = stored || {};
  return {
    courierCents: cents(s.courierCents, d.courierCents),
    freeOverCents: cents(s.freeOverCents, d.freeOverCents),
    pickupEnabled: typeof s.pickupEnabled === 'boolean' ? s.pickupEnabled : d.pickupEnabled,
    sponsorCapCents: cents(s.sponsorCapCents, d.sponsorCapCents),
  };
}

// Whole-order quote: the per-item quote times the units ordered, the
// per-order sponsor cap, delivery and the GST share of the total.
// lines: [{ size, qty }]. delivery: 'courier' | 'pickup'. settings: from
// merchOrderSettings. Returns null for an unknown product, a delivery that
// is not offered, or an empty order.
export function quoteMerchOrder(productId, slots, lines, ctx = {}, delivery = 'courier', settings = merchOrderSettings()) {
  const item = quoteMerch(productId, slots, ctx);
  const offered = delivery === 'courier' || (delivery === 'pickup' && settings.pickupEnabled);
  if (!item || !offered) return null;
  const units = (lines || []).reduce((n, l) => n + (Number(l.qty) || 0), 0);
  if (units < 1) return null;
  const fullCents = (item.baseCents + item.premiumCents) * units;
  const rawDiscount = item.discountCents * units;
  const discountCents = Math.min(rawDiscount, settings.sponsorCapCents);
  const goodsCents = fullCents - discountCents;
  const free = settings.freeOverCents > 0 && goodsCents >= settings.freeOverCents;
  const shippingCents = delivery === 'courier' && !free ? settings.courierCents : 0;
  const totalCents = goodsCents + shippingCents;
  const r = MERCH_ORDER_RULES.gstRate;
  return {
    item, units, discountCents, discountCapped: rawDiscount > discountCents,
    goodsCents, shippingCents, totalCents,
    gstCents: Math.round((totalCents * r) / (1 + r)),
  };
}
