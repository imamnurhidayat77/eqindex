'use client';
import { useEffect, useState } from 'react';
import SmartImage from './SmartImage';
import s from './SponsorTemplates.module.css';
import { MAX_SPONSOR_LOGOS } from '../lib/sponsor-logos.mjs';
import localFont from 'next/font/local';

// Same TTF files as api/src/lib/fonts, so the bake measures identical glyphs.
const condFont = localFont({
  src: [
    { path: './sponsor-fonts/BarlowCondensed-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: './sponsor-fonts/BarlowCondensed-ExtraBold.ttf', weight: '800', style: 'normal' },
    { path: './sponsor-fonts/BarlowCondensed-ExtraBoldItalic.ttf', weight: '800', style: 'italic' },
  ],
  display: 'swap',
});
const serifFont = localFont({ src: './sponsor-fonts/DMSerifDisplay-Regular.ttf', weight: '400', display: 'swap' });

// Sponsor photo templates, drawn over any photo (preview, cart, owned
// versions). api/src/lib/logoBake.js re-draws the exact same layout on the
// full-size file, so every number here has a twin there.
//
//   <SponsorPhoto photo={url} variant="fade-footer" sponsors={[{ src, label }]}
//     event="Auckland Spring Festival" className="1.20m Grand Prix" result="Winner" />
//
// TEMPLATE_VARIANTS is what buyers can pick: fourteen layouts, each light or dark, that all carry
// the event, the buyer's class and moment, and 1-8 sponsors (rows wrap).
// They are sized in % of the photo's SHORT edge, so landscape and portrait
// photos look the same. LEGACY_VARIANTS are retired from the picker but
// still render, because owned purchases point at them.

export const TEMPLATE_VARIANTS = [
  { id: 'broadcast', group: 'Sponsor', name: 'Broadcast', short: 'Broadcast', desc: 'TV sports graphic: slanted moment block, gold class tab and a partners ticker.' },
  { id: 'keyline', group: 'Sponsor', name: 'Keyline', short: 'Keyline', desc: 'Thin inset frame, gallery-label text and a serif moment. The photo stays the star.' },
  { id: 'result-card', group: 'Sponsor', name: 'Result card', short: 'Result card', desc: 'Event, class and result in clean cells under the photo, sponsors below.' },
  { id: 'rosette', group: 'Sponsor', name: 'Rosette', short: 'Rosette', desc: 'Show rosette coloured by placing, a plaque with the details, sponsors in the corner.' },
  { id: 'angle', group: 'Sponsor', name: 'Angle', short: 'Angle', desc: 'Diagonal slash with a big moment, sponsors on a card.' },
  { id: 'fade-footer', group: 'Sponsor', name: 'Lower third', short: 'Lower third', desc: 'Soft fade at the bottom: event, moment and class on the left, sponsors on a white card.' },
  { id: 'sponsor-bar', group: 'Sponsor', name: 'Sponsor bar', short: 'Sponsor bar', desc: 'Clean white bar along the bottom with a gold rule. Text left, sponsors right.' },
  { id: 'mat-frame', group: 'Sponsor', name: 'Gallery mat', short: 'Gallery mat', desc: 'White border around the photo, details in the bottom margin. Nothing covers the rider.' },
  { id: 'poster-panel', group: 'Sponsor', name: 'Poster', short: 'Poster', desc: 'Navy panel beside (landscape) or under (portrait) the photo, built for big moments.' },
  { id: 'logo-plate', group: 'Sponsor', name: 'Logo plate', short: 'Logo plate', desc: 'Small white plates in the corners you choose, moment tag in a free corner.' },
  { id: 'header-bar', group: 'Sponsor', name: 'Header bar', short: 'Header bar', desc: 'Bar across the top: event, moment and class left, sponsors right.' },
  { id: 'side-column', group: 'Sponsor', name: 'Side column', short: 'Side column', desc: 'Sponsors stacked on a card at the right edge, details in a tag bottom left.' },
  { id: 'ribbon-tag', group: 'Sponsor', name: 'Ribbon', short: 'Ribbon', desc: 'Award ribbon from the left edge with the moment, sponsors bottom right.' },
  { id: 'split-footer', group: 'Sponsor', name: 'Split', short: 'Split', desc: 'Two-tone band under the photo: details on one half, sponsors on the other.' },
];

// Retired: still rendered for purchases that already own them.
export const LEGACY_VARIANTS = [
  { id: 'banner-wave', group: 'Legacy', name: 'Bottom wave', short: 'Bottom wave', desc: 'White wave with navy and gold lines.' },
  { id: 'portrait-swoosh', group: 'Legacy', name: 'Corner swoosh', short: 'Corner swoosh', desc: 'White swoosh bottom right.' },
  { id: 'square-bar', group: 'Legacy', name: 'Bottom bar', short: 'Bottom bar', desc: 'Straight white bar with gold divider.' },
  { id: 'left-panel', group: 'Legacy', name: 'Left panel', short: 'Left panel', desc: 'White panel on the left.' },
  { id: 'top-banner', group: 'Legacy', name: 'Top banner', short: 'Top banner', desc: 'Sponsor strip at the top.' },
  { id: 'corner-badge', group: 'Legacy', name: 'Corner badge', short: 'Frame', desc: 'Navy badge with gold curve.' },
  { id: 'portrait-drape', group: 'Legacy', name: 'Top drape', short: 'Top drape', desc: 'White drape with gold line at the top.' },
  { id: 'round-badge', group: 'Legacy', name: 'Round badge', short: 'Round badge', desc: 'Floating round badge.' },
  { id: 'gold-frame', group: 'Legacy', name: 'Gold frame', short: 'Gold frame', desc: 'Thin gold frame with logo pill.' },
  { id: 'minimal-corner', group: 'Legacy', name: 'Corner marks', short: 'Minimal', desc: 'Logo and brackets only.' },
  { id: 'class-spotlight', group: 'Legacy', needsClass: true, name: 'Class spotlight', short: 'Class spotlight', desc: 'Navy band with class name.' },
  { id: 'winner-banner', group: 'Legacy', name: 'Winner banner', short: 'Winner banner', desc: 'Navy panel left with sponsor strip.' },
  { id: 'winner-arch', group: 'Legacy', name: 'Winner arch', short: 'Winner arch', desc: 'Gold line and crown.' },
  { id: 'winner-portrait', group: 'Legacy', name: 'Winner poster', short: 'Winner poster', desc: 'Event top, winner middle, sponsor bottom.' },
  { id: 'winner-side', group: 'Legacy', name: 'Winner panel', short: 'Winner panel', desc: 'White panel left with winner text.' },
  { id: 'winner-top', group: 'Legacy', name: 'Winner top', short: 'Winner top', desc: 'Winner bar top, sponsor strip bottom.' },
  { id: 'winner-bottom', group: 'Legacy', name: 'Winner bar', short: 'Winner bar', desc: 'One bar: winner, class, sponsor.' },
  { id: 'winner-corner', group: 'Legacy', name: 'Winner badge', short: 'Winner badge', desc: 'Diagonal white badge.' },
  { id: 'winner-minimal', group: 'Legacy', name: 'Winner minimal', short: 'Winner minimal', desc: 'Dark translucent bar.' },
];
const ALL_VARIANTS = [...TEMPLATE_VARIANTS, ...LEGACY_VARIANTS];
// Picker order per photo shape, best fit first. Used by the design modal
// and by the quick picks on the photo page.
export const RECOMMENDED_BY_ASPECT = {
  tall: ['angle', 'result-card', 'broadcast', 'rosette', 'keyline', 'logo-plate', 'side-column', 'fade-footer', 'ribbon-tag', 'split-footer', 'poster-panel', 'header-bar', 'sponsor-bar', 'mat-frame'],
  wide: ['broadcast', 'result-card', 'rosette', 'keyline', 'angle', 'fade-footer', 'poster-panel', 'ribbon-tag', 'mat-frame', 'split-footer', 'sponsor-bar', 'header-bar', 'side-column', 'logo-plate'],
  square: ['result-card', 'keyline', 'broadcast', 'rosette', 'angle', 'mat-frame', 'fade-footer', 'split-footer', 'logo-plate', 'ribbon-tag', 'sponsor-bar', 'header-bar', 'side-column', 'poster-panel'],
};
export function aspectKeyOf(w, h) {
  if (!w || !h) return 'wide';
  if (h > w * 1.15) return 'tall';
  return Math.abs(w / h - 1) < 0.2 ? 'square' : 'wide';
}


// Backend (api/src/routes/media.js + migrasi 091) hanya kenal 6 id ini.
// 15 varian di atas adalah presentasi frontend; saat checkout/cart kita
// kirim id backend terdekat lewat templateOf() agar validasi lolos.
export const BACKEND_TEMPLATES = ['corner', 'banner', 'top', 'minimal', 'winner', 'bottombar'];
const VARIANT_TO_TEMPLATE = {
  'fade-footer': 'banner', 'mat-frame': 'bottombar', 'logo-plate': 'minimal',
  'sponsor-bar': 'bottombar', 'poster-panel': 'winner',
  'header-bar': 'top', 'side-column': 'corner', 'ribbon-tag': 'winner', 'split-footer': 'bottombar',
  'broadcast': 'banner', 'keyline': 'minimal', 'result-card': 'bottombar', 'rosette': 'winner', 'angle': 'banner',
  'banner-wave': 'banner', 'portrait-swoosh': 'corner', 'square-bar': 'bottombar',
  'left-panel': 'winner', 'top-banner': 'top', 'corner-badge': 'corner',
  'portrait-drape': 'corner', 'round-badge': 'corner',   'gold-frame': 'minimal',
  'minimal-corner': 'minimal', 'class-spotlight': 'banner',
  'winner-banner': 'winner', 'winner-arch': 'winner', 'winner-portrait': 'winner', 'winner-side': 'winner',
  'winner-top': 'winner', 'winner-bottom': 'winner', 'winner-corner': 'winner',
  'winner-minimal': 'winner',
};
export function templateOf(variant) {
  return VARIANT_TO_TEMPLATE[variant] || 'corner';
}
// Varian overlay (logo menempel di atas foto) — posisi buyer berlaku.
export const OVERLAY_VARIANTS = ['corner-badge', 'minimal-corner', 'round-badge', 'logo-plate'];
export const variantName = (id) => ALL_VARIANTS.find((v) => v.id === id)?.name || id;
export const variantShort = (id) => ALL_VARIANTS.find((v) => v.id === id)?.short || id;
export const isVariant = (id) => ALL_VARIANTS.some((v) => v.id === id);
// Buyers only pick current templates; legacy ids stay valid for owned files.
export const isPickerVariant = (id) => TEMPLATE_VARIANTS.some((v) => v.id === id);
export const variantGroup = (id) => ALL_VARIANTS.find((v) => v.id === id)?.group || 'Sponsor';
export const variantNeedsClass = (id) => !!ALL_VARIANTS.find((v) => v.id === id)?.needsClass;
// Light/dark style, baked by the server too. Every picker template has
// both; of the retired ones only the three strips do.
export const THEMED_VARIANTS = [...TEMPLATE_VARIANTS.map((v) => v.id), 'banner-wave', 'square-bar', 'top-banner'];
export const isTheme = (t) => t === 'light' || t === 'dark';
// Canonical photo moments (media.moment) shown when the buyer typed none.
const MOMENT_LABELS = { win: 'Winner', clear: 'Clear round', debut: 'Debut', pb: 'Personal best' };
export function momentText(result, moment) {
  const typed = String(result || '').trim();
  return typed || MOMENT_LABELS[moment] || '';
}

// — Layout kit for the current templates. All values in s = 1% of the
// photo's short edge. Mirrored by the KIT section of logoBake.js; the
// drift test compares kitRow() tables. —
export const KIT = { gapX: 2, gapY: 1.4, label: 1.4, labelGap: 0.9, cardPadV: 1.4, cardPadH: 2.2, infoGap: 0.8 };
export const INFO_SIZES = {
  base: { event: 1.7, moment: 4.2, cls: 2.4 },
  hero: { event: 1.9, moment: 5, cls: 2.6 },
  tag: { event: 1.4, moment: 2.8, cls: 1.9 },
};
// Logo box (height, max width) per sponsor count: fewer logos, bigger.
export function kitRow(count) {
  if (count > 4) return { h: 3.6, w: 12 };
  if (count > 2) return { h: 4.5, w: 16 };
  if (count > 1) return { h: 5.5, w: 22 };
  return { h: 6.5, w: 28 };
}
const r1 = (n) => Math.round(n * 10) / 10;
// Worst-case row count (every logo at max width). Used where a container
// height must be known up front; real rows can only be fewer.
export function kitRows(count, mw) {
  const { w } = kitRow(count);
  const perRow = Math.max(1, Math.floor((mw + KIT.gapX) / (w + KIT.gapX)));
  return Math.ceil(count / perRow);
}
// Balanced rows: same row count as the worst case, logos spread evenly
// (8 logos in 2 rows = 4 + 4, never 7 + 1).
export function kitLines(list, mw) {
  const rows = kitRows(list.length, mw);
  const per = Math.ceil(list.length / rows);
  const out = [];
  for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per));
  return out;
}
export function kitSponsorH(count, mw) {
  if (!count) return 0;
  const { h } = kitRow(count);
  const rows = kitRows(count, mw);
  return KIT.label + KIT.labelGap + rows * h + (rows - 1) * KIT.gapY;
}
export function kitInfoH(info, size = 'base') {
  const z = INFO_SIZES[size];
  const parts = [];
  if (info.event) parts.push(z.event * 1.2);
  if (info.moment) parts.push(z.moment * 1.05);
  if (info.cls) parts.push(z.cls * 1.2);
  return parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * KIT.infoGap;
}
const hasInfo = (info) => Boolean(info.event || info.moment || info.cls);
// Per-template measurements (s units) for a photo of aspect ar (w/h).
export function kitLayout(variant, ar, count, info, theme = 'light') {
  // Dark surfaces put the logos on a white card (logos are drawn for white).
  const card = theme === 'dark';
  const cardW = card ? 2 * KIT.cardPadH : 0, cardH = card ? 2 * KIT.cardPadV : 0;
  const Ws = ar >= 1 ? 100 * ar : 100;
  const Hs = ar >= 1 ? 100 : 100 / ar;
  if (variant === 'fade-footer') {
    const mw = r1(0.4 * Ws - 4.4);
    const plateH = 2 * KIT.cardPadV + kitSponsorH(count, mw);
    return { mw, fadeH: r1(Math.max(34, Math.max(kitInfoH(info), plateH) + 18)) };
  }
  if (variant === 'sponsor-bar' || variant === 'header-bar') {
    const mw = r1((hasInfo(info) ? 0.55 * Ws - 4 : Ws - 8) - cardW);
    return { mw, card, barH: r1(0.5 + 4.8 + Math.max(kitInfoH(info), kitSponsorH(count, mw) + cardH)) };
  }
  if (variant === 'mat-frame') {
    const mw = r1(0.5 * Ws - 3 - cardW);
    return { mw, card, bandH: r1(6 + Math.max(kitInfoH(info), kitSponsorH(count, mw) + cardH, 8)) };
  }
  if (variant === 'side-column') {
    const { w } = kitRow(count);
    const mw = count > 4 ? w * 2 + KIT.gapX : w;
    return { mw, tagMax: r1(Ws - 10.5 - mw - 2 * KIT.cardPadH) };
  }
  if (variant === 'ribbon-tag') return { mw: r1(0.5 * Ws - 2 * KIT.cardPadH), ribMax: r1(0.62 * Ws) };
  if (variant === 'split-footer') {
    const mw = r1(hasInfo(info) ? 0.5 * Ws - 8 : Ws - 8);
    return { mw, F: r1(8 + Math.max(kitInfoH(info), kitSponsorH(count, mw))) };
  }
  if (variant === 'poster-panel') {
    if (ar >= 1) {
      const P = r1(0.34 * Ws);
      return { side: 'left', P, mw: r1(P - 8 - 2 * KIT.cardPadH) };
    }
    // Portrait: panel only as tall as its content needs (min 24% of height).
    const mw = r1(0.45 * Ws - 2 * KIT.cardPadH);
    const need = Math.max(kitInfoH(info, 'hero'), 2 * KIT.cardPadV + kitSponsorH(count, mw)) + 8.6;
    return { side: 'bottom', P: r1(Math.max(0.24 * Hs, need)), mw };
  }
  if (variant === 'logo-plate') return { mw: r1(0.6 * Ws - 2 * KIT.cardPadH), tagMax: r1(0.45 * Ws) };
  return kitLayoutT(variant, ar, count, info, theme);
}
// — T-series templates (broadcast, keyline, result-card, rosette, angle).
// Typography per text role: f = sans (Manrope) | cond (Barlow Condensed) |
// serif (DM Serif Display), w = weight, i = italic, z = size in s, ls = em,
// lh = line height, up = uppercase. Everything from here to the end of
// kitLayoutT is copied verbatim into logoBake.js (drift test compares). —
export const TYPE = {
  bcEvent: { f: 'cond', w: 600, z: 2.3, ls: 0.18, lh: 1.2, up: true },
  bcMoment: { f: 'cond', w: 800, i: true, z: 9.5, ls: 0, lh: 0.95, up: true },
  bcClass: { f: 'cond', w: 800, z: 2.8, ls: 0.06, lh: 1, up: true },
  bcLabel: { f: 'cond', w: 800, z: 1.9, ls: 0.16, lh: 1.1, up: true },
  klEvent: { f: 'sans', w: 700, z: 1.8, ls: 0.22, lh: 1.2, up: true },
  klClass: { f: 'sans', w: 700, z: 2.2, ls: 0.12, lh: 1.2, up: true },
  klMoment: { f: 'serif', w: 400, z: 8.5, ls: 0, lh: 1.05, up: false },
  rcKey: { f: 'sans', w: 800, z: 1.4, ls: 0.16, lh: 1, up: true },
  rcValue: { f: 'cond', w: 800, z: 4.4, ls: 0.01, lh: 1, up: true },
  roEvent: { f: 'sans', w: 800, z: 1.5, ls: 0.14, lh: 1.2, up: true },
  roMoment: { f: 'serif', w: 400, z: 4.8, ls: 0, lh: 1.1, up: false },
  roClass: { f: 'sans', w: 700, z: 2.1, ls: 0, lh: 1.2, up: false },
  agEvent: { f: 'cond', w: 600, z: 2.2, ls: 0.2, lh: 1.2, up: true },
  agMoment: { f: 'cond', w: 800, z: 10.5, ls: 0, lh: 0.9, up: true },
  agClass: { f: 'cond', w: 600, z: 3.1, ls: 0.04, lh: 1.2, up: false },
};
// Solid colours only (plus the few listed opacities) so both renderers agree.
export const T_COLORS = {
  broadcast: {
    light: { slab: '#0e2233', event: '#ffffff', eventOp: 0.75, moment: '#ffffff', tick: '#ffffff', label: '#0e2233' },
    dark: { slab: '#080e16', event: '#f2cd6b', eventOp: 1, moment: '#ffffff', tick: '#0e2233', label: '#ffffff' },
  },
  keyline: {
    light: { line: '#ffffff', event: '#ffffff', cls: '#ffffff', moment: '#ffffff', fade: 0.6 },
    dark: { line: '#d4a017', event: '#ffffff', cls: '#ffffff', moment: '#f2cd6b', fade: 0.78 },
  },
  'result-card': {
    light: { cell: '#ffffff', sep: '#e3e6ea', key: '#7a838b', value: '#0e2233', gold: '#9a6f00', rule: '#0e2233', sp: '#f3f4f6', spLabel: '#7a838b' },
    dark: { cell: '#0e2233', sep: '#2a3f52', key: '#9fb0c0', value: '#ffffff', gold: '#f2cd6b', rule: '#d4a017', sp: '#ffffff', spLabel: '#5a6470' },
  },
  rosette: {
    light: { plate: '#ffffff', plateOp: 0.95, event: '#5a6470', moment: '#0e2233', cls: '#0e2233' },
    dark: { plate: '#0e2233', plateOp: 0.95, event: '#9fb0c0', moment: '#ffffff', cls: '#f2cd6b' },
  },
  angle: {
    light: { slash: '#ffffff', stripe: '#d4a017', event: '#9a6f00', moment: '#0e2233', cls: '#0e2233' },
    dark: { slash: '#0e2233', stripe: '#d4a017', event: '#f2cd6b', moment: '#ffffff', cls: '#ffffff' },
  },
};
export const ANGLE_T = 0.3249; // tan(18deg): the Angle slash lean
// Logo rows without the "Supported by" label.
export function kitLogosH(count, mw) {
  if (!count) return 0;
  const rows = kitRows(count, mw);
  return rows * kitRow(count).h + (rows - 1) * KIT.gapY;
}
// Height (s) of a stack of [text, TYPE] lines; empty lines are skipped.
export function typeH(pairs, gap) {
  const on = pairs.filter(([t]) => t);
  return on.reduce((a, [, t]) => a + t.z * t.lh, 0) + Math.max(0, on.length - 1) * gap;
}
// Placing from the moment text: 1-6, 0 = not a placing (clear round, debut).
const PLACE_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
export function placingOf(text) {
  const t = String(text || '').toLowerCase();
  if (/\breserve\b/.test(t)) return 2;
  if (/\b(winner|champion|won)\b/.test(t)) return 1;
  const d = t.match(/\b([1-6])(st|nd|rd|th)\b/);
  if (d) return Number(d[1]);
  const w = PLACE_WORDS.findIndex((x) => new RegExp(`\\b${x}\\b`).test(t));
  return w >= 0 ? w + 1 : 0;
}
export const PLACE_LABEL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
// [main, pleat] per placing: red, blue, yellow, green, pink, purple.
// Index 0 (not a placing) is navy and gold.
export const ROSETTE_COLORS = [['#0e2233', '#d4a017'], ['#c62828', '#8e1c1c'], ['#1f4fa8', '#163a7d'],
  ['#e3b505', '#a98700'], ['#2e7d32', '#1f5a23'], ['#d63384', '#a1225f'], ['#6a3fa0', '#4d2c76']];
