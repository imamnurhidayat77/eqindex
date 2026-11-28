// Studio > Admin > Merch pricing & delivery: turns the form (dollars and a
// percent, as typed) into the PUT /admin/merch/settings body, with an error
// per bad field so the page can show it next to that field. Limits match
// the API.
import { MERCH_MAX_DISCOUNT_PCT } from './merch.mjs';

const MAX_CENTS = 1000000; // courier and per-order cap
const MAX_LOGO_CENTS = 100000; // per-logo amounts
export const MERCH_MONEY_LIMITS = {
  courierCents: MAX_CENTS,
  freeOverCents: MAX_CENTS,
  fallbackSponsorDiscountCents: MAX_LOGO_CENTS,
  sponsorCapCents: MAX_CENTS,
  uploadLogoCents: MAX_LOGO_CENTS,
};

export const nzdShort = (cents) => `NZ$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export function readMerchSettingsForm(form) {
  const body = { sponsorDiscountOncePerItem: !!form.sponsorDiscountOncePerItem };
  const errors = {};
  for (const [k, max] of Object.entries(MERCH_MONEY_LIMITS)) {
    const raw = String(form[k] ?? '').trim();
    const cents = Math.round(Number(raw) * 100);
    if (raw === '' || !Number.isFinite(cents) || cents < 0 || cents > max) errors[k] = `Enter an amount from NZ$0 to ${nzdShort(max)}.`;
    else body[k] = cents;
  }
  const rawPct = String(form.maxDiscountPct ?? '').trim();
  const pct = Number(rawPct);
  if (rawPct === '' || !Number.isInteger(pct) || pct < 0 || pct > MERCH_MAX_DISCOUNT_PCT) {
    errors.maxDiscountPct = `Enter a whole percent from 0 to ${MERCH_MAX_DISCOUNT_PCT}.`;
  } else body.maxDiscountPct = pct;
  return { body, errors };
}
