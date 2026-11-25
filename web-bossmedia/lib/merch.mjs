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
function defaultSlotSpec(productId, slotId) {
  return SLOT_SPECS_BY_PRODUCT[String(productId)]?.[String(slotId)] || SLOT_SPECS[String(slotId)] || null;
}

// Print area of a slot from the live catalog (see setMerchCatalog).
function slotSpec(productId, slotId) {
  const slot = catalog.get(String(productId))?.slotList.find((s) => s.id === String(slotId));
  return slot ? { widthMm: slot.widthMm, heightMm: slot.heightMm } : null;
}

// The slots a product offers right now, in catalog order.
export function merchPositions(productId) {
  const p = catalog.get(String(productId));
  return (p?.slotList || []).filter((s) => s.active).map((s) => ({
    id: s.id,
    label: s.label,
    short: MERCH_POSITION_SHORTS[s.id] || s.label,
    widthMm: s.widthMm,
    heightMm: s.heightMm,
    premiumCents: s.premiumCents,
  }));
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

// ---------------------------------------------------------------------------
// Live catalog. MERCH_PRODUCTS and the slot tables above are the built-in
// defaults: the products and slots the 3D views can draw, and the fallback
// when the database catalog (merch_products, edited in Studio > Admin >
// Merch catalog) cannot be read. A stored row overrides the editable fields
// of a known product. A new product reuses one of these as its `model`:
// the 3D view, slot positions and photos come from the model, everything
// else (name, price, colours, sizes, slot sizes) is its own. A product with
// a 3D shape none of them has still needs code (docs/merch-3d-models.md).
// ---------------------------------------------------------------------------
export const MERCH_STATUSES = ['active', 'hidden'];
const COLOR_NAMES = {
  '#101418': 'Black', '#0e2a4a': 'Navy', '#5b1a1a': 'Maroon',
  '#e8e4da': 'Bone', '#ffffff': 'White', '#1d5c3a': 'Forest',
};
const HEX_RE = /^#[0-9a-f]{6}$/;
const PRODUCT_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
// Own GLB for a product on a rider-top model (any shirt-shaped mesh fits).
const TOP_FILE_RE = /^\/models\/rider\/[a-z0-9-]+\.glb$/;
const CATALOG_LIMITS = { colors: 12, sizes: 12, cents: 1000000, mmMin: 10, mmMax: 2000, premiumCents: 100000, slots: 16 };
const SLOT_ID_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
// Where an admin put a slot on the 3D model, per view: 'product' is the
// item on its own, 'horse' the horse gear worn on the horse. Each is a
// pose in that mesh's own units (see poseFromHit), over the code default.
export const SLOT_SPACES = ['product', 'horse'];
const POSE_KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
const POSE_LIMIT = 10; // model units and radians stay well inside this

// Stored slot place → { product?, horse? } (rounded), null when absent,
// false when present but malformed.
function parseSlotPlace(v) {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return false;
  const out = {};
  for (const [space, pose] of Object.entries(v)) {
    if (!SLOT_SPACES.includes(space) || !pose || typeof pose !== 'object') return false;
    const clean = {};
    for (const k of POSE_KEYS) {
      const n = Number(pose[k]);
      if (!Number.isFinite(n) || Math.abs(n) > POSE_LIMIT) return false;
      clean[k] = Math.round(n * 10000) / 10000;
    }
    out[space] = clean;
  }
  return Object.keys(out).length ? out : null;
}

// `colors` (hex list) is what the designer and the order checks read.
const withColors = (p) => ({ ...p, colors: p.colorList.map((c) => c.hex) });

function defaultProduct(p, sort) {
  return withColors({
    id: p.id, model: p.id, modelFile: null, group: p.group, label: p.label, category: p.category, badge: p.badge || null,
    blurb: p.blurb, baseCents: p.baseCents, status: 'active', sort,
    colorList: p.colors.map((hex) => ({ hex, name: COLOR_NAMES[hex] || hex })),
    sizes: [...p.sizes],
    slotList: (MERCH_POSITIONS_BY_PRODUCT[p.id] || []).map((id) => ({
      id, label: MERCH_POSITION_LABELS[id] || id, ...defaultSlotSpec(p.id, id),
      premiumCents: Number(MERCH_PRICING_RULES.slotPremiumCents[id]) || 0, active: true,
    })),
  });
}

const DEFAULT_CATALOG = new Map(MERCH_PRODUCTS.map((p, i) => [p.id, defaultProduct(p, i)]));
let catalog = DEFAULT_CATALOG;
let catalogVersion = 0;

// Checks one admin edit (or stored row) of a known product. Returns
// { product, errors }; product is null when anything is wrong.
// `draft` (admin preview only) lets a new horse-gear spot show before it is
// placed on the horse too.
export function parseMerchProduct(input, { draft = false } = {}) {
  const b = input || {};
  const id = String(b.id || '');
  // A built-in product is its own model; a new one names the model it reuses.
  const builtin = DEFAULT_CATALOG.has(id);
  const model = builtin ? id : String(b.model || '');
  const base = DEFAULT_CATALOG.get(model);
  if (!PRODUCT_ID_RE.test(id)) return { product: null, errors: ['product id: 2 to 40 lowercase letters, digits or dashes'] };
  if (!base) return { product: null, errors: ['choose the 3D model this product uses'] };
  const errors = [];
  let modelFile = b.modelFile ? String(b.modelFile).trim() : null;
  if (modelFile && !(RIDER_MODELS[model] && TOP_FILE_RE.test(modelFile))) {
    errors.push('own 3D file: only for shirts and jackets, as /models/rider/<name>.glb');
    modelFile = null;
  }
  const text = (v, name, min, max) => {
    const t = String(v ?? '').trim();
    if (t.length < min || t.length > max) errors.push(`${name} must be ${min} to ${max} characters`);
    return t;
  };
  const whole = (v, name, min, max) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) errors.push(`${name} must be a whole number from ${min} to ${max}`);
    return n;
  };
  const list = (v, name, max) => {
    const a = Array.isArray(v) ? v : [];
    if (!a.length || a.length > max) errors.push(`${name}: 1 to ${max} needed`);
    return a.slice(0, max);
  };

  const label = text(b.label, 'name', 2, 60);
  const blurb = text(b.blurb, 'description', 0, 160);
  const badge = text(b.badge, 'badge', 0, 20) || null;
  const category = String(b.category || '');
  if (category === 'all' || !MERCH_CATEGORIES.some((c) => c.id === category)) errors.push('unknown category');
  const baseCents = whole(b.baseCents, 'base price (cents)', 0, CATALOG_LIMITS.cents);
  const status = String(b.status || '');
  if (!MERCH_STATUSES.includes(status)) errors.push('status must be active or hidden');
  const sort = whole(b.sort ?? base.sort, 'sort order', 0, 999);

  const colorList = [];
  for (const c of list(b.colorList, 'colours', CATALOG_LIMITS.colors)) {
    const hex = String(c?.hex || '').toLowerCase();
    if (!HEX_RE.test(hex)) { errors.push(`colour ${String(c?.hex ?? '').slice(0, 10)} must look like #1a2b3c`); continue; }
    if (colorList.some((x) => x.hex === hex)) { errors.push(`colour ${hex} listed twice`); continue; }
    colorList.push({ hex, name: text(c?.name, `name of ${hex}`, 1, 30) });
  }
  const sizes = [];
  for (const z of list(b.sizes, 'sizes', CATALOG_LIMITS.sizes)) {
    const size = text(z, 'size', 1, 12);
    if (sizes.includes(size)) errors.push(`size ${size} listed twice`);
    else sizes.push(size);
  }
  const known = new Set(base.slotList.map((x) => x.id));
  const slotList = [];
  const rawSlots = Array.isArray(b.slotList) ? b.slotList : [];
  if (rawSlots.length > CATALOG_LIMITS.slots) errors.push(`logo spots: at most ${CATALOG_LIMITS.slots}`);
  for (const x of rawSlots.slice(0, CATALOG_LIMITS.slots)) {
    const id = String(x?.id || '');
    if (!SLOT_ID_RE.test(id)) { errors.push(`logo spot id ${id.slice(0, 30)}: 2 to 30 lowercase letters, digits or dashes`); continue; }
    if (slotList.some((y) => y.id === id)) { errors.push(`logo spot ${id} listed twice`); continue; }
    const place = parseSlotPlace(x.place);
    if (place === false) { errors.push(`${id} position on the model is not valid`); continue; }
    // A spot the model does not know only exists where an admin placed it.
    if (!known.has(id) && !place?.product) { errors.push(`${id}: click the 3D model to place this logo spot`); continue; }
    // Worn horse gear is a second mesh: a new spot must exist there too.
    if (!draft && !known.has(id) && HORSE_VIEW_MODELS.has(model) && !place.horse) { errors.push(`${id}: place it with Show horse on as well`); continue; }
    slotList.push({
      id,
      label: text(x.label, `${id} label`, 1, 30),
      widthMm: whole(x.widthMm, `${id} width (mm)`, CATALOG_LIMITS.mmMin, CATALOG_LIMITS.mmMax),
      heightMm: whole(x.heightMm, `${id} height (mm)`, CATALOG_LIMITS.mmMin, CATALOG_LIMITS.mmMax),
      premiumCents: whole(x.premiumCents ?? 0, `${id} extra price (cents)`, 0, CATALOG_LIMITS.premiumCents),
      active: x.active !== false,
      ...(place ? { place } : {}),
    });
  }
  // A slot the row does not mention (added to the code later) starts off.
  for (const d of base.slotList) if (!slotList.some((y) => y.id === d.id)) slotList.push({ ...d, active: false });
  if (!slotList.some((x) => x.active)) errors.push('at least one logo spot must be on');
  if (errors.length) return { product: null, errors };
  return {
    product: withColors({ id, model, modelFile, group: base.group, label, category, badge, blurb, baseCents, status, sort, colorList, sizes, slotList }),
    errors,
  };
}