const STAR = 'M60 43l5.3 10.8 11.9 1.7-8.6 8.4 2 11.9L60 70.2l-10.6 5.6 2-11.9-8.6-8.4 11.9-1.7Z';
// Rosette art in a 120 x 150 box. Constant markup only (no user text).
export function rosetteSvg(place, serif) {
  const [main, pleat] = ROSETTE_COLORS[place] || ROSETTE_COLORS[0];
  const center = place
    ? `<text x="60" y="68.5" text-anchor="middle" font-family="${serif}" font-size="25" fill="#0e2233">${PLACE_LABEL[place]}</text>`
    : `<path d="${STAR}" fill="#d4a017"/>`;
  return `<path d="M46 80 32 146l14-9 10 13 6-66Z" fill="${main}"/>`
    + `<path d="M74 80 88 146l-14-9-10 13-6-66Z" fill="${pleat}"/>`
    + `<circle cx="60" cy="60" r="56" fill="${main}"/>`
    + `<circle cx="60" cy="60" r="49" fill="none" stroke="${pleat}" stroke-width="10" stroke-dasharray="3 2.2"/>`
    + `<circle cx="60" cy="60" r="38" fill="#ffffff" stroke="${pleat}" stroke-width="2"/>`
    + center;
}
// Result card cells: one row, or on portrait the event alone on top.
export function resultCells(info, ar) {
  const all = [['Event', info.event, 1.3, false], ['Class', info.cls, 1, false], ['Result', info.moment, 1.2, true]]
    .filter((c) => c[1]).map(([key, text, wt, gold]) => ({ key, text, wt, gold }));
  if (!all.length) return [];
  if (ar < 1 && info.event && all.length > 1) return [all.slice(0, 1), all.slice(1)];
  return [all];
}
export function kitLayoutT(variant, ar, count, info, theme = 'light') {
  const dark = theme === 'dark';
  const Ws = ar >= 1 ? 100 * ar : 100;
  const cardW = 2 * KIT.cardPadH, cardH = 2 * KIT.cardPadV;
  if (variant === 'broadcast') {
    const lab = 11;
    const mw = r1(Ws - 8 - lab - 3 - (dark ? cardW : 0));
    const tickH = r1(Math.max(9, 0.6 + 3.6 + kitLogosH(count, mw) + (dark ? cardH : 0)));
    const tabH = info.cls ? r1(TYPE.bcClass.z * TYPE.bcClass.lh + 1.6) : 0;
    return { mw, lab, card: dark, tickH, tabH, slabBottom: r1(tickH + 1.4 + (tabH ? tabH + 1 : 0)), textMax: r1(0.62 * Ws - 10) };
  }
  if (variant === 'keyline') {
    const avail = Ws - 11;
    return { eventMax: r1(avail), textMax: r1(0.55 * avail), mw: r1(0.45 * avail - cardW) };
  }
  if (variant === 'result-card') {
    const lab = 13;
    const mw = r1(Ws - 6 - lab - 2);
    const rows = resultCells(info, ar).length;
    const cellH = r1(3.6 + TYPE.rcKey.z * TYPE.rcKey.lh + 0.8 + TYPE.rcValue.z * TYPE.rcValue.lh);
    const spH = r1(3.2 + Math.max(TYPE.rcKey.z, kitLogosH(count, mw)));
    return { mw, lab, Ws, rows, cellH, spH, F: r1(0.6 + rows * cellH + spH) };
  }
  if (variant === 'rosette') {
    const half = (Ws - 11) / 2;
    return { size: 24, textMax: r1(half - 4.8), mw: r1(half - cardW) };
  }
  if (variant === 'angle') {
    const top = ar < 1;
    const h = r1(typeH([[info.event, TYPE.agEvent], [info.moment, TYPE.agMoment], [info.cls, TYPE.agClass]], 0.8) + 8.5);
    return { top, h, ht: r1(h * ANGLE_T), textMax: r1(top ? Ws - 14 : 0.48 * Ws - 7), mw: r1((top ? 0.6 : 0.38) * Ws - cardW) };
  }
  return {};
}
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const CORNER_CLASS = { 'top-left': 'pos-tl', 'top-right': 'pos-tr', 'bottom-left': 'pos-bl', 'bottom-right': 'pos-br' };
// logo-plate: corner plates up to 3 logos, one wrapped plate past that, so
// a corner is always free for the moment tag.
export const PLATE_MAX_CORNERS = 3;
export function freeCorner(used) {
  return CORNERS.find((c) => !used.includes(c)) || null;
}
// "16 / 9" or "3000 / 2000" -> width / height; null when unknown.
function parseRatio(ratio) {
  const m = String(ratio || '').match(/^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/);
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
}

