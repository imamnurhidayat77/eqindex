// Pure helpers for the studio Overview dashboard (node --test can import them).
import { isoDayNZ } from './studio-format.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

// Last n studio-time days, oldest first, gaps filled with zero.
export function lastDays(byDay, n, now = Date.now()) {
  const map = new Map((byDay || []).map((d) => [d.day, d]));
  return Array.from({ length: n }, (_, i) => {
    const day = isoDayNZ(now - (n - 1 - i) * DAY_MS);
    const row = map.get(day);
    return { day, value: Number(row?.gross_cents) || 0, sales: Number(row?.sales) || 0 };
  });
}

export function periodTotals(days) {
  let value = 0, sales = 0, best = null;
  for (const d of days) {
    value += d.value;
    sales += d.sales;
    if (d.value > 0 && (!best || d.value > best.value)) best = d;
  }
  return { value, sales, best };
}

// Each row's share of the total, whole percent, never NaN.
export function withShare(rows) {
  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  return rows.map((r) => ({ ...r, share: total > 0 ? Math.round(((Number(r.value) || 0) / total) * 100) : 0 }));
}

export const SALE_KIND = { photo: 'Photo', package: 'Bundle', reel: 'Reel', credit: 'Credits' };
export const saleKind = (k) => SALE_KIND[k] || 'Sale';