// The stored form of a product (merch_products.data): editable fields only.
export function merchProductData(p) {
  const { id, group, colors, ...data } = p;
  return data;
}

// The built-in 3D model a product is drawn with (its own id for the
// built-ins). 3D views and photos branch on this, never on the product id.
export function merchModel(productId) {
  return catalog.get(String(productId))?.model || String(productId);
}

// A new product prefilled from its model, hidden until an admin shows it.
export function newMerchProductDraft(id, model) {
  const base = DEFAULT_CATALOG.get(String(model));
  if (!base) return null;
  return { ...merchProductData(base), id: String(id), model: base.id, label: `${base.label} (new)`, status: 'hidden', sort: catalog.size };
}

// Replaces the live catalog with stored rows ([{ id, data }]) over the
// defaults. A row that fails the checks keeps the default; its id is
// returned so the caller can log it.
export function setMerchCatalog(rows) {
  catalogVersion += 1;
  const next = new Map(DEFAULT_CATALOG);
  const rejected = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const { product } = parseMerchProduct({ ...(r?.data || {}), id: r?.id });
    if (product) next.set(product.id, product);
    else rejected.push(String(r?.id));
  }
  catalog = next;
  return rejected;
}

// Admin preview only (browser): show an unsaved edit in the 3D view.
export function previewMerchProduct(product) {
  catalogVersion += 1;
  catalog = new Map(catalog).set(product.id, product);
}
// Bumps on every catalog change, so 3D memos can depend on it.
export const merchCatalogVersion = () => catalogVersion;