// Pilihan desain terakhir per foto — tombol Save di modal menulis ini,
// halaman checkout membacanya lagi supaya tidak hilang saat reload.
const SAVE_PREFIX = 'bossmedia:sponsor-design:';
export function saveDesign(mediaId, { template, logoIds, logoPos, theme, tags }) {
  try {
    if (!mediaId) return;
    // tags (buyer tag override) merge dari draft tersimpan bila panggilan
    // ini tidak menyebutnya — mis. Save di LogoModal tidak boleh menghapus
    // tag yang diedit di TagEditor.
    const prev = loadDesign(mediaId);
    localStorage.setItem(SAVE_PREFIX + mediaId, JSON.stringify({
      template: isVariant(template) ? template : 'banner-wave',
      logoIds: (logoIds || []).slice(0, MAX_SPONSOR_LOGOS),
      logoPos: logoPos || {},
      theme: isTheme(theme) ? theme : 'light',
      tags: tags !== undefined ? tags : (prev?.tags || null),
    }));
  } catch { /* private mode: pilihan sesi ini tetap jalan */ }
}
export function clearDesign(mediaId) {
  try {
    if (!mediaId) return;
    localStorage.removeItem(SAVE_PREFIX + mediaId);
  } catch { /* private mode: nothing stored anyway */ }
}
export function loadDesign(mediaId) {
  try {
    if (!mediaId) return null;
    const raw = localStorage.getItem(SAVE_PREFIX + mediaId);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || !isVariant(j.template)) return null;
    return { template: j.template, logoIds: Array.isArray(j.logoIds) ? j.logoIds : [], logoPos: j.logoPos || {}, theme: isTheme(j.theme) ? j.theme : 'light', tags: j.tags || null };
  } catch { return null; }
}

