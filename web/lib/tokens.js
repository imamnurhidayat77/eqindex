// Shared Tailwind UI tokens — single source for repeated patterns.
// Prefer these over hand-written classes so every page stays premium & consistent.
// Type: 5 steps (display 28 / title 17 / label 13 / body 14 / meta 11-12).
// Radius: surfaces 8px, controls 6px, pills only for status. One accent (gold)
// reserved for the primary action and the key figure on a screen.
export const CARD = 'bg-card border border-line rounded-lg px-5 py-[18px] mb-6';
export const H1 = 'font-display text-[20px] md:text-[24px] font-bold uppercase tracking-tight mb-1';
export const SUB = 'text-muted text-sm mb-[18px]';
export const H2 = 'font-display text-[16px] font-bold uppercase tracking-tight mb-0.5';
export const H3 = 'font-display text-[13px] font-bold uppercase tracking-wide';
export const TABLE = 'w-full border-collapse text-sm';
export const TABLEWRAP = 'overflow-x-auto';
export const TH = 'text-left text-[13px] text-muted font-medium px-2 py-2.5 border-b border-line whitespace-nowrap';
export const TD = 'px-2 py-[11px] border-b border-rowline';
export const NUM = 'text-right tabular-nums';
export const EMPTY = 'px-2 py-10 text-center text-muted';
export const BTN = 'bg-card2 border border-line text-body rounded-md px-3.5 py-2 text-sm hover:text-white transition-colors';
export const BTN_PRIMARY = 'bg-gold text-black font-bold rounded-md px-4 py-2 text-[13px] hover:brightness-110 active:brightness-95 active:scale-[0.99] transition';
export const BTN_DANGER = 'bg-redbg border border-blood/40 text-blood rounded-md px-3.5 py-2 text-sm hover:brightness-125 transition-colors';
export const BTN_GHOST = 'rounded-md px-2 py-2 text-[13px] text-sky hover:underline';
export const BTN_SECONDARY = 'border border-ember/60 text-ember rounded-md px-3.5 py-2 text-sm hover:bg-emberbg transition-colors';
export const INP = 'bg-ink border border-line text-body rounded-md px-3 py-2 text-sm focus:border-gold/60 focus:outline-none';
export const MUT = 'text-muted';
export const LINK = 'text-sky no-underline hover:underline';
export const LIVE = 'text-moss border border-greenbg bg-greenbg/40 rounded-full px-3 py-1 text-xs font-bold';
export const badge = (color) =>
  `inline-block text-[11px] font-bold rounded-md px-2 py-[3px] ${color}`;
export const BADGE = {
  gold: 'border border-gold text-gold',
  goldfill: 'bg-goldbg text-gold',
  green: 'bg-greenbg text-moss',
  gray: 'bg-line text-muted',
  blue: 'bg-bluebg text-sky',
  red: 'bg-redbg text-blood',
};
// Unified status pill: label → classes. Use for trends, tiers, placings, difficulty.
export function statusBadge(label) {
  const l = String(label || '').toLowerCase();
  if (/(elite|peak|1st|win)/.test(l)) return badge(BADGE.goldfill);
  if (/(improv|rising|optimal|above|2nd|3rd)/.test(l)) return badge(BADGE.green);
  if (/(declin|below|drop)/.test(l)) return badge(BADGE.red);
  if (/(strong|live|active)/.test(l)) return badge(BADGE.blue);
  return badge(BADGE.gray);
}
