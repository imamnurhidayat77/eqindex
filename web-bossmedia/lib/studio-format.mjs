// Pure display helpers for the studio console (no React, so node --test can import them).

export const STUDIO_TZ = 'Pacific/Auckland';
// Stripe Checkout sessions expire after 24h, so an older pending row can never be paid.
export const CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;

export const nzdc = (cents) => {
  const n = Number(cents || 0) / 100;
  const digits = Number.isInteger(n) ? 0 : 2;
  return `NZ$${n.toLocaleString('en-NZ', { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
};

// One date format everywhere in the studio: "17 Nov" (adds the year when it is not this year).
export function fmtDay(iso, now = new Date()) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  const year = (x) => x.toLocaleDateString('en-NZ', { timeZone: STUDIO_TZ, year: 'numeric' });
  return d.toLocaleDateString('en-NZ', {
    timeZone: STUDIO_TZ, day: 'numeric', month: 'short',
    ...(year(d) !== year(now) ? { year: 'numeric' } : {}),
  });
}

// YYYY-MM-DD in studio time, to match the server's day buckets.
export const isoDayNZ = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: STUDIO_TZ });

export const isAbandoned = (row, now = Date.now()) =>
  row?.status === 'pending' && now - new Date(row.created_at).getTime() > CHECKOUT_TTL_MS;

const STATUS_LABELS = {
  awaiting_payment: 'Awaiting payment',
  in_production: 'In production',
  pending: 'Pending',
  abandoned: 'Abandoned',
};
export const statusLabel = (s) => {
  const key = String(s || '').toLowerCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// Licence tiers are stored as slugs (web, social, high-res); show the shop name.
export const tierLabel = (t) => {
  const s = String(t || '').replace(/[-_]/g, ' ').trim();
  return s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
};

// Payout breakdown whose columns always add up: whatever the ledger kept back
// beyond platform fee and organizer share is shown as card fees.
export function payoutBreakdown(s) {
  const gross = Number(s.gross_cents || 0);
  const fee = Number(s.fee_cents || 0);
  const organizer = Number(s.organizer_cents || 0);
  const payout = Number(s.payout_cents || 0);
  return { gross, fee, organizer, cardFees: gross - fee - organizer - payout, payout };
}