// Admin pose of a slot in one view (SLOT_SPACES), or null for the code default.
export function slotPose(productId, slotId, space) {
  return catalog.get(String(productId))?.slotList.find((s) => s.id === String(slotId))?.place?.[space] || null;
}

// Slot pose from a click on the mesh (point + face normal, mesh-local):
// normal out of the surface, "up" as close to world up as the surface
// allows (same frame the horse gear zones use). Euler order XYZ, so
// slotFrame(rx, ry, rz) gives the same axes back.
export function poseFromHit(point, normal) {
  const len = Math.hypot(...normal) || 1;
  const n = normal.map((c) => c / len);
  const worldUp = Math.abs(n[1]) > 0.95 ? [0, 0, -1] : [0, 1, 0];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let r = cross(worldUp, n);
  const rl = Math.hypot(...r) || 1;
  r = r.map((c) => c / rl);
  const u = cross(n, r);
  // Rotation matrix columns r, u, n → XYZ Euler (three.js setFromRotationMatrix).
  const m13 = n[0];
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  let rx;
  let rz;
  if (Math.abs(m13) < 0.9999999) {
    rx = Math.atan2(-n[1], n[2]);
    rz = Math.atan2(-u[0], r[0]);
  } else {
    rx = Math.atan2(u[2], u[1]);
    rz = 0;
  }
  const round = (v) => Math.round(v * 10000) / 10000;
  return { x: round(point[0]), y: round(point[1]), z: round(point[2]), rx: round(rx), ry: round(ry), rz: round(rz) };
}

// Catalog order; `all` includes hidden products (admin, old orders).
export function merchProducts({ all = false } = {}) {
  return [...catalog.values()].filter((p) => all || p.status === 'active').sort((a, b) => a.sort - b.sort);
}

