// ============================================================================
// PLACEHOLDER BUSINESS DATA for the merch studio. Swap these for the real
// club list and the pricing rules agreed with Paladin. No component reads
// numbers from anywhere else, so editing this file is all a change needs.
// ============================================================================

// ---- Clubs -----------------------------------------------------------------
// A club storefront link is /merch?club=<id> (or /merch/<product>?club=<id>).
// Every product then arrives with the club logo already placed in its
// default slot. `locked: true` means members cannot remove or move it to
// another slot, only add logos around it. The club logo is included in the
// base price (no discount, no premium).
export const MERCH_CLUBS = {
  'demo-club': {
    id: 'demo-club',
    name: 'Demo Club',
    placeholder: true, // PLACEHOLDER: replace with a real club + logo file
    logo: '/merch/clubs/demo-club.svg',
    aspect: 2, // logo width / height, used before the image has loaded
    locked: true,
    defaults: {
      jacket: 'chest-left',
      polo: 'chest-left',
      tee: 'chest-left',
      cap: 'front',
      'saddle-blanket': 'side-left',
      'rug-light': 'side-left',
      'rug-warm': 'side-left',
      'ear-bonnet': 'forehead',
    },
  },
};

export function merchClub(id) {
  return MERCH_CLUBS[String(id || '')] || null;
}

// ---- Pricing rules ---------------------------------------------------------
// PLACEHOLDER numbers. The live sponsor discount itself comes from
// /api/sponsor-discounts (what each sponsor actually funds); these rules
// only decide how it is applied.
export const MERCH_PRICING_RULES = {
  placeholder: true,
  // Used when a sponsor logo has no funded amount from the API (offline,
  // or a sponsor without a budget row yet).
  fallbackSponsorDiscountCents: 500,
  // One discount per sponsor per item: the same sponsor in two slots does
  // not pay twice.
  sponsorDiscountOncePerItem: true,
  // Never discount more than this share of the base price on one item.
  maxDiscountPct: 40,
  // Extra cost for large or difficult placements, per slot id. Empty on
  // purpose: a back logo costs nothing extra on any product (Imam,
  // 2026-11-24). Add { back: 800 } here to bring the premium back.
  slotPremiumCents: {},
  // Extra cost per logo kind: 'upload' = the member's own artwork.
  logoPremiumCents: { upload: 0 },
};

// ---- Garment scale ---------------------------------------------------------
// Flat width of each garment in mm (PLACEHOLDER, typical size M). Converts
// the print-area sizes in mm into the 3D model's units, so a 100 mm chest
// area covers the right share of the chest on screen.
export const GARMENT_WIDTH_MM = {
  jacket: 600,
  polo: 540,
  tee: 540,
  cap: 200,
  'saddle-blanket': 700,
  'rug-light': 1600,
  'rug-warm': 1600,
  'ear-bonnet': 220,
};

// ---- Ordering -------------------------------------------------------------
// Pay after proof approval (Imam, 2026-11-24). Prices include 15% GST.
// Sponsor discounts apply per unit, up to a cap per order so one team order
// cannot drain a sponsor budget. Delivery is NZ only. The money settings
// below are DEFAULTS: an admin sets the live values in Studio (stored in
// admin_settings, served by GET /api/merch/settings).
export const MERCH_ORDER_RULES = {
  currency: 'NZD',
  gstRate: 0.15,
  pricesIncludeGst: true,
  maxLines: 12, // size rows per order
  maxUnitsPerLine: 200,
  defaults: {
    courierCents: 1200, // NZ courier, flat
    freeOverCents: 25000, // courier free from this order value (0 = never)
    pickupEnabled: true, // free collection from the club
    sponsorCapCents: 30000, // most sponsor discount one order can take
  },
};