// Nothing picked yet: an empty dashed slot, never a fake brand that could
// read as a real (discounted) sponsor.
function DefaultLogo({ light = false }) {
  return (
    <span className={`${s["st-logo-default"]}${light ? ` ${s["light"]}` : ''}`}>Sponsor logo</span>
  );
}

function LogoImg({ logo, light = false }) {
  if (!logo?.src) return <DefaultLogo light={light} />;
  return <SmartImage src={logo.src} alt={logo.label || 'Sponsor logo'} unoptimized
    width={160} height={60} style={{ objectFit: 'contain' }} className={`${s["st-logo-img"]}`} />;
}

function SupportedLabel({ light = false }) {
  return (
    <span className={`${s["st-supported"]}${light ? " " + s["light"] : ""}`}>
      <span>Supported by</span>
      <i aria-hidden="true" />
    </span>
  );
}

function WinnerLaurel({ children, gold = false }) {
  const leaves = (xs, dir) => xs.map(([cx, cy], i) => (
    <ellipse key={i} cx={cx} cy={cy} rx="2.8" ry="1.4" transform={`rotate(${dir * 45} ${cx} ${cy})`} fill="currentColor" stroke="none" />
  ));
  return (
    <span className={`${s["st-winner"]}${gold ? " " + s["gold"] : ""}`}>
      <svg viewBox="0 0 24 32" aria-hidden="true">
        <path d="M19 2C12 7 8 16 7 30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        {leaves([[14, 9], [11, 14], [9, 19], [8, 24]], -1)}
      </svg>
      <span className={`${s["st-winner-mid"]}`}>{children}</span>
      <svg viewBox="0 0 24 32" aria-hidden="true">
        <path d="M5 2C12 7 16 16 17 30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        {leaves([[10, 9], [13, 14], [15, 19], [16, 24]], 1)}
      </svg>
    </span>
  );
}