// Buyer-facing colour name from the catalog (hex when unnamed).
export function merchColorName(productId, hex) {
  const h = String(hex).toLowerCase();
  return catalog.get(String(productId))?.colorList.find((c) => c.hex === h)?.name || COLOR_NAMES[h] || String(hex);
}

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
  const garmentMm = GARMENT_WIDTH_MM[merchModel(productId)];
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
export const isHorseProduct = (productId) => HORSE_PRODUCTS.has(merchModel(productId));
// Horse gear the store also shows worn (the ear bonnet is shown alone).
const HORSE_VIEW_MODELS = new Set(['saddle-blanket', 'rug-light', 'rug-warm']);

// The GLB a rider top is drawn with: the product's own file, else its model's.
export function riderModelFile(productId) {
  return merchProduct(productId)?.modelFile || RIDER_MODELS[merchModel(productId)]?.file || null;
}

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
  return catalog.get(String(id)) || null;
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

// New products show their model's photos (own photos are a later phase).
export function merchPhotoSrc(productId, view) {
  return `/merch/${merchModel(productId)}/${String(view)}.jpg`;
}

// Transparent 3D cutout for the storefront (one hero angle per product,
// alpha background). Customiser minis keep the JPG angles above.
export function merchCutoutSrc(productId) {
  return `/merch/${merchModel(productId)}/cutout.png`;
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
  const rules = ctx.settings || currentMerchSettings();
  const order = merchPositions(productId);
  const label = (v) => (ctx.labelFor ? ctx.labelFor(v) : String(v));
  const lines = [{ kind: 'base', label: `${p.label} base price`, cents: p.baseCents }];
  let discount = 0;
  let premium = 0;
  let filled = 0;
  let customCount = 0;
  let hasBack = false;
  const seenSponsors = new Set();
  for (const { id: pos, label: where, premiumCents: slotExtra } of order) {
    const v = String((slots || {})[pos] || '').trim();
    if (!v) continue;
    if (pos === 'back') hasBack = true;
    if (isClubSlot(v)) {
      lines.push({ kind: 'club', slot: pos, label: `${where}: ${label(v)} (included)`, cents: 0 });
    } else if (isUploadSlot(v)) {
      customCount += 1;
      const extra = rules.uploadLogoCents;
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

// Live order + pricing settings (Studio > Admin > Merch orders): admin
// values over the defaults in merch-config.mjs, each one checked so a bad
// stored value falls back instead of breaking prices.
export const MERCH_MAX_DISCOUNT_PCT = 90;
export function merchOrderSettings(stored = {}) {
  const d = MERCH_ORDER_RULES.defaults;
  const p = MERCH_PRICING_RULES;
  const whole = (v, dflt, max) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= max ? Number(v) : dflt);
  const cents = (v, dflt) => whole(v, dflt, 1000000);
  const flag = (v, dflt) => (typeof v === 'boolean' ? v : dflt);
  const s = stored || {};
  return {
    courierCents: cents(s.courierCents, d.courierCents),
    freeOverCents: cents(s.freeOverCents, d.freeOverCents),
    pickupEnabled: flag(s.pickupEnabled, d.pickupEnabled),
    sponsorCapCents: cents(s.sponsorCapCents, d.sponsorCapCents),
    maxDiscountPct: whole(s.maxDiscountPct, p.maxDiscountPct, MERCH_MAX_DISCOUNT_PCT),
    fallbackSponsorDiscountCents: whole(s.fallbackSponsorDiscountCents, p.fallbackSponsorDiscountCents, 100000),
    uploadLogoCents: whole(s.uploadLogoCents, Number(p.logoPremiumCents.upload) || 0, 100000),
    sponsorDiscountOncePerItem: flag(s.sponsorDiscountOncePerItem, p.sponsorDiscountOncePerItem),
  };
}

// The settings every quote uses unless one is passed in. Set from the API
// (server) or the merch layout (browser), like the catalog.
let liveSettings = null;
export function setMerchSettings(stored) {
  liveSettings = merchOrderSettings(stored);
  return liveSettings;
}
export function currentMerchSettings() {
  return liveSettings || merchOrderSettings();
}

// Whole-order quote: the per-item quote times the units ordered, the
// per-order sponsor cap, delivery and the GST share of the total.
// lines: [{ size, qty }]. delivery: 'courier' | 'pickup'. settings: from
// merchOrderSettings. Returns null for an unknown product, a delivery that
// is not offered, or an empty order.
export function quoteMerchOrder(productId, slots, lines, ctx = {}, delivery = 'courier', settings = currentMerchSettings()) {
  const item = quoteMerch(productId, slots, { ...ctx, settings });
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