function CrownMark() {
  return (
    <svg viewBox="0 0 28 18" aria-hidden="true" className={`${s["st-crown"]}`}>
      <path d="M2 15 5 5l5 6 4-9 4 9 5-6 3 10Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <line x1="3" y1="15.5" x2="25" y2="15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Nama event asli bisa 50+ karakter ("Auckland SJ & Waitemata SJ Spring
// Showjumping Festival") — panel 28% tak muat. Pendekkan konsisten di semua
// overlay, nama penuh tetap di title.
export function shortEventName(name = '') {
  const raw = String(name || '').trim();
  if (raw.length <= 26) return raw;
  const head = raw.split(/\s*[&·\-–—]\s*/)[0].trim();
  if (head && head.length <= 26) return head;
  return `${raw.slice(0, 24).trim()}…`;
}
// "Kuda × Rider" kepotong CSS jadi "Olivia.." gantung. Potong sadar delimiter:
// kuda penuh + nama depan rider, maks 28 char, penuh di title.
export function shortSubject(name = '') {
  const raw = String(name || '').trim();
  if (raw.length <= 28) return raw;
  const parts = raw.split('×');
  if (parts.length === 2) {
    const horse = parts[0].trim();
    const riderFirst = parts[1].trim().split(/\s+/)[0] || '';
    const combo = riderFirst ? `${horse} × ${riderFirst}` : horse;
    if (combo.length <= 28) return combo;
    if (horse.length <= 26) return horse;
  }
  return `${raw.slice(0, 26).trim()}…`;
}
function EventHead({ event = 'AUCKLAND SHOW JUMPING CHAMPIONSHIP', light = false }) {
  const short = shortEventName(event);
  return (
    <span className={`${s["st-event"]}${light ? " " + s["light"] : ""}`} title={event}>
      <svg viewBox="0 0 32 24" aria-hidden="true"><path d="M3 20C5 12 10 5 17 4c4-.5 8 1 11 5M7 20c2-6 6-11 12-12M17 4c-1 3-1 7 1 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      <strong>{short}</strong>
    </span>
  );
}

function ClassPill({ children }) {
  if (!children) return null;
  return (
    <span className={`${s["st-class"]}`}><span className={`${s["st-class-tag"]}`}>CLASS</span><span>{children}</span></span>
  );
}

// Satu baris untuk 1–8 logo: ukuran menciut ikut jumlah (CSS .multi,
// .multi3 untuk 3–4, .multi5 untuk 5–8). Satu baris terus — tidak wrap —
// supaya preview selalu sama dengan hasil bake. Dipakai semua lockup
// strip; overlay (badge/minimal/round) dirender per posisi lewat posCls,
// dan diringkas jadi satu badge berisi baris ini saat logo > 4.
function LogoRow({ logos, column = false }) {
  const list = logos?.length ? logos : [{ label: 'YOUR LOGO' }];
  const multi = list.length > 1 ? ` ${s["multi"]}${list.length > 4 ? ` ${s["multi5"]}` : list.length > 2 ? ` ${s["multi3"]}` : ''}` : '';
  const col = column ? ` ${s["col"]}` : '';
  return (
    <span className={`${s["st-logos"]}${multi}${col}`}>
      {list.map((logo, i) => <LogoImg key={logo.id || i} logo={logo} />)}
    </span>
  );
}

// Event / moment / class stack. Each line is one line with ellipsis.
function Info({ info, size = 'base', tone = 'dark' }) {
  if (!hasInfo(info)) return null;
  const z = INFO_SIZES[size];
  return (
    <span className={`${s["st-info"]} ${tone === 'dark' ? s["on-dark"] : s["on-light"]}`}
      style={{ '--ie': z.event, '--im': z.moment, '--ic': z.cls }}>
      {info.event && <span className={`${s["st-info-event"]}`} title={info.event}>{info.event}</span>}
      {info.moment && <strong className={`${s["st-info-moment"]}`} title={info.moment}>{info.moment}</strong>}
      {info.cls && <span className={`${s["st-info-class"]}`} title={info.cls}>{info.cls}</span>}
    </span>
  );
}

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end' };
// "Supported by" + logos in balanced rows that fit mw (s units).
function Sponsors({ logos, mw, align = 'center', card = false, label = true, className = '' }) {
  const { h, w } = kitRow(logos.length);
  return (
    <span className={`${s["st-sp"]}${card ? ` ${s["st-card"]}` : ''}${className ? ` ${className}` : ''}`}
      style={{ '--mw': mw, '--lh': h, '--lw': w, '--jc': JUSTIFY[align] }}>
      {label && <small>Supported by</small>}
      <span className={`${s["st-row"]}`}>
        {kitLines(logos, mw).map((line, li) => (
          <span key={li} className={`${s["st-line"]}`}>
            {line.map((logo, i) => <LogoImg key={logo.id || i} logo={logo} />)}
          </span>
        ))}
      </span>
    </span>
  );
}

const FAM = { sans: 'inherit', cond: condFont.style.fontFamily, serif: serifFont.style.fontFamily };
// One line of T-series text: single line, ellipsis past max (s units).
function Txt({ t, max, color, op, children }) {
  if (!children) return null;
  return (
    <span className={`${s["st-t"]}`} title={String(children)} style={{
      fontFamily: FAM[t.f], fontWeight: t.w, fontStyle: t.i ? 'italic' : 'normal',
      fontSize: `calc(var(--s) * ${t.z})`, letterSpacing: `${t.ls}em`, lineHeight: t.lh,
      textTransform: t.up ? 'uppercase' : 'none', paddingRight: t.i ? '0.1em' : 0,
      maxWidth: max != null ? `calc(var(--s) * ${max})` : undefined, color, opacity: op,
    }}>{children}</span>
  );
}
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export default function SponsorPhoto({
  photo, alt = 'Sponsored photo', ratio = '16 / 9', variant = 'banner-wave',
  sponsors = [], positions = {}, event, className: classLabel, result = '', subject = '',
  frameStyle, compact = false, onAspect, theme = 'light',
}) {
  const logos = sponsors?.length ? sponsors : [{ label: 'YOUR LOGO' }];
  const dark = theme === 'dark' && THEMED_VARIANTS.includes(variant);
  // ratio null = natural: ukur dimensi asli foto sekali, lalu bingkai
  // mengikuti aspeknya. onAspect memberi tahu induk (mis. modal) agar
  // thumbnail ikut rasio yang sama — tidak ada crop paksa di mana pun.
  const [nat, setNat] = useState(null);
  useEffect(() => {
    if (ratio || !photo) return;
    const im = new Image();
    im.onload = () => {
      setNat({ w: im.width, h: im.height });
      onAspect?.({ w: im.width, h: im.height });
    };
    im.src = photo;
  }, [ratio, photo, onAspect]);
  const ar = ratio || (nat ? `${nat.w} / ${nat.h}` : undefined);
  // Short-edge unit: 1cqw on portrait, 1cqw × h/w on landscape.
  const arNum = parseRatio(ar);
  const shortK = arNum ? Math.min(1, 1 / arNum) : 1;
  const info = { event: event || '', moment: result || '', cls: classLabel || '' };
  const L = kitLayout(variant, arNum || 1.5, logos.length, info, dark ? 'dark' : 'light');
  const tone = dark ? 'dark' : 'light';
  const C = T_COLORS[variant]?.[tone];
  const sv = (n) => `calc(var(--s) * ${n})`;
  // Photo window for layouts that shrink the photo instead of covering it.
  const windowStyle = variant === 'mat-frame'
    ? { top: sv(3), left: sv(3), right: sv(3), bottom: sv(L.bandH) }
    : variant === 'poster-panel'
      ? (L.side === 'left' ? { top: 0, bottom: 0, right: 0, left: sv(L.P) } : { top: 0, left: 0, right: 0, bottom: sv(L.P) })
      : variant === 'split-footer' || variant === 'result-card'
        ? { top: 0, left: 0, right: 0, bottom: sv(L.F) }
        : null;
  const frameBg = ['mat-frame', 'poster-panel', 'split-footer', 'result-card'].includes(variant)
    ? (dark ? s["st-postered"] : s["st-matted"]) : '';
  // Empat sudut = empat posisi; logo ke-5+ tidak pernah mencapai sini
  // (overlay diringkas jadi satu badge — lihat wide di bawah).
  const posOf = (i) => positions[logos[i]?.id] || ['bottom-left', 'bottom-right', 'top-right', 'top-left'][i % 4];
  const posCls = (i) => {
    const p = posOf(i);
    if (p === 'top-right') return s['pos-tr'];
    if (p === 'bottom-right') return s['pos-br'];
    if (p === 'top-left') return s['pos-tl'];
    return s['pos-bl'];
  };
  // Overlay menampung 1 badge per sudut; lebih dari 4 logo diringkas jadi
  // satu badge berisi baris penuh di posisi pertama (tidak overlap,
  // tidak ada logo terbuang — bake melakukan hal yang sama).
  const wide = logos.length > 4;
  return (
    <div className={`${s["st-frame"]}${ar ? '' : ` ${s["st-natural"]}`}${compact ? ` ${s["st-compact"]}` : ''}${logos.length > 1 ? ` ${s["multi"]}` : ''}${frameBg ? ` ${frameBg}` : ''}`} style={{ ...(ar ? { aspectRatio: ar } : undefined), '--k': shortK, ...frameStyle }}>
      {photo && ar && windowStyle ? (
        <div className={`${s["st-window"]}`} style={windowStyle}>
          <SmartImage src={photo} alt={alt} fill sizes="(max-width: 640px) 100vw, 560px" className={`${s["st-photo"]}`} />
        </div>
      ) : photo && ar ? (
        <SmartImage src={photo} alt={alt} fill sizes="(max-width: 640px) 100vw, 560px" className={`${s["st-photo"]}`} />
      ) : (
        <div className={`${s["st-photo"]} ${s["st-photo-ph"]}`} aria-hidden="true"><span>PHOTO</span></div>
      )}

      {variant === 'broadcast' && (
        <>
          {(info.event || info.moment) && (
            <div className={`${s["st-bc-slab"]}`} style={{ bottom: sv(L.slabBottom), background: C.slab }}>
              <Txt t={TYPE.bcEvent} max={L.textMax} color={C.event} op={C.eventOp}>{info.event}</Txt>
              <Txt t={TYPE.bcMoment} max={L.textMax} color={C.moment}>{info.moment}</Txt>
            </div>
          )}
          {info.cls && (
            <span className={`${s["st-bc-tab"]}`} style={{ bottom: sv(L.tickH + 1.4) }}>
              <Txt t={TYPE.bcClass} max={L.textMax} color="#0e2233">{info.cls}</Txt>
            </span>
          )}
          <div className={`${s["st-bc-tick"]}`} style={{ height: sv(L.tickH), background: C.tick }}>
            <span className={`${s["st-bc-label"]}`} style={{ width: sv(L.lab) }}>
              <Txt t={TYPE.bcLabel} color={C.label}>Official</Txt>
              <Txt t={TYPE.bcLabel} color={C.label}>Partners</Txt>
            </span>
            <Sponsors logos={logos} mw={L.mw} align="start" card={L.card} label={false} />
          </div>
        </>
      )}

      {variant === 'keyline' && (
        <>
          <span className={`${s["st-kl-top"]}`} aria-hidden="true" />
          <span className={`${s["st-kl-bottom"]}`} style={{ '--fo': C.fade }} aria-hidden="true" />
          <span className={`${s["st-kl-line"]}`} style={{ '--lc': C.line }} aria-hidden="true" />
          {info.event && (
            <span className={`${s["st-kl-event"]}`}><Txt t={TYPE.klEvent} max={L.eventMax} color={C.event}>{info.event}</Txt></span>
          )}
          {(info.cls || info.moment) && (
            <div className={`${s["st-kl-text"]}`}>
              <Txt t={TYPE.klClass} max={L.textMax} color={C.cls}>{info.cls}</Txt>
              <Txt t={TYPE.klMoment} max={L.textMax} color={C.moment}>{info.moment}</Txt>
            </div>
          )}
          <Sponsors logos={logos} mw={L.mw} card className={`${s["st-kl-sp"]}`} />
        </>
      )}

      {variant === 'result-card' && (
        <div className={`${s["st-rc"]}`} style={{ height: sv(L.F), borderTopColor: C.rule }}>
          {resultCells(info, arNum || 1.5).map((row, ri) => {
            const sum = row.reduce((a, c) => a + c.wt, 0);
            return (
              <div key={ri} className={`${s["st-rc-row"]}`} style={{
                gridTemplateColumns: row.map((c) => `minmax(0, ${c.wt}fr)`).join(' '), height: sv(L.cellH),
                background: C.cell, boxShadow: ri ? `inset 0 1px 0 ${C.sep}` : 'none' }}>
                {row.map((c, ci) => (
                  <div key={c.key} className={`${s["st-rc-cell"]}`} style={{ boxShadow: ci ? `inset 1px 0 0 ${C.sep}` : 'none' }}>
                    <Txt t={TYPE.rcKey} color={C.key}>{c.key}</Txt>
                    <Txt t={TYPE.rcValue} max={r1((L.Ws * c.wt) / sum - 6)} color={c.gold ? C.gold : C.value}>{c.text}</Txt>
                  </div>
                ))}
              </div>
            );
          })}
          <div className={`${s["st-rc-sp"]}`} style={{ height: sv(L.spH), background: C.sp }}>
            <span className={`${s["st-rc-label"]}`} style={{ width: sv(L.lab) }}><Txt t={TYPE.rcKey} color={C.spLabel}>Supported by</Txt></span>
            <Sponsors logos={logos} mw={L.mw} align="end" label={false} />
          </div>
        </div>
      )}

      {variant === 'rosette' && (
        <>
          <svg className={`${s["st-ro"]}`} viewBox="0 0 120 150" style={{ width: sv(L.size) }} aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: rosetteSvg(placingOf(info.moment), FAM.serif.replace(/"/g, "'")) }} />
          {hasInfo(info) && (
            <div className={`${s["st-ro-plate"]}`} style={{ background: rgba(C.plate, C.plateOp) }}>
              <Txt t={TYPE.roEvent} max={L.textMax} color={C.event}>{info.event}</Txt>
              <Txt t={TYPE.roMoment} max={L.textMax} color={C.moment}>{info.moment}</Txt>
              <Txt t={TYPE.roClass} max={L.textMax} color={C.cls}>{info.cls}</Txt>
            </div>
          )}
          <Sponsors logos={logos} mw={L.mw} card className={`${s["st-ro-sp"]}`} />
        </>
      )}

      {variant === 'angle' && (
        <>
          {hasInfo(info) && (
            <div className={`${s["st-ag"]}`} style={{ '--ht': L.ht, height: sv(L.h), paddingRight: sv(4 + L.ht), minWidth: sv(40 + L.ht) }}>
              <span className={`${s["st-ag-bg"]}`} style={{ background: C.slash }} aria-hidden="true" />
              <span className={`${s["st-ag-stripe"]}`} style={{ background: C.stripe }} aria-hidden="true" />
              <Txt t={TYPE.agEvent} max={L.textMax} color={C.event}>{info.event}</Txt>
              <Txt t={TYPE.agMoment} max={L.textMax} color={C.moment}>{info.moment}</Txt>
              <Txt t={TYPE.agClass} max={L.textMax} color={C.cls}>{info.cls}</Txt>
            </div>
          )}
          <Sponsors logos={logos} mw={L.mw} card className={`${s["st-corner-at"]} ${s[L.top ? 'pos-tr' : 'pos-br']}`} />
        </>
      )}

      {variant === 'fade-footer' && (
        <>
          <span className={`${s["st-fade"]}${dark ? '' : ` ${s["st-fade-light"]}`}`} style={{ height: sv(L.fadeH) }} aria-hidden="true" />
          <div className={`${s["st-lower"]}`}>
            <Info info={info} tone={tone} />
            <Sponsors logos={logos} mw={L.mw} card />
          </div>
        </>
      )}

      {(variant === 'sponsor-bar' || variant === 'header-bar') && (
        <div className={`${s["st-bar"]}${variant === 'header-bar' ? ` ${s["st-bar-top"]}` : ''}${dark ? ` ${s["st-surf-dark"]}` : ''}${hasInfo(info) ? '' : ` ${s["st-solo"]}`}`} style={{ height: sv(L.barH) }}>
          <Info info={info} tone={tone} />
          <Sponsors logos={logos} mw={L.mw} card={L.card} align={hasInfo(info) ? 'end' : 'center'} />
        </div>
      )}

      {variant === 'mat-frame' && (
        <div className={`${s["st-band"]}${hasInfo(info) ? '' : ` ${s["st-solo"]}`}`} style={{ height: sv(L.bandH) }}>
          <Info info={info} tone={tone} />
          <Sponsors logos={logos} mw={L.mw} card={L.card} align={hasInfo(info) ? 'end' : 'center'} />
        </div>
      )}

      {variant === 'poster-panel' && (
        <>
          <div className={`${s["st-panel"]} ${L.side === 'left' ? s["st-panel-side"] : s["st-panel-foot"]}${dark ? '' : ` ${s["st-panel-light"]}`}${hasInfo(info) ? '' : ` ${s["st-solo"]}`}`}
            style={L.side === 'left' ? { width: sv(L.P) } : { height: sv(L.P) }}>
            <Info info={info} size="hero" tone={tone} />
            <Sponsors logos={logos} mw={L.mw} card />
          </div>
          <span className={`${s["st-panel-rule"]}`} aria-hidden="true"
            style={L.side === 'left' ? { left: sv(L.P - 0.6), top: 0, bottom: 0, width: sv(0.6) } : { bottom: sv(L.P - 0.6), left: 0, right: 0, height: sv(0.6) }} />
        </>
      )}

      {variant === 'logo-plate' && (() => {
        const corners = logos.length > PLATE_MAX_CORNERS
          ? [{ pos: posOf(0), list: logos }]
          : logos.map((logo, i) => ({ pos: posOf(i), list: [logo] }));
        const tagAt = freeCorner(corners.map((c) => c.pos));
        const tagInfo = { event: '', moment: info.moment, cls: info.cls };
        return (
          <>
            {corners.map((c, i) => (
              <Sponsors key={c.list[0]?.id || i} logos={c.list} mw={L.mw} card
                className={`${s["st-corner-at"]} ${s[CORNER_CLASS[c.pos]]}`} />
            ))}
            {tagAt && hasInfo(tagInfo) && (
              <span className={`${s["st-tag"]}${dark ? '' : ` ${s["st-tag-light"]}`} ${s["st-corner-at"]} ${s[CORNER_CLASS[tagAt]]}`} style={{ maxWidth: sv(L.tagMax) }}>
                <Info info={tagInfo} size="tag" tone={tone} />
              </span>
            )}
          </>
        );
      })()}

      {variant === 'side-column' && (
        <>
          <Sponsors logos={logos} mw={L.mw} card className={`${s["st-col"]}`} />
          {hasInfo(info) && (
            <span className={`${s["st-tag"]}${dark ? '' : ` ${s["st-tag-light"]}`} ${s["st-corner-at"]} ${s["pos-bl"]}`} style={{ maxWidth: sv(L.tagMax) }}>
              <Info info={info} tone={tone} />
            </span>
          )}
        </>
      )}

      {variant === 'ribbon-tag' && (
        <>
          {hasInfo(info) && (
            <span className={`${s["st-ribbon"]}${dark ? ` ${s["st-surf-dark"]}` : ''}`} style={{ maxWidth: sv(L.ribMax) }}>
              <Info info={info} tone={tone} />
            </span>
          )}
          <Sponsors logos={logos} mw={L.mw} card className={`${s["st-corner-at"]} ${s["pos-br"]}`} />
        </>
      )}

      {variant === 'split-footer' && (
        <div className={`${s["st-split"]}${dark ? ` ${s["st-split-dark"]}` : ''}${hasInfo(info) ? '' : ` ${s["st-solo"]}`}`} style={{ height: sv(L.F) }}>
          {hasInfo(info) && <div className={`${s["st-split-info"]}`}><Info info={info} tone={tone} /></div>}
          <div className={`${s["st-split-sp"]}`}><Sponsors logos={logos} mw={L.mw} /></div>
        </div>
      )}

      {(variant === 'banner-wave') && (
        <>
          {!dark && (
          <svg className={`${s["st-wave"]}`} viewBox="0 0 800 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 78 C160 60 260 96 420 74 C580 52 660 88 800 40 L800 120 L0 120 Z" fill="#fff" />
            <path d="M0 78 C160 60 260 96 420 74 C580 52 660 88 800 40" fill="none" stroke="#0e2233" strokeWidth="7" />
            <path d="M0 84 C160 66 260 102 420 80 C580 58 660 94 800 46" fill="none" stroke="#d4a017" strokeWidth="3" />
          </svg>
          )}
          <div className={`${s["st-strip"]} ${s["st-strip-bottom"]}${dark ? ` ${s["st-dark"]}` : ''}`}>
            <SupportedLabel light={dark} />
            <LogoRow logos={logos} />
          </div>
        </>
      )}

      {variant === 'portrait-swoosh' && (
        <>
          <svg className={`${s["st-swoosh"]}`} viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
            <path d="M120 300 C150 200 260 170 400 150 L400 300 Z" fill="#fff" />
            <path d="M120 300 C150 200 260 170 400 150" fill="none" stroke="#d4a017" strokeWidth="5" />
            <path d="M132 300 C160 210 264 180 400 162" fill="none" stroke="#0e2233" strokeWidth="10" />
          </svg>
          <div className={`${s["st-swoosh-lockup"]}`}>
            <small>SUPPORTED BY</small>
            <LogoRow logos={logos} />
          </div>
        </>
      )}

      {variant === 'square-bar' && (
        <div className={`${s["st-strip"]} ${s["st-strip-square"]}${dark ? ` ${s["st-dark"]}` : ''}`}>
          <SupportedLabel light={dark} />
          <span className={`${s["st-divider"]}`} aria-hidden="true" />
          <LogoRow logos={logos} />
        </div>
      )}

      {variant === 'left-panel' && (
        <div className={`${s["st-side"]}`}>
          <small>SUPPORTED BY</small>
          <LogoRow logos={logos} column />
          {event && <strong className={`${s["st-side-event"]}`}>{event}</strong>}
          {classLabel && <span className={`${s["st-side-class"]}`}>{classLabel}</span>}
        </div>
      )}

      {variant === 'top-banner' && (
        <div className={`${s["st-strip"]} ${s["st-strip-top"]}${dark ? ` ${s["st-dark"]}` : ''}`}>
          <SupportedLabel light={dark} />
          <span className={`${s["st-divider"]}`} aria-hidden="true" />
          <LogoRow logos={logos} />
        </div>
      )}

      {variant === 'corner-badge' && (wide ? (
        <div className={`${s["st-badge"]} ${s["wide"]} ${posCls(0)}`}>
          <small>SUPPORTED BY</small>
          <span className={`${s["st-badge-logo"]}`}><LogoRow logos={logos} /></span>
        </div>
      ) : logos.map((logo, i) => (
        <div key={logo.id || i} className={`${s["st-badge"]} ${posCls(i)}`}>
          <small>SUPPORTED BY</small>
          <span className={`${s["st-badge-logo"]}`}><LogoImg logo={logo} light /></span>
        </div>
      )))}

      {variant === 'portrait-drape' && (
        <>
          <svg className={`${s["st-drape"]}`} viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 0 L400 0 L400 60 C320 96 240 70 160 92 C100 108 40 104 0 118 Z" fill="#fff" />
            <path d="M0 118 C40 104 100 108 160 92 C240 70 320 96 400 60" fill="none" stroke="#d4a017" strokeWidth="3.5" />
            <path d="M0 126 C40 112 100 116 160 100 C240 78 320 104 400 68" fill="none" stroke="#0e2233" strokeWidth="5" />
          </svg>
          <div className={`${s["st-drape-lockup"]}`}>
            <small>SUPPORTED BY</small>
            <LogoRow logos={logos} />
          </div>
        </>
      )}

      {variant === 'round-badge' && (wide ? (
        <div className={`${s["st-round"]} ${s["wide"]} ${posCls(0)}`}>
          <LogoRow logos={logos} />
        </div>
      ) : logos.map((logo, i) => (
        <div key={logo.id || i} className={`${s["st-round"]} ${posCls(i)}`}>
          <LogoImg logo={logo} />
        </div>
      )))}

      {variant === 'gold-frame' && (
        <>
          <span className={`${s["st-gframe"]}`} aria-hidden="true" />
          <div className={`${s["st-gpill"]}`}>
            <SupportedLabel />
            <LogoRow logos={logos} />
          </div>
        </>
      )}

      {variant === 'minimal-corner' && (
        <>
          <span className={`${s["st-corner"]} ${s["tl"]}`} aria-hidden="true" />
          <span className={`${s["st-corner"]} ${s["br"]}`} aria-hidden="true" />
          {wide ? (
            <div className={`${s["st-minimal"]} ${s["wide"]} ${posCls(0)}`}><LogoRow logos={logos} /></div>
          ) : logos.map((logo, i) => (
            <div key={logo.id || i} className={`${s["st-minimal"]} ${posCls(i)}`}><LogoImg logo={logo} /></div>
          ))}
        </>
      )}

      {variant === 'class-spotlight' && classLabel && (
        <div className={`${s["st-strip"]} ${s["st-classband"]}`}>
          <span className={`${s["st-classband-left"]}`}>
            <span className={`${s["st-class-tag"]}`}>CLASS</span>
            <strong className={`${s["st-classband-name"]}`}>{classLabel}</strong>
          </span>
          <span className={`${s["st-minchip"]}`}><LogoRow logos={logos} /></span>
        </div>
      )}

      {variant === 'winner-arch' && (
        <>
          <div className={`${s["st-wpanel"]} ${s["st-wpanel-arch"]}`}>
            <div className={`${s["st-wpanel-top"]}`}>
              <EventHead event={event} light />
              {classLabel ? <ClassPill>{classLabel}</ClassPill> : null}
            </div>
            <span className={`${s["st-arch-crown"]}`}><CrownMark /></span>
            {/* Laurel dicabut juga di sini: di panel 28% daun 3.2cqw terbaca
                sebagai kurung "( )". Arch = crown + WINNER polos + border lurus;
                seam melengkung yang motong subjek dihapus. */}
            <span className={`${s["st-winner-plain"]}`}><strong>{result || 'WINNER'}</strong></span>
            {subject && <em className={`${s["st-subject"]} ${s["light"]}`} title={subject}>{shortSubject(subject)}</em>}
          </div>
          <div className={`${s["st-strip"]} ${s["st-strip-bottom"]}`}>
            <SupportedLabel />
            <LogoRow logos={logos} />
          </div>
        </>
      )}
      {variant === 'winner-banner' && (
        <>
          <div className={`${s["st-wpanel"]}`}>
            <div className={`${s["st-wpanel-top"]}`}>
              <EventHead event={event} light />
              {classLabel ? <ClassPill>{classLabel}</ClassPill> : null}
            </div>
            {/* WINNER polos tanpa laurel: daun 3.2cqw di panel 28% terbaca
                sebagai kurung "( )". Laurel + mahkota hanya milik winner-arch. */}
            <span className={`${s["st-winner-plain"]}`}><strong>{result || 'WINNER'}</strong></span>
            {subject && <em className={`${s["st-subject"]} ${s["light"]}`} title={subject}>{shortSubject(subject)}</em>}
          </div>
          <div className={`${s["st-strip"]} ${s["st-strip-bottom"]}`}>
            <SupportedLabel />
            <LogoRow logos={logos} />
          </div>
        </>
      )}
      {variant === 'winner-portrait' && (
        <>
          <div className={`${s["st-vhead"]}`}><EventHead event={event} /></div>
          <div className={`${s["st-vfoot"]}`}>
            {classLabel ? <ClassPill>{classLabel}</ClassPill> : null}
            <WinnerLaurel gold><strong>{result || 'WINNER'}</strong></WinnerLaurel>
            {subject && <em className={`${s["st-subject"]} ${s["light"]}`}>{subject}</em>}
            <div className={`${s["st-strip"]} ${s["st-strip-ghost"]}`}>
              <SupportedLabel light />
              <LogoRow logos={logos} />
            </div>
          </div>
        </>
      )}

      {variant === 'winner-side' && (
        <>
          <div className={`${s["st-wside"]}`}>
            <div className={`${s["st-wside-top"]}`}>
              <EventHead event={event} />
              {classLabel ? <ClassPill>{classLabel}</ClassPill> : null}
            </div>
            <div className={`${s["st-wside-mid"]}`}>
              <WinnerLaurel><strong>{result || 'WINNER'}</strong></WinnerLaurel>
              {subject && <em className={`${s["st-subject"]}`}>{subject}</em>}
            </div>
            <div className={`${s["st-wside-sponsor"]}`}><SupportedLabel /><LogoRow logos={logos} column /></div>
          </div>
        </>
      )}

      {variant === 'winner-top' && (
        <>
          <div className={`${s["st-strip"]} ${s["st-strip-top"]} ${s["st-strip-winner"]}`}>
            <WinnerLaurel><strong>{result || 'WINNER'}</strong></WinnerLaurel>
            {classLabel ? <ClassPill>{classLabel}</ClassPill> : null}
          </div>
          <div className={`${s["st-strip"]} ${s["st-strip-bottom"]}`}>
            <SupportedLabel />
            <LogoRow logos={logos} />
          </div>
        </>
      )}

      {variant === 'winner-bottom' && (
        <div className={`${s["st-strip"]} ${s["st-strip-wbar"]}`}>
          <span className={`${s["st-wbar-win"]}`}>
            <WinnerLaurel gold><strong>{result || 'WINNER'}</strong></WinnerLaurel>
            {classLabel ? <ClassPill>{classLabel}</ClassPill> : null}
          </span>
          <span className={`${s["st-wbar-sp"]}`}>
            <SupportedLabel />
            <LogoRow logos={logos} />
          </span>
        </div>
      )}

      {variant === 'winner-corner' && (
        <>
          <div className={`${s["st-diag"]}`}><SupportedLabel /><LogoRow logos={logos} /></div>
        </>
      )}

      {variant === 'winner-minimal' && (
        <div className={`${s["st-strip"]} ${s["st-strip-minimal"]}`}>
          <WinnerLaurel gold><strong>{result || 'WINNER'}</strong></WinnerLaurel>
          {classLabel && <span className={`${s["st-minclass"]}`}>{classLabel}</span>}
          <span className={`${s["st-minsponsor"]}`}>
            <SupportedLabel light />
            <span className={`${s["st-minchip"]}`}><LogoRow logos={logos} /></span>
          </span>
        </div>
      )}
    </div>
  );
}
