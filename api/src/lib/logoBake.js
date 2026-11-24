// Exact-variant sponsor logo bake — WYSIWYG with the buyer preview.
// LOOK source of truth: web-bossmedia/components/SponsorTemplates.jsx
// (+ .module.css). Units: u = W/100 (1cqw — container query units are
// relative to the frame WIDTH). Strip/panel heights in % of frame HEIGHT.
// Canvas is always the photo W×H: the preview frame follows the photo's
// natural aspect with object-fit cover, so overlays sit at the same
// relative coordinates. Frame border-radius is ignored (square output).
// Fonts render via the platform sans-serif (preview uses the site font;
// layout, colors and content match, letterforms may differ slightly).
const sharp = require('sharp');
const opentype = require('opentype.js');
const fpath = require('path');
const fread = require('fs');

// Manrope — the same files the website serves (see web-bossmedia layout.jsx
// next/font). Both the browser and pango shape with HarfBuzz, so identical
// file + size + weight + letter-spacing = identical advances. Weights 900
// fall back to 800 on both sides (Manrope tops out at ExtraBold).
const MANROPE = {
  400: opentype.parse(fread.readFileSync(fpath.join(__dirname, 'fonts', 'Manrope-Regular.ttf'))),
  700: opentype.parse(fread.readFileSync(fpath.join(__dirname, 'fonts', 'Manrope-Bold.ttf'))),
  800: opentype.parse(fread.readFileSync(fpath.join(__dirname, 'fonts', 'Manrope-ExtraBold.ttf'))),
};
const manrope = (weight) => MANROPE[weight >= 800 ? 800 : weight >= 700 ? 700 : 400];
// T-series fonts: same files as web-bossmedia/components/sponsor-fonts
// (preview loads them with next/font/local). The Dockerfile installs every
// TTF in ./fonts for pango, so the SVG family names below resolve.
const ttf = (name) => opentype.parse(fread.readFileSync(fpath.join(__dirname, 'fonts', name)));
const T_FONTS = {
  sans: { 400: MANROPE[400], 700: MANROPE[700], 800: MANROPE[800] },
  cond: { 600: ttf('BarlowCondensed-SemiBold.ttf'), 800: ttf('BarlowCondensed-ExtraBold.ttf'), '800i': ttf('BarlowCondensed-ExtraBoldItalic.ttf') },
  serif: { 400: ttf('DMSerifDisplay-Regular.ttf') },
};
const T_FAMILY = { sans: 'Manrope', cond: 'Barlow Condensed', serif: 'DM Serif Display' };
const tFont = (t) => T_FONTS[t.f][t.i ? `${t.w}i` : t.w];
// Exact text width (px): glyph advances + kerning + letter-spacing after
// every char (browsers count the trailing space too).
function tw(str, fs, lsEm = 0, upper = false, weight = 800) {
  const font = manrope(weight);
  const s = upper ? String(str).toUpperCase() : String(str);
  const scale = fs / font.unitsPerEm;
  let w = 0, prev = null;
  for (const ch of s) {
    const g = font.charToGlyph(ch);
    if (prev) w += font.getKerningValue(prev, g) * scale;
    w += g.advanceWidth * scale;
    prev = g;
  }
  return w + s.length * lsEm * fs;
}
// Greedy word wrap by measured width (px), max N lines, ellipsis on overflow
// — the same rule the preview's line-clamp applies.
function wrapPx(str, maxPx, fs, weight = 400, lsEm = 0, maxLines = 2) {
  const words = String(str || '').split(/\s+/).filter(Boolean);
  const widths = (s) => tw(s, fs, lsEm, false, weight);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (widths(trial) <= maxPx) { cur = trial; continue; }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length === 1 && maxLines === 2 && widths(cur) > maxPx) {
      lines.push(ellipsize(cur, maxPx, fs, weight, lsEm)); return lines;
    }
    if (lines.length === maxLines) break;
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length >= maxLines) {
    const kept = lines.slice(0, maxLines);
    const rest = words.join(' ').length > kept.join(' ').length;
    if (rest || widths(kept[maxLines - 1]) > maxPx) kept[maxLines - 1] = ellipsize(kept[maxLines - 1], maxPx, fs, weight, lsEm);
    return kept;
  }
  return lines.length ? lines : [''];
}
function ellipsize(s, maxPx, fs, weight, lsEm) {
  const widths = (t) => tw(t, fs, lsEm, false, weight);
  let t = s;
  while (t.length > 1 && widths(t + '…') > maxPx) t = t.slice(0, -1);
  return t.length > 1 ? t + '…' : '…';
}

const LOGO_VARIANTS = [
  'banner-wave', 'portrait-swoosh', 'square-bar', 'left-panel',
  'top-banner', 'corner-badge', 'portrait-drape', 'round-badge',
  'gold-frame', 'minimal-corner', 'class-spotlight',
  'fade-footer', 'mat-frame', 'logo-plate', 'sponsor-bar', 'poster-panel',
  'winner-banner', 'winner-arch', 'winner-portrait', 'winner-side',
  'winner-top', 'winner-bottom', 'winner-corner', 'winner-minimal',
  'header-bar', 'side-column', 'ribbon-tag', 'split-footer',
  'broadcast', 'keyline', 'result-card', 'rosette', 'angle',
];
// Mirrors templateOf() in SponsorTemplates.jsx — keep both in sync
// (web-bossmedia/tests/sponsor-templates.test.mjs guards the drift).
const VARIANT_TO_TEMPLATE = {
  'banner-wave': 'banner', 'portrait-swoosh': 'corner', 'square-bar': 'bottombar',
  'left-panel': 'winner', 'top-banner': 'top', 'corner-badge': 'corner',
  'portrait-drape': 'corner', 'round-badge': 'corner', 'gold-frame': 'minimal',
  'minimal-corner': 'minimal', 'class-spotlight': 'banner',
  'fade-footer': 'banner', 'mat-frame': 'bottombar', 'logo-plate': 'minimal',
  'sponsor-bar': 'bottombar', 'poster-panel': 'winner',
  'header-bar': 'top', 'side-column': 'corner', 'ribbon-tag': 'winner', 'split-footer': 'bottombar',
  'broadcast': 'banner', 'keyline': 'minimal', 'result-card': 'bottombar', 'rosette': 'winner', 'angle': 'banner',
  'winner-banner': 'winner', 'winner-arch': 'winner', 'winner-portrait': 'winner',
  'winner-side': 'winner', 'winner-top': 'winner', 'winner-bottom': 'winner',
  'winner-corner': 'winner', 'winner-minimal': 'winner',
};
// Theme toggle only exists for these three (preview: THEMED_VARIANTS).
// Light/dark: every picker template, plus the three retired strips.
const PICKER_VARIANTS = ['fade-footer', 'sponsor-bar', 'mat-frame', 'poster-panel', 'logo-plate',
  'header-bar', 'side-column', 'ribbon-tag', 'split-footer',
  'broadcast', 'keyline', 'result-card', 'rosette', 'angle'];
const THEMED_VARIANTS = [...PICKER_VARIANTS, 'banner-wave', 'square-bar', 'top-banner'];
const OVERLAY_POS = ['bottom-left', 'bottom-right', 'top-right', 'top-left'];

const templateOf = (v) => VARIANT_TO_TEMPLATE[v] || 'corner';
const isVariant = (v) => LOGO_VARIANTS.includes(v);

const NAVY = '#0e2233', NAVY2 = '#14304a', DEEP = '#0c1c2c';
const GOLD = '#d4a017', GOLD_LT = '#f2cd6b', GOLD_DK = '#cf9a2b';
// Winner laurel fallback: painters receive the buyer result text as b.result
// (migration 097 design tags); 'WINNER' when the design has none.
const FONT = 'Manrope, sans-serif';

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r = (n) => Math.round(n * 100) / 100;
const linesH = (n, fs, lh = 1.5) => n * fs * lh;

async function sizedW(buf, w) {
  return sharp(buf).resize({ width: Math.max(8, Math.round(w)), withoutEnlargement: true }).toBuffer();
}
// Logo at fixed height (preview .st-logo-img height 5.4cqw), capped by maxW.
async function fitLogo(buf, hPx, maxWPx) {
  let b = await sharp(buf).resize({ height: Math.max(8, Math.round(hPx)) }).toBuffer();
  let m = await sharp(b).metadata();
  if ((m.width || 0) > maxWPx) {
    b = await sharp(buf).resize({ width: Math.max(8, Math.round(maxWPx)) }).toBuffer();
    m = await sharp(b).metadata();
  }
  return { data: b, w: m.width || 0, h: m.height || 0 };
}

// "Supported by" lockup: uppercase text + gold rule below (preview .st-supported).
function supported(u, x, yBase, fs, color, lsEm = 0.14) {
  const t = 'SUPPORTED BY';
  return `<text x="${r(x)}" y="${r(yBase)}" font-family="${FONT}" font-size="${r(fs)}" font-weight="800" letter-spacing="${r(lsEm * fs)}" fill="${color}">${t}</text>` +
    `<rect x="${r(x)}" y="${r(yBase + 0.5 * u)}" width="${r(6 * u)}" height="${Math.max(1, r(0.35 * u))}" fill="${GOLD}"/>`;
}
const supportedH = (u, fs) => fs + 0.5 * u + Math.max(1, 0.35 * u); // text + gap + rule
// CLASS tag + name. mode row (strips: single line, capped by nameMaxW)
// or col (panels: tag above, name wraps below).
function classPill(u, x, y, fs, name, mode, nameColor, nameMaxW = null) {
  const tagFs = 1.6 * u, tag = 'CLASS';
  const tagW = tw(tag, tagFs, 0.1, true) + 2 * 1.4 * u, tagH = tagFs + 2 * 0.5 * u;
  const nameFs = fs;
  let s = `<defs><linearGradient id="gt${r(x)}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${GOLD_LT}"/><stop offset="1" stop-color="${GOLD_DK}"/></linearGradient></defs>` +
    `<rect x="${r(x)}" y="${r(y)}" width="${r(tagW)}" height="${r(tagH)}" rx="${r(0.7 * u)}" fill="url(#gt${r(x)})"/>` +
    `<text x="${r(x + 1.4 * u)}" y="${r(y + 0.5 * u + tagFs * 0.82)}" font-family="${FONT}" font-size="${r(tagFs)}" font-weight="900" letter-spacing="${r(0.1 * tagFs)}" fill="${NAVY}">${tag}</text>`;
  if (mode === 'row') {
    // Single line with ellipsis only when it truly overflows the space
    // between the tag and the right edge (preview flex overflows the same
    // way; the old 46cqw cap truncated names the preview shows in full).
    const cap = nameMaxW === null ? 46 * u : nameMaxW;
    const maxChars = Math.max(8, Math.floor(cap / (fs * 0.5)));
    const label = name.length > maxChars ? name.slice(0, Math.max(0, maxChars - 1)) + '…' : name;
    const nx = x + tagW + 1.4 * u;
    s += `<text x="${r(nx)}" y="${r(y + tagH / 2 + fs * 0.35)}" font-family="${FONT}" font-size="${r(fs)}" font-weight="700" fill="${nameColor}">${esc(label)}</text>`;
    return { svg: s, w: tagW + 1.4 * u + tw(label, fs, 0, false, 700), h: Math.max(tagH, fs) };
  }
  const lines = wrapPx(name, nameMaxW === null ? 60 * u : nameMaxW, nameFs, 700, 0);
  let ty = y + tagH + 0.8 * u + nameFs * 0.85;
  const ts = lines.map((l) => {
    const t = `<text x="${r(x)}" y="${r(ty)}" font-family="${FONT}" font-size="${r(nameFs)}" font-weight="700" fill="${nameColor}">${esc(l)}</text>`;
    ty += nameFs * 1.25;
    return t;
  }).join('');
  return { svg: s + ts, w: Math.max(tagW, ...lines.map((l) => tw(l, nameFs, 0, false, 700))), h: tagH + 0.8 * u + linesH(lines.length, nameFs, 1.25) };
}
// Laurel branches + result text (preview WinnerLaurel). Branches are always
// gold (#b98f1f via currentColor); gold = gradient text, else navy text.
function laurel(u, cx, yMid, text, gold) {
  const fs = 4.6 * u, bw = 4.6 * u, bh = bw * 32 / 24, gap = 1 * u;
  const branch = (flip) =>
    `<svg x="${r(flip ? cx + tw(text, fs, 0.04, true) / 2 + gap : cx - tw(text, fs, 0.04, true) / 2 - gap - bw)}" y="${r(yMid - bh / 2)}" width="${r(bw)}" height="${r(bh)}" viewBox="0 0 24 32">` +
    (flip
      ? `<path d="M5 2C12 7 16 16 17 30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
        [[10, 9], [13, 14], [15, 19], [16, 24]].map(([ex, ey]) => `<ellipse cx="${ex}" cy="${ey}" rx="2.8" ry="1.4" transform="rotate(45 ${ex} ${ey})" fill="currentColor" stroke="none"/>`).join('')
      : `<path d="M19 2C12 7 8 16 7 30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>` +
        [[14, 9], [11, 14], [9, 19], [8, 24]].map(([ex, ey]) => `<ellipse cx="${ex}" cy="${ey}" rx="2.8" ry="1.4" transform="rotate(-45 ${ex} ${ey})" fill="currentColor" stroke="none"/>`).join('')) +
    `</svg>`;
  const gid = `gg${Math.round(cx)}${Math.round(yMid)}`;
  const fill = gold ? `url(#${gid})` : NAVY;
  const defs = gold ? `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7dd8b"/><stop offset="1" stop-color="#c9962e"/></linearGradient></defs>` : '';
  return `<g color="#b98f1f">${defs}${branch(false)}${branch(true)}` +
    `<text x="${r(cx)}" y="${r(yMid + fs * 0.35)}" text-anchor="middle" font-family="${FONT}" font-size="${r(fs)}" font-weight="900" letter-spacing="${r(0.04 * fs)}" fill="${fill}">${esc(text)}</text></g>`;
}
// Crown mark (preview CrownMark), gold stroke.
function crown(u, cx, y, w) {
  const h = w * 18 / 28;
  return `<svg x="${r(cx - w / 2)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" viewBox="0 0 28 18">` +
    `<path d="M2 15 5 5l5 6 4-9 4 9 5-6 3 10Z" fill="none" stroke="${GOLD}" stroke-width="2" stroke-linejoin="round"/>` +
    `<line x1="3" y1="15.5" x2="25" y2="15.5" stroke="${GOLD}" stroke-width="2" stroke-linecap="round"/></svg>`;
}
// Event head: swirl icon + event text (preview EventHead). The text column
// is squeezed by the icon inside the flex row: it wraps at the panel
// content width minus icon and gap (capped at the 27u max-width).
function eventHead(u, x, y, event, light, maxW = 27 * u) {
  const fs = 1.8 * u, iw = 5.4 * u, ih = iw * 24 / 32, gap = 1.4 * u;
  const color = light ? '#ffffff' : NAVY;
  // Two lines max with ellipsis (preview clamps the text).
  const lines = wrapPx(event, Math.min(27 * u, maxW - iw - gap), fs, 800, 0.12);
  const icon = `<svg x="${r(x)}" y="${r(y)}" width="${r(iw)}" height="${r(ih)}" viewBox="0 0 32 24">` +
    `<path d="M3 20C5 12 10 5 17 4c4-.5 8 1 11 5M7 20c2-6 6-11 12-12M17 4c-1 3-1 7 1 11" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const tx = x + iw + gap;
  const ts = lines.map((l, i) =>
    `<text x="${r(tx)}" y="${r(y + fs * 0.9 + i * fs * 1.5)}" font-family="${FONT}" font-size="${r(fs)}" font-weight="800" letter-spacing="${r(0.12 * fs)}" fill="${color}">${esc(l)}</text>`
  ).join('');
  return { svg: icon + ts, w: iw + gap + Math.max(...lines.map((l) => tw(l, fs, 0.12))), h: Math.max(ih, linesH(lines.length, fs, 1.5)) };
}
// Rounded rect path with per-corner radii (preview uses asymmetric radii).
function rrect(x, y, w, h, tl, tr, br, bl) {
  return `M${r(x + tl)} ${r(y)}L${r(x + w - tr)} ${r(y)}` +
    (tr ? `Q${r(x + w)} ${r(y)} ${r(x + w)} ${r(y + tr)}` : '') +
    `L${r(x + w)} ${r(y + h - br)}` +
    (br ? `Q${r(x + w)} ${r(y + h)} ${r(x + w - br)} ${r(y + h)}` : '') +
    `L${r(x + bl)} ${r(y + h)}` +
    (bl ? `Q${r(x)} ${r(y + h)} ${r(x)} ${r(y + h - bl)}` : '') +
    `L${r(x)} ${r(y + tl)}` +
    (tl ? `Q${r(x)} ${r(y)} ${r(x + tl)} ${r(y)}` : '') + 'Z';
}
// White wave band (banner light + winner strips). navy = navy+gold strokes
// (banner-wave), winner wave = gold stroke only.
function wave(W, y, h, navy) {
  return `<svg x="0" y="${r(y)}" width="${W}" height="${r(h)}" viewBox="0 0 800 120" preserveAspectRatio="none">` +
    `<path d="M0 78 C160 60 260 96 420 74 C580 52 660 88 800 40 L800 120 L0 120 Z" fill="#ffffff"/>` +
    (navy ? `<path d="M0 78 C160 60 260 96 420 74 C580 52 660 88 800 40" fill="none" stroke="#0e2233" stroke-width="7"/>` : '') +
    `<path d="M0 ${navy ? 84 : 78} C160 ${navy ? 66 : 60} 260 ${navy ? 102 : 96} 420 ${navy ? 80 : 74} C580 ${navy ? 58 : 52} 660 ${navy ? 94 : 88} 800 ${navy ? 46 : 40}" fill="none" stroke="${GOLD}" stroke-width="${navy ? 3 : 4}"/></svg>`;
}

// Per-variant painters. b = { W,H,u, logo:{data,w,h}|null, pos, ctx:{event,className,subject}, dark }.
// Each returns { overlay: Buffer (W×H transparent SVG), arts: [{input,top,left}] }.
const painters = {
  async 'banner-wave'(b) {
    const { W, H, u, logo, ctx } = b;
    const stripH = Math.round(H * (b.dark ? 0.18 : 0.12)), stripY = H - stripH;
    const pad = 3.2 * u, fs = 1.8 * u;
    let svg = '';
    if (!b.dark) svg += wave(W, H - 0.175 * H, 0.06 * H, true);
    svg += b.dark
      ? `<defs><linearGradient id="bw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#13293d"/><stop offset="1" stop-color="${NAVY}"/></linearGradient></defs><rect x="0" y="${stripY}" width="${W}" height="${stripH}" fill="url(#bw)"/>`
      : `<rect x="0" y="${stripY}" width="${W}" height="${stripH}" fill="#ffffff"/>`;
    const color = b.dark ? '#ffffff' : NAVY;
    const contentH = Math.max(logo ? logo.h : 0, supportedH(u, fs));
    const cy = stripY + (stripH - contentH) / 2;
    svg += supported(u, pad, cy + fs * 0.9, fs, color);
    const arts = [];
    if (logo) arts.push({ input: logo.data, top: Math.round(cy + (contentH - logo.h) / 2), left: Math.round(W - pad - logo.w) });
    void ctx;
    return { svg, arts };
  },
  async 'square-bar'(b) {
    const { W, H, u, logo } = b;
    const stripH = Math.round(H * (b.dark ? 0.10 : 0.12)), stripY = H - stripH;
    const fs = 1.8 * u, color = b.dark ? '#ffffff' : NAVY;
    const labelW = tw('SUPPORTED BY', fs, 0.14, true);
    const logoW = logo ? logo.w : 0;
    const gap = 1.8 * u;
    const groupW = labelW + (logo ? gap * 2 + 2 + logoW : 0);
    let x = (W - groupW) / 2;
    let svg = b.dark
      ? `<defs><linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#13293d"/><stop offset="1" stop-color="${NAVY}"/></linearGradient></defs><rect x="0" y="${stripY}" width="${W}" height="${stripH}" fill="url(#sb)"/>`
      : `<rect x="0" y="${stripY}" width="${W}" height="${stripH}" fill="#ffffff"/>`;
    const contentH = Math.max(logo ? logo.h : 0, supportedH(u, fs));
    const cy = stripY + (stripH - contentH) / 2;
    svg += supported(u, x, cy + fs * 0.9, fs, color);
    x += labelW + gap;
    const arts = [];
    if (logo) {
      svg += `<rect x="${r(x)}" y="${r(cy)}" width="2" height="${r(contentH)}" fill="${GOLD}"/>`;
      x += 2 + gap;
      arts.push({ input: logo.data, top: Math.round(cy + (contentH - logo.h) / 2), left: Math.round(x) });
    }
    return { svg, arts };
  },
  async 'left-panel'(b) {
    const { W, H, u, logo, ctx } = b;
    const panelW = Math.round(W * 0.30);
    const x0 = 2.2 * u;
    let y = 2.5 * u;
    const gap = 1.4 * u;
    let svg = `<rect x="0" y="0" width="${panelW}" height="${H}" fill="#ffffff"/>` +
      `<rect x="${panelW - 4}" y="0" width="4" height="${H}" fill="${GOLD}"/>`;
    const sFs = 1.6 * u;
    svg += `<text x="${r(x0)}" y="${r(y + sFs * 0.9)}" font-family="${FONT}" font-size="${r(sFs)}" font-weight="800" letter-spacing="${r(0.16 * sFs)}" fill="${NAVY}">SUPPORTED BY</text>`;
    y += sFs + gap;
    const arts = [];
    if (logo) {
      arts.push({ input: logo.data, top: Math.round(y), left: Math.round(x0) });
      y += logo.h + gap;
    }
    const maxPx = panelW - 2 * x0;
    if (ctx.event) {
      for (const l of wrapPx(ctx.event, maxPx, 2.2 * u, 400, 0, 3)) {
        svg += `<text x="${r(x0)}" y="${r(y + 2.2 * u * 0.9)}" font-family="${FONT}" font-size="${r(2.2 * u)}" fill="${NAVY}">${esc(l)}</text>`;
        y += 2.2 * u * 1.4;
      }
      y += gap * 0.5;
    }
    if (ctx.className) {
      for (const l of wrapPx(ctx.className, maxPx, 2 * u, 400, 0)) {
        svg += `<text x="${r(x0)}" y="${r(y + 2 * u * 0.9)}" font-family="${FONT}" font-size="${r(2 * u)}" fill="#444444">${esc(l)}</text>`;
        y += 2 * u * 1.4;
      }
    }
    return { svg, arts };
  },
  async 'top-banner'(b) {
    const { W, H, u, logo } = b;
    const stripH = Math.round(H * (b.dark ? 0.18 : 0.12));
    const fs = 1.8 * u, color = b.dark ? '#ffffff' : NAVY;
    const labelW = tw('SUPPORTED BY', fs, 0.14, true);
    const gap = 1.8 * u;
    const groupW = labelW + (logo ? gap * 2 + 2 + logo.w : 0);
    let x = (W - groupW) / 2;
    let svg = b.dark
      ? `<defs><linearGradient id="tb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#13293d"/><stop offset="1" stop-color="${NAVY}"/></linearGradient></defs><rect x="0" y="0" width="${W}" height="${stripH}" fill="url(#tb)"/>`
      : `<rect x="0" y="0" width="${W}" height="${stripH}" fill="#ffffff"/><rect x="0" y="${stripH - 3}" width="${W}" height="3" fill="${GOLD}"/>`;
    const contentH = Math.max(logo ? logo.h : 0, supportedH(u, fs));
    const cy = (stripH - contentH) / 2;
    svg += supported(u, x, cy + fs * 0.9, fs, color);
    x += labelW + gap;
    const arts = [];
    if (logo) {
      svg += `<rect x="${r(x)}" y="${r(cy)}" width="2" height="${r(contentH)}" fill="${GOLD}"/>`;
      x += 2 + gap;
      arts.push({ input: logo.data, top: Math.round(cy + (contentH - logo.h) / 2), left: Math.round(x) });
    }
    void H;
    return { svg, arts };
  },
  async 'corner-badge'(b) {
    const { W, H, u, logo: logoIn, pos, wide, refit } = b;
    const padV = 1.8 * u, padH = 2.5 * u, sFs = 1.4 * u;
    // Wide (>4 logos): shrink-wrap the row, capped at 92% like the
    // preview's .wide badge — refit the row first so badge and art agree.
    let logo = logoIn;
    if (wide && logo && refit && logo.w + 2 * padH > Math.round(W * 0.92)) {
      const maxRowW = Math.round(W * 0.92) - 2 * padH;
      const fit = await refit(Math.max(1, Math.round(logo.h * maxRowW / logo.w)), maxRowW);
      logo = { data: fit.data, w: fit.w, h: fit.h, raw: fit.data };
    }
    const logoH = logo ? logo.h : 0;
    const logoW = logo ? logo.w : 0;
    // Narrow: fixed 44% width like the preview (content hugs the left padding).
    const badgeW = wide ? Math.min(Math.round(W * 0.92), Math.round(logoW + 2 * padH)) : Math.round(W * 0.44);
    const badgeH = Math.round(padV + sFs + 0.7 * u + logoH + padV);
    const rad = 1.8 * u, radL = 4.2 * u;
    let x, y, path, borders;
    if (pos === 'bottom-left') {
      x = 0; y = H - badgeH;
      path = rrect(x, y, badgeW, badgeH, 0, radL, 0, rad);
      borders = `<path d="M${r(x)} ${r(y + 1.5)}L${r(x + badgeW)} ${r(y + 1.5)}" stroke="${GOLD}" stroke-width="3"/><path d="M${r(x + badgeW - 1.5)} ${r(y)}L${r(x + badgeW - 1.5)} ${r(y + badgeH)}" stroke="${GOLD}" stroke-width="3"/>`;
    } else if (pos === 'bottom-right') {
      x = W - badgeW; y = H - badgeH;
      path = rrect(x, y, badgeW, badgeH, radL, 0, rad, 0);
      borders = `<path d="M${r(x)} ${r(y + 1.5)}L${r(x + badgeW)} ${r(y + 1.5)}" stroke="${GOLD}" stroke-width="3"/><path d="M${r(x + 1.5)} ${r(y)}L${r(x + 1.5)} ${r(y + badgeH)}" stroke="${GOLD}" stroke-width="3"/>`;
    } else if (pos === 'top-left') {
      x = 0; y = 0;
      path = rrect(x, y, badgeW, badgeH, rad, 0, radL, 0);
      borders = `<path d="M${r(x)} ${r(y + badgeH - 1.5)}L${r(x + badgeW)} ${r(y + badgeH - 1.5)}" stroke="${GOLD}" stroke-width="3"/><path d="M${r(x + badgeW - 1.5)} ${r(y)}L${r(x + badgeW - 1.5)} ${r(y + badgeH)}" stroke="${GOLD}" stroke-width="3"/>`;
    } else {
      x = W - badgeW; y = 0;
      path = rrect(x, y, badgeW, badgeH, 0, rad, 0, radL);
      borders = `<path d="M${r(x)} ${r(y + badgeH - 1.5)}L${r(x + badgeW)} ${r(y + badgeH - 1.5)}" stroke="${GOLD}" stroke-width="3"/><path d="M${r(x + 1.5)} ${r(y)}L${r(x + 1.5)} ${r(y + badgeH)}" stroke="${GOLD}" stroke-width="3"/>`;
    }
    let svg = `<path d="${path}" fill="${NAVY}"/>${borders}`;
    const tx = x + padH;
    let ty = y + padV + sFs * 0.9;
    svg += `<text x="${r(tx)}" y="${r(ty)}" font-family="${FONT}" font-size="${r(sFs)}" letter-spacing="${r(0.18 * sFs)}" fill="#ffffff" opacity="0.8">SUPPORTED BY</text>`;
    ty += 0.7 * u;
    const arts = [];
    if (logo) arts.push({ input: logo.data, top: Math.round(ty), left: Math.round(tx) });
    return { svg, arts };
  },
  async 'portrait-swoosh'(b) {
    const { W, H, u, logo } = b;
    const sw = 0.88 * W, sh = 0.52 * H;
    const svg0 = `<svg x="${r(W - sw)}" y="${r(H - sh)}" width="${r(sw)}" height="${r(sh)}" viewBox="0 0 400 300" preserveAspectRatio="none">` +
      `<path d="M120 300 C150 200 260 170 400 150 L400 300 Z" fill="#ffffff"/>` +
      `<path d="M120 300 C150 200 260 170 400 150" fill="none" stroke="${GOLD}" stroke-width="5"/>` +
      `<path d="M132 300 C160 210 264 180 400 162" fill="none" stroke="#0e2233" stroke-width="10"/></svg>`;
    const sFs = 1.6 * u;
    const lx = W - 2.5 * u, ly = H - 2.2 * u;
    const arts = [];
    let svg = svg0;
    if (logo) {
      arts.push({ input: logo.data, top: Math.round(ly - logo.h), left: Math.round(lx - logo.w) });
      svg += `<text x="${r(lx)}" y="${r(ly - logo.h - 0.7 * u)}" text-anchor="end" font-family="${FONT}" font-size="${r(sFs)}" font-weight="800" letter-spacing="${r(0.16 * sFs)}" fill="${NAVY}">SUPPORTED BY</text>`;
    } else {
      svg += `<text x="${r(lx)}" y="${r(ly)}" text-anchor="end" font-family="${FONT}" font-size="${r(sFs)}" font-weight="800" letter-spacing="${r(0.16 * sFs)}" fill="${NAVY}">SUPPORTED BY</text>`;
    }
    return { svg, arts };
  },
  async 'portrait-drape'(b) {
    const { W, H, u, logo } = b;
    const dh = 0.34 * H;
    const svg0 = `<svg x="0" y="0" width="${W}" height="${r(dh)}" viewBox="0 0 400 140" preserveAspectRatio="none">` +
      `<path d="M0 0 L400 0 L400 60 C320 96 240 70 160 92 C100 108 40 104 0 118 Z" fill="#ffffff"/>` +
      `<path d="M0 118 C40 104 100 108 160 92 C240 70 320 96 400 60" fill="none" stroke="${GOLD}" stroke-width="5"/>` +
      `<path d="M0 126 C40 112 100 116 160 100 C240 78 320 104 400 68" fill="none" stroke="#0e2233" stroke-width="9"/></svg>`;
    const sFs = 1.6 * u;
    const lx = W - 2.5 * u, ty = 2.2 * u;
    const arts = [];
    let svg = svg0 + `<text x="${r(lx)}" y="${r(ty + sFs * 0.9)}" text-anchor="end" font-family="${FONT}" font-size="${r(sFs)}" font-weight="800" letter-spacing="${r(0.16 * sFs)}" fill="${NAVY}">SUPPORTED BY</text>`;
    if (logo) arts.push({ input: logo.data, top: Math.round(ty + sFs + 0.7 * u), left: Math.round(lx - logo.w) });
    return { svg, arts };
  },
  async 'round-badge'(b) {
    const { W, H, u, logo, pos, wide } = b;
    const dia = 24 * u, off = 3 * u;
    const leftish = pos === 'bottom-left' || pos === 'top-left';
    const cx = leftish ? off + dia / 2 : W - off - dia / 2;
    const cy = pos === 'top-right' || pos === 'top-left' ? off + dia / 2 : H - off - dia / 2;
    // Wide (>4 logos): the circle becomes a pill holding the row, anchored
    // at the same corner — mirrors the preview's .st-round.wide.
    if (wide && logo) {
      const pillW = logo.w + 2 * 3 * u, pillH = logo.h + 2 * 2 * u;
      const px = leftish ? off : W - off - pillW;
      const py = (pos === 'top-right' || pos === 'top-left') ? off : H - off - pillH;
      const svg = `<rect x="${r(px)}" y="${r(py)}" width="${r(pillW)}" height="${r(pillH)}" rx="${r(pillH / 2)}" fill="#ffffff" stroke="${GOLD}" stroke-width="2"/>`;
      const arts = [{ input: logo.data, top: Math.round(py + 2 * u), left: Math.round(px + 3 * u) }];
      return { svg, arts };
    }
    const svg = `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(dia / 2)}" fill="#ffffff" stroke="${GOLD}" stroke-width="2"/>`;
    const arts = [];
    if (logo) {
      const inner = await fitLogo(logo.raw, dia - 6 * u, dia - 6 * u);
      arts.push({ input: inner.data, top: Math.round(cy - inner.h / 2), left: Math.round(cx - inner.w / 2) });
    }
    void W; void H;
    return { svg, arts };
  },
  async 'gold-frame'(b) {
    const { W, H, u, logo } = b;
    const ins = 3 * u;
    let svg = `<rect x="${r(ins)}" y="${r(ins)}" width="${r(W - 2 * ins)}" height="${r(H - 2 * ins)}" rx="${r(1 * u)}" fill="none" stroke="${GOLD}" stroke-width="2"/>`;
    const fs = 1.8 * u, labelW = tw('SUPPORTED BY', fs, 0.14, true);
    const lh = logo ? logo.h : 0;
    const contentH = Math.max(supportedH(u, fs), lh);
    const pillW = labelW + (logo ? 2.5 * u + logo.w : 0) + 2 * 3.5 * u;
    const pillH = contentH + 2 * 1.2 * u;
    const px = (W - pillW) / 2, py = H - 5 * u - pillH;
    svg += `<rect x="${r(px)}" y="${r(py)}" width="${r(pillW)}" height="${r(pillH)}" rx="${r(5 * u)}" fill="#ffffff" fill-opacity="0.96"/>`;
    const cy = py + 1.2 * u;
    svg += supported(u, px + 3.5 * u, cy + fs * 0.9, fs, NAVY);
    const arts = [];
    if (logo) arts.push({ input: logo.data, top: Math.round(cy + (contentH - lh) / 2), left: Math.round(px + 3.5 * u + labelW + 2.5 * u) });
    return { svg, arts };
  },
  async 'minimal-corner'(b) {
    const { W, H, u, logo, pos } = b;
    const L = 6 * u, o = 1.8 * u;
    // Brackets: top-left + bottom-left (preview .st-corner.br sits bottom-LEFT).
    let svg = `<path d="M${r(o + L)} ${r(o)}L${r(o)} ${r(o)}L${r(o)} ${r(o + L)}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="2"/>` +
      `<path d="M${r(o + L)} ${r(H - o)}L${r(o)} ${r(H - o)}L${r(o)} ${r(H - o - L)}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="2"/>`;
    const arts = [];
    if (logo) {
      const chipW = logo.w + 2 * 1.8 * u, chipH = logo.h + 2 * 0.7 * u;
      let x, y;
      if (pos === 'bottom-left') { x = 2.2 * u; y = H - 2.2 * u - chipH; }
      else if (pos === 'bottom-right') { x = W - 2.2 * u - chipW; y = H - 2.2 * u - chipH; }
      else if (pos === 'top-left') { x = 2.2 * u; y = 1.8 * u; }
      else { x = W - 2.2 * u - chipW; y = 1.8 * u; }
      svg += `<rect x="${r(x)}" y="${r(y)}" width="${r(chipW)}" height="${r(chipH)}" rx="${r(1 * u)}" fill="#ffffff" fill-opacity="0.92"/>`;
      arts.push({ input: logo.data, top: Math.round(y + 0.7 * u), left: Math.round(x + 1.8 * u) });
    }
    return { svg, arts };
  },
  async 'class-spotlight'(b) {
    const { W, H, u, logo, ctx } = b;
    const bandH = Math.round(0.16 * H), bandY = H - bandH;
    const pad = 3.2 * u, nameFs = 3.4 * u;
    const name = String(ctx.className || '');
    let svg = `<defs><linearGradient id="cs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NAVY2}"/><stop offset="1" stop-color="${NAVY}"/></linearGradient></defs>` +
      `<rect x="0" y="${bandY}" width="${W}" height="${bandH}" fill="url(#cs)"/>` +
      `<rect x="0" y="${bandY}" width="${W}" height="3" fill="${GOLD}"/>`;
    const tagFs = 1.6 * u;
    const tagW = tw('CLASS', tagFs, 0.1, true) + 2 * 1.4 * u, tagH = tagFs + 2 * 0.5 * u;
    const contentH = Math.max(tagH, nameFs);
    const cy = bandY + (bandH - contentH) / 2;
    const inner = logo ? await fitLogo(logo.raw, 4.2 * u, 40 * u) : null;
    const chipW = inner ? inner.w + 2 * 1.8 * u : 0;
    const nameMaxW = W - pad - tagW - 1.4 * u - chipW - pad - 2 * u;
    const pill = classPill(u, pad, cy + (contentH - tagH) / 2, nameFs, name, 'row', '#ffffff', nameMaxW);
    svg += pill.svg;
    const arts = [];
    if (inner) {
      const chipH = inner.h + 2 * 0.8 * u;
      const cxp = W - pad - chipW, cyp = bandY + (bandH - chipH) / 2;
      svg += `<rect x="${r(cxp)}" y="${r(cyp)}" width="${r(chipW)}" height="${r(chipH)}" rx="${r(1 * u)}" fill="#ffffff"/>`;
      arts.push({ input: inner.data, top: Math.round(cyp + 0.8 * u), left: Math.round(cxp + 1.8 * u) });
    }
    return { svg, arts };
  },
};

// Winner painters continued below (shared panel helpers first).
async function winnerStrip(b, stripH) {
  const { W, H, u, logo } = b;
  const stripY = H - stripH, pad = 3.2 * u, fs = 1.8 * u;
  let svg = `<rect x="0" y="${stripY}" width="${W}" height="${stripH}" fill="#ffffff"/>`;
  const contentH = Math.max(logo ? logo.h : 0, supportedH(u, fs));
  const cy = stripY + (stripH - contentH) / 2;
  svg += supported(u, pad, cy + fs * 0.9, fs, NAVY);
  const arts = [];
  if (logo) arts.push({ input: logo.data, top: Math.round(cy + (contentH - logo.h) / 2), left: Math.round(W - pad - logo.w) });
  return { svg, arts };
}
function winnerSubjectLines(u, panelW, subject) {
  return wrapPx(subject, panelW - 2 * 2.2 * u, 2.5 * u, 400, 0);
}
Object.assign(painters, {
  async 'winner-banner'(b) {
    const { W, H, u, logo, ctx } = b;
    const stripH = Math.round(0.12 * H);
    const panelW = Math.round(0.34 * W), panelH = H - stripH;
    let svg = `<defs><linearGradient id="wb" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#0b1b2b"/><stop offset="1" stop-color="${NAVY2}"/></linearGradient></defs>` +
      `<path d="${rrect(0, 0, panelW, panelH, 1.8 * u, 0, 0, 0)}" fill="url(#wb)"/>` +
      `<rect x="${panelW - 4}" y="0" width="4" height="${panelH}" fill="${GOLD}"/>`;
    svg += wave(W, H - 0.175 * H, 0.06 * H, false);
    const px = 2.5 * u;
    const eh = eventHead(u, px, 2.8 * u, ctx.event || '', true, panelW - 2 * 2.5 * u);
    svg += eh.svg;
    let y = 2.8 * u + eh.h + 1.8 * u;
    if (ctx.className) {
      const pill = classPill(u, px, y, 2.2 * u, String(ctx.className), 'col', '#ffffff', panelW - px - 1 * u);
      svg += pill.svg;
      y += pill.h + 1.8 * u;
    }
    const midY = (y + panelH) / 2;
    // Panel children are left-aligned (flex-start); the laurel group
    // starts at the panel padding, like the preview.
    const lauCx = px + (tw((b.result || 'WINNER'), 4.6 * u, 0.04) + 2 * (4.6 * u + 1 * u)) / 2;
    svg += laurel(u, lauCx, midY - 1.2 * u, (b.result || 'WINNER'), true);
    let sy = midY + 4.6 * u * 0.5 + 1.5 * u;
    for (const l of winnerSubjectLines(u, panelW, ctx.subject)) {
      svg += `<text x="${r(px)}" y="${r(sy)}" font-family="${FONT}" font-size="${r(2.5 * u)}" font-style="italic" fill="#ffffff">${esc(l)}</text>`;
      sy += 2.5 * u * 1.4;
    }
    const strip = await winnerStrip(b, stripH);
    return { svg: svg + strip.svg, arts: strip.arts };
  },
  async 'winner-arch'(b) {
    const { W, H, u, logo, ctx } = b;
    const stripH = Math.round(0.12 * H);
    const panelW = Math.round(0.34 * W), panelH = H - stripH;
    let svg = `<defs><linearGradient id="wa" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#0b1b2b"/><stop offset="1" stop-color="${NAVY2}"/></linearGradient></defs>` +
      `<rect x="0" y="0" width="${panelW}" height="${panelH}" fill="url(#wa)"/>`;
    // Gold arch seam right of the panel (preview .st-arch-seam).
    const seamW = 9 * u, seamX = 0.34 * W - 4.5 * u;
    svg += `<svg x="${r(seamX)}" y="0" width="${r(seamW)}" height="${panelH}" viewBox="0 0 100 800" preserveAspectRatio="none">` +
      `<path d="M28 0 C88 220 88 580 28 800" fill="none" stroke="${GOLD}" stroke-width="7"/></svg>`;
    svg += wave(W, H - 0.175 * H, 0.06 * H, false);
    const px = 2.5 * u;
    const eh = eventHead(u, px, 2.8 * u, ctx.event || '', true, panelW - 2 * 2.5 * u);
    svg += eh.svg;
    let y = 2.8 * u + eh.h + 1.8 * u;
    if (ctx.className) {
      const pill = classPill(u, px, y, 2.2 * u, String(ctx.className), 'col', '#ffffff', panelW - px - 1 * u);
      svg += pill.svg;
      y += pill.h + 1.2 * u;
    }
    const midY = (y + panelH) / 2;
    svg += crown(u, px + (tw((b.result || 'WINNER'), 4.6 * u, 0.04) + 2 * (4.6 * u + 1 * u)) / 2, midY - 4.6 * u - 1.2 * u, 6.5 * u);
    const lauCx = px + (tw((b.result || 'WINNER'), 4.6 * u, 0.04) + 2 * (4.6 * u + 1 * u)) / 2;
    svg += laurel(u, lauCx, midY, (b.result || 'WINNER'), true);
    let sy = midY + 4.6 * u * 0.5 + 1.5 * u;
    for (const l of winnerSubjectLines(u, panelW, ctx.subject)) {
      svg += `<text x="${r(px)}" y="${r(sy)}" font-family="${FONT}" font-size="${r(2.5 * u)}" font-style="italic" fill="#ffffff">${esc(l)}</text>`;
      sy += 2.5 * u * 1.4;
    }
    void logo;
    const strip = await winnerStrip(b, stripH);
    return { svg: svg + strip.svg, arts: strip.arts };
  },
  async 'winner-portrait'(b) {
    const { W, H, u, logo, ctx } = b;
    const headH = Math.round(0.20 * H), footH = Math.round(0.38 * H);
    let svg = `<defs><linearGradient id="vph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="vpf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#08121e" stop-opacity="0"/><stop offset="0.45" stop-color="#08121e" stop-opacity="0.88"/><stop offset="1" stop-color="#08121e" stop-opacity="0.88"/></linearGradient></defs>` +
      `<rect x="0" y="0" width="${W}" height="${headH}" fill="url(#vph)"/>` +
      `<rect x="0" y="${H - footH}" width="${W}" height="${footH}" fill="url(#vpf)"/>`;
    const eh = eventHead(u, 2.5 * u, 1.8 * u, ctx.event || '', false, W - 2 * 2.5 * u);
    svg += eh.svg;
    // Foot content: measured top-down, bottom-anchored with 2u margin.
    const cx = W / 2;
    const ghostH = (logo ? Math.max(logo.h, supportedH(u, 1.8 * u)) : supportedH(u, 1.8 * u)) + 2 * 1.4 * u;
    const subj = wrapPx(ctx.subject, 60 * u, 2.5 * u, 400, 0);
    const subjH = ctx.subject ? subj.length * 2.5 * u * 1.3 : 0;
    const lauH = 4.6 * u;
    // Foot class lockup is a horizontal row (tag + name), centered.
    const tagW = tw('CLASS', 1.6 * u, 0.1, true) + 2 * 1.4 * u;
    const nameMaxW = W - 2 * 2.5 * u - tagW - 1.4 * u - 2 * u;
    const pill = ctx.className ? classPill(u, 0, 0, 2.3 * u, String(ctx.className), 'row', '#ffffff', nameMaxW) : null;
    const pillH = pill ? pill.h : 0;
    const total = (pillH ? pillH + 1 * u : 0) + lauH + 1 * u + (subjH ? subjH + 1 * u : 0) + ghostH;
    let fy = H - 2 * u - total;
    const arts = [];
    if (pill) {
      svg += `<g transform="translate(${r(cx - pill.w / 2)},${r(fy)})">${pill.svg}</g>`;
      fy += pillH + 1 * u;
    }
    svg += laurel(u, cx, fy + lauH / 2, (b.result || 'WINNER'), true);
    fy += lauH + 1 * u;
    if (ctx.subject) {
      for (const l of subj) {
        svg += `<text x="${r(cx)}" y="${r(fy + 2.5 * u * 0.85)}" text-anchor="middle" font-family="${FONT}" font-size="${r(2.5 * u)}" font-style="italic" fill="#ffffff">${esc(l)}</text>`;
        fy += 2.5 * u * 1.3;
      }
      fy += 1 * u;
    }
    const stripPad = 2.8 * u;
    const contentH = logo ? Math.max(logo.h, supportedH(u, 1.8 * u)) : supportedH(u, 1.8 * u);
    const gy = fy + (ghostH - 2 * 1.4 * u - contentH) / 2 + 1.4 * u;
    svg += supported(u, stripPad, gy + 1.8 * u * 0.9, 1.8 * u, '#ffffff');
    if (logo) arts.push({ input: logo.data, top: Math.round(gy + (contentH - logo.h) / 2), left: Math.round(W - stripPad - logo.w) });
    return { svg, arts };
  },
  async 'winner-side'(b) {
    const { W, H, u, logo, ctx } = b;
    const panelW = Math.round(0.34 * W);
    const rad = 1.8 * u;
    let svg = `<path d="${rrect(0, 0, panelW, H, rad, 0, 0, rad)}" fill="#ffffff"/>` +
      `<rect x="${panelW - 4}" y="0" width="4" height="${H}" fill="${GOLD}"/>`;
    const px = 2.2 * u;
    const eh = eventHead(u, px, 2.5 * u, ctx.event || '', false, panelW - 2 * 2.2 * u);
    svg += eh.svg;
    let y = 2.5 * u + eh.h + 1.4 * u;
    if (ctx.className) {
      const pill = classPill(u, px, y, 2.3 * u, String(ctx.className), 'col', NAVY, panelW - px - 1 * u);
      svg += pill.svg;
      y += pill.h + 1.4 * u;
    }
    // Sponsor footer (bottom-anchored): label + logo, top hairline.
    const sFs = 1.8 * u;
    const footH = 1.4 * u + supportedH(u, sFs) + 1 * u + (logo ? logo.h : 0);
    const fy = H - 1.4 * u - footH;
    svg += `<line x1="${r(px)}" y1="${r(fy)}" x2="${r(panelW - px)}" y2="${r(fy)}" stroke="#eeeeee" stroke-width="1"/>`;
    svg += supported(u, px, fy + 1.4 * u + sFs * 0.9, sFs, NAVY);
    const arts = [];
    if (logo) arts.push({ input: logo.data, top: Math.round(fy + 1.4 * u + supportedH(u, sFs) + 1 * u), left: Math.round(px) });
    // Mid block (laurel + subject) centered vertically, left-aligned
    // horizontally like the preview (.st-wside-mid flex-start).
    const midY = (y + fy) / 2;
    const lauCx = px + (tw((b.result || 'WINNER'), 4.6 * u, 0.04) + 2 * (4.6 * u + 1 * u)) / 2;
    svg += laurel(u, lauCx, midY - 1.2 * u, (b.result || 'WINNER'), false);
    let sy = midY + 4.6 * u * 0.5 + 1.5 * u;
    for (const l of winnerSubjectLines(u, panelW, ctx.subject)) {
      svg += `<text x="${r(px)}" y="${r(sy)}" font-family="${FONT}" font-size="${r(2.5 * u)}" font-style="italic" fill="${NAVY}">${esc(l)}</text>`;
      sy += 2.5 * u * 1.4;
    }
    return { svg, arts };
  },
  async 'winner-top'(b) {
    const { W, H, u, logo, ctx } = b;
    // Top strip: one centered row — laurel + class lockup (tag + name).
    const cFs = 2.3 * u;
    const tagW = tw('CLASS', 1.6 * u, 0.1, true) + 2 * 1.4 * u;
    const lauTextW = tw((b.result || 'WINNER'), 4.6 * u, 0.04);
    const lauW = lauTextW + 2 * (4.6 * u + 1 * u);
    const nameMaxW = W - 2 * 3.2 * u - lauW - 2.5 * u - tagW - 1.4 * u - 1 * u;
    const pill = ctx.className ? classPill(u, 0, 0, cFs, String(ctx.className), 'row', NAVY, nameMaxW) : null;
    const groupW = lauW + (pill ? 2.5 * u + pill.w : 0);
    const contentH = Math.max(4.6 * u, pill ? pill.h : 0);
    const topH = Math.round(contentH + 2 * 1 * u);
    let svg = `<rect x="0" y="0" width="${W}" height="${topH}" fill="#ffffff"/>`;
    let gx = (W - groupW) / 2;
    const cy = 1 * u + contentH / 2;
    svg += laurel(u, gx + lauW / 2, cy, (b.result || 'WINNER'), false);
    gx += lauW + 2.5 * u;
    if (pill) svg += `<g transform="translate(${r(gx)},${r(cy - pill.h / 2)})">${pill.svg}</g>`;
    const stripH = Math.round(0.12 * H);
    const strip = await winnerStrip(b, stripH);
    void logo; void H;
    return { svg: svg + strip.svg, arts: strip.arts };
  },
  async 'winner-bottom'(b) {
    const { W, H, u, logo, ctx, refit } = b;
    const m = 1.4 * u, rad = 1.8 * u;
    const leftW = (W - 2 * m) * 0.55, rightW = (W - 2 * m) * 0.45;
    const cFs = 2 * u;
    // Left navy cell: one row — laurel left, class lockup (tag above name)
    // right of it, both vertically centered (preview .st-wbar-win row).
    const lauTextW = tw((b.result || 'WINNER'), 4.6 * u, 0.04);
    const lauW = lauTextW + 2 * (4.6 * u + 1 * u);
    const classX = m + 2.5 * u + lauW + 2 * u;
    const classW = Math.max(60, m + leftW - 2.5 * u - classX);
    const maxChars = Math.max(8, Math.floor(classW / (cFs * 0.5)));
    const pill = ctx.className ? classPill(u, 0, 0, cFs, String(ctx.className), 'col', '#ffffff') : null;
    // Re-wrap the column name to the measured cell width.
    let pillSvg = '', pillW = 0, pillH = 0;
    if (pill && ctx.className) {
      const tagFs = 1.6 * u;
      const tagW = tw('CLASS', tagFs, 0.1, true) + 2 * 1.4 * u, tagH = tagFs + 2 * 0.5 * u;
      const lines = wrapPx(ctx.className, classW, cFs, 700, 0);
      pillW = Math.max(tagW, ...lines.map((l) => tw(l, cFs, 0, false, 700)));
      pillH = tagH + 0.8 * u + linesH(lines.length, cFs, 1.25);
      pillSvg = `<defs><linearGradient id="wbt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GOLD_LT}"/><stop offset="1" stop-color="${GOLD_DK}"/></linearGradient></defs>` +
        `<rect x="0" y="0" width="${r(tagW)}" height="${r(tagH)}" rx="${r(0.7 * u)}" fill="url(#wbt)"/>` +
        `<text x="${r(1.4 * u)}" y="${r(0.5 * u + tagFs * 0.82)}" font-family="${FONT}" font-size="${r(tagFs)}" font-weight="900" letter-spacing="${r(0.1 * tagFs)}" fill="${NAVY}">CLASS</text>`;
      let ty = tagH + 0.8 * u + cFs * 0.85;
      for (const l of lines) {
        pillSvg += `<text x="0" y="${r(ty)}" font-family="${FONT}" font-size="${r(cFs)}" font-weight="700" fill="#ffffff">${esc(l)}</text>`;
        ty += cFs * 1.25;
      }
    }
    const leftContentH = Math.max(4.6 * u, pillH);
    const fs = 1.8 * u;
    const labelW = tw('SUPPORTED BY', fs, 0.14, true);
    const fitW = Math.max(60, rightW - 2 * 2.5 * u - labelW - 2 * u);
    const rLogo = logo ? await refit(5.4 * u, Math.min(27 * u, fitW)) : null;
    const rightContentH = Math.max(rLogo ? rLogo.h : 0, supportedH(u, fs));
    const barH = Math.round(Math.max(leftContentH, rightContentH, 6 * u) + 2 * 1.6 * u);
    const by = H - m - barH;
    let svg = `<defs><linearGradient id="wbb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${DEEP}"/><stop offset="1" stop-color="${NAVY2}"/></linearGradient>` +
      `<clipPath id="wbclip"><path d="${rrect(m, by, W - 2 * m, barH, rad, rad, rad, rad)}"/></clipPath></defs>` +
      `<g clip-path="url(#wbclip)"><rect x="${r(m)}" y="${r(by)}" width="${r(leftW)}" height="${barH}" fill="url(#wbb)"/>` +
      `<rect x="${r(m + leftW)}" y="${r(by)}" width="${r(rightW)}" height="${barH}" fill="#ffffff"/></g>` +
      `<path d="${rrect(m, by, W - 2 * m, barH, rad, rad, rad, rad)}" fill="none"/>`;
    const lcy = by + barH / 2;
    svg += laurel(u, m + 2.5 * u + lauW / 2, lcy, (b.result || 'WINNER'), true);
    if (pillSvg) svg += `<g transform="translate(${r(classX)},${r(lcy - pillH / 2)})">${pillSvg}</g>`;
    const rx = m + leftW + 2.5 * u;
    const rcy = by + (barH - Math.max(rLogo ? rLogo.h : 0, supportedH(u, fs))) / 2;
    svg += supported(u, rx, rcy + fs * 0.9, fs, NAVY);
    const arts = [];
    if (rLogo) arts.push({ input: rLogo.data, top: Math.round(rcy + (Math.max(rLogo.h, supportedH(u, fs)) - rLogo.h) / 2), left: Math.round(m + leftW + rightW - 2.5 * u - rLogo.w) });
    return { svg, arts };
  },
  async 'winner-corner'(b) {
    const { W, H, u, logo } = b;
    const padT = 1.8 * u, padB = 1.8 * u, padR = 2.5 * u, padL = 9.2 * u;
    const sFs = 1.8 * u;
    const contentW = Math.max(tw('SUPPORTED BY', sFs, 0.14, true), 6 * u, logo ? logo.w : 0);
    const badgeW = contentW + padL + padR;
    const badgeH = padT + supportedH(u, sFs) + 0.35 * u + (logo ? logo.h : 0) + padB;
    const x0 = W - badgeW;
    // Diagonal white badge (preview .st-diag gradient transparent→white 18%).
    let svg = `<path d="M${r(x0 + badgeW * 0.18)} 0L${r(W)} 0L${r(W)} ${r(badgeH)}L${r(x0 + badgeW * 0.10)} ${r(badgeH)}Z" fill="#ffffff"/>` +
      `<rect x="${r(x0)}" y="${r(badgeH - 3)}" width="${r(badgeW)}" height="3" fill="${GOLD}"/>`;
    const tx = x0 + padL;
    svg += supported(u, tx, padT + sFs * 0.9, sFs, NAVY);
    const arts = [];
    if (logo) arts.push({ input: logo.data, top: Math.round(padT + supportedH(u, sFs) + 0.35 * u), left: Math.round(tx) });
    void H;
    return { svg, arts };
  },
  async 'winner-minimal'(b) {
    const { W, H, u, logo, ctx, refit } = b;
    const padV = 2.2 * u, padH = 2.8 * u, maxW = 0.46 * W;
    const cFs = 1.8 * u;
    const chipLogo = logo ? await refit(4.2 * u, 40 * u) : null;
    const chipW = chipLogo ? chipLogo.w + 2 * 1.8 * u : 0;
    const fs = 1.8 * u;
    const labelW = tw('SUPPORTED BY', fs, 0.14, true);
    const divRowW = labelW + (chipLogo ? 2 * u + chipW : 0);
    const lauW = tw((b.result || 'WINNER'), 4.6 * u, 0.04) + 2 * (4.6 * u + 1 * u);
    const classSingleW = ctx.className ? tw(ctx.className, cFs) : 0;
    // Shrink-to-fit like the preview flex column, capped at 46% width.
    const cardW = Math.min(maxW, Math.max(lauW, divRowW, Math.min(classSingleW, 40 * u)) + 2 * padH);
    const classLines = ctx.className ? wrapPx(ctx.className, cardW - 2 * padH, cFs, 800, 0, 4) : [];
    const chipH = chipLogo ? chipLogo.h + 2 * 0.8 * u : 0;
    const divRowH = Math.max(chipH, supportedH(u, 1.8 * u));
    const classH = classLines.length ? linesH(classLines.length, cFs, 1.25) + 1 * u : 0;
    const cardH = padV + 4.6 * u + 1 * u + classH + 0.6 * u + 1.6 * u + divRowH + padV;
    const cardY = (H - cardH) / 2, cardX = 1.4 * u;
    let svg = `<rect x="${r(cardX)}" y="${r(cardY)}" width="${r(cardW)}" height="${r(cardH)}" rx="${r(1.8 * u)}" fill="#0a1018" fill-opacity="0.72" stroke="${GOLD}" stroke-opacity="0.5"/>`;
    const cx = cardX + cardW / 2;
    let y = cardY + padV;
    svg += laurel(u, cx, y + 4.6 * u * 0.5, (b.result || 'WINNER'), true);
    y += 4.6 * u + 1 * u;
    for (const l of classLines) {
      svg += `<text x="${r(cardX + padH)}" y="${r(y + cFs * 0.8)}" font-family="${FONT}" font-size="${r(cFs)}" font-weight="800" fill="${GOLD_LT}">${esc(l)}</text>`;
      y += cFs * 1.25;
    }
    if (classLines.length) y += 1 * u;
    y += 0.6 * u;
    svg += `<line x1="${r(cardX + padH)}" y1="${r(y)}" x2="${r(cardX + cardW - padH)}" y2="${r(y)}" stroke="${GOLD}" stroke-opacity="0.5"/>`;
    y += 1.6 * u;
    svg += supported(u, cardX + padH, y + fs * 0.9, fs, '#ffffff');
    const arts = [];
    const chip = chipLogo ? { w: chipLogo.w + 2 * 1.8 * u, h: chipLogo.h + 2 * 0.8 * u } : null;
    if (chipLogo && chip) {
      const chx = cardX + padH + tw('SUPPORTED BY', fs, 0.14, true) + 2 * u;
      svg += `<rect x="${r(chx)}" y="${r(y)}" width="${r(chip.w)}" height="${r(chip.h)}" rx="${r(1 * u)}" fill="#ffffff"/>`;
      arts.push({ input: chipLogo.data, top: Math.round(y + 0.8 * u), left: Math.round(chx + 1.8 * u) });
    }
    void W; void H;
    return { svg, arts };
  },
});

// — KIT: current templates (fade-footer, sponsor-bar, mat-frame,
// poster-panel, logo-plate). Twin of the layout kit in SponsorTemplates.jsx
// (+ .module.css): s = min(W, H) / 100, the preview's --s unit. Text is one
// line each with an ellipsis on overflow, logos sit in balanced rows. —
const KIT = { gapX: 2, gapY: 1.4, label: 1.4, labelGap: 0.9, cardPadV: 1.4, cardPadH: 2.2, infoGap: 0.8 };
const INFO_SIZES = {
  base: { event: 1.7, moment: 4.2, cls: 2.4 },
  hero: { event: 1.9, moment: 5, cls: 2.6 },
  tag: { event: 1.4, moment: 2.8, cls: 1.9 },
};
function kitRow(count) {
  if (count > 4) return { h: 3.6, w: 12 };
  if (count > 2) return { h: 4.5, w: 16 };
  if (count > 1) return { h: 5.5, w: 22 };
  return { h: 6.5, w: 28 };
}
const r1 = (n) => Math.round(n * 10) / 10;
function kitRows(count, mw) {
  const { w } = kitRow(count);
  const perRow = Math.max(1, Math.floor((mw + KIT.gapX) / (w + KIT.gapX)));
  return Math.ceil(count / perRow);
}
function kitSponsorH(count, mw) {
  if (!count) return 0;
  const { h } = kitRow(count);
  const rows = kitRows(count, mw);
  return KIT.label + KIT.labelGap + rows * h + (rows - 1) * KIT.gapY;
}
function kitInfoH(info, size = 'base') {
  const z = INFO_SIZES[size];
  const parts = [];
  if (info.event) parts.push(z.event * 1.2);
  if (info.moment) parts.push(z.moment * 1.05);
  if (info.cls) parts.push(z.cls * 1.2);
  return parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * KIT.infoGap;
}
const hasInfo = (info) => Boolean(info.event || info.moment || info.cls);
function kitLayout(variant, ar, count, info, theme = 'light') {
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
const TYPE = {
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
const T_COLORS = {
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
const ANGLE_T = 0.3249; // tan(18deg): the Angle slash lean
// Logo rows without the "Supported by" label.
function kitLogosH(count, mw) {
  if (!count) return 0;
  const rows = kitRows(count, mw);
  return rows * kitRow(count).h + (rows - 1) * KIT.gapY;
}
// Height (s) of a stack of [text, TYPE] lines; empty lines are skipped.
function typeH(pairs, gap) {
  const on = pairs.filter(([t]) => t);
  return on.reduce((a, [, t]) => a + t.z * t.lh, 0) + Math.max(0, on.length - 1) * gap;
}
// Placing from the moment text: 1-6, 0 = not a placing (clear round, debut).
const PLACE_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
function placingOf(text) {
  const t = String(text || '').toLowerCase();
  if (/\breserve\b/.test(t)) return 2;
  if (/\b(winner|champion|won)\b/.test(t)) return 1;
  const d = t.match(/\b([1-6])(st|nd|rd|th)\b/);
  if (d) return Number(d[1]);
  const w = PLACE_WORDS.findIndex((x) => new RegExp(`\\b${x}\\b`).test(t));
  return w >= 0 ? w + 1 : 0;
}
const PLACE_LABEL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
// [main, pleat] per placing: red, blue, yellow, green, pink, purple.
// Index 0 (not a placing) is navy and gold.
const ROSETTE_COLORS = [['#0e2233', '#d4a017'], ['#c62828', '#8e1c1c'], ['#1f4fa8', '#163a7d'],
  ['#e3b505', '#a98700'], ['#2e7d32', '#1f5a23'], ['#d63384', '#a1225f'], ['#6a3fa0', '#4d2c76']];
const STAR = 'M60 43l5.3 10.8 11.9 1.7-8.6 8.4 2 11.9L60 70.2l-10.6 5.6 2-11.9-8.6-8.4 11.9-1.7Z';
// Rosette art in a 120 x 150 box. Constant markup only (no user text).
function rosetteSvg(place, serif) {
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
function resultCells(info, ar) {
  const all = [['Event', info.event, 1.3, false], ['Class', info.cls, 1, false], ['Result', info.moment, 1.2, true]]
    .filter((c) => c[1]).map(([key, text, wt, gold]) => ({ key, text, wt, gold }));
  if (!all.length) return [];
  if (ar < 1 && info.event && all.length > 1) return [all.slice(0, 1), all.slice(1)];
  return [all];
}
function kitLayoutT(variant, ar, count, info, theme = 'light') {
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
const PLATE_MAX_CORNERS = 3;
const MOMENT_LABELS = { win: 'Winner', clear: 'Clear round', debut: 'Debut', pb: 'Personal best' };
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
// Manrope ascender 1.065 / descender 0.3: baseline inside a CSS line box.
const baseline = (lh) => (lh - 1.365) / 2 + 1.065;
const SUPPORTED = 'SUPPORTED BY';
const INFO_COLORS = {
  dark: { event: '#ffffff', eventOpacity: 0.78, moment: GOLD_LT, cls: '#ffffff' },
  light: { event: '#5a6470', eventOpacity: 1, moment: '#9a6f00', cls: NAVY },
};
// Info lines (px) for a given max width: [{text, fs, lh, weight, ls, color, opacity, upper}]
function infoLines(info, s, maxW, size, tone) {
  const z = INFO_SIZES[size], c = INFO_COLORS[tone];
  const fit = (t, fs, weight, ls, upper) => {
    const txt = upper ? t.toUpperCase() : t;
    return tw(txt, fs, ls, false, weight) <= maxW ? txt : ellipsize(txt, maxW, fs, weight, ls);
  };
  const out = [];
  if (info.event) out.push({ fs: z.event * s, lh: 1.2, weight: 800, ls: 0.14, color: c.event, opacity: c.eventOpacity, raw: info.event, upper: true });
  if (info.moment) out.push({ fs: z.moment * s, lh: 1.05, weight: 800, ls: 0.02, color: c.moment, opacity: 1, raw: info.moment, upper: true });
  if (info.cls) out.push({ fs: z.cls * s, lh: 1.2, weight: 700, ls: 0, color: c.cls, opacity: 1, raw: info.cls, upper: false });
  for (const l of out) l.text = fit(l.raw, l.fs, l.weight, l.ls, l.upper);
  return out;
}
// Natural width (px) of the info block, capped at maxW.
function infoWidth(lines, maxW) {
  return Math.min(maxW, Math.max(0, ...lines.map((l) => tw(l.text, l.fs, l.ls, false, l.weight))));
}
// Draw info lines with the block's top-left at (x, y); align 'start'|'end'
// relative to blockW.
function drawInfo(lines, s, x, y, blockW = 0, align = 'start') {
  let svg = '', cy = y;
  for (const l of lines) {
    const w = tw(l.text, l.fs, l.ls, false, l.weight);
    const lx = align === 'end' ? x + blockW - w : x;
    svg += `<text x="${r(lx)}" y="${r(cy + baseline(l.lh) * l.fs)}" font-family="${FONT}" font-size="${r(l.fs)}" font-weight="${l.weight}" letter-spacing="${r(l.ls * l.fs)}" fill="${l.color}"${l.opacity < 1 ? ` fill-opacity="${l.opacity}"` : ''}>${esc(l.text)}</text>`;
    cy += l.fs * l.lh + KIT.infoGap * s;
  }
  return svg;
}
// Sponsor block: label + greedily wrapped rows. Returns size + a painter.
async function sponsorBlock(bufs, s, mwS, align, label = true) {
  const { h, w } = kitRow(bufs.length);
  const boxH = Math.round(h * s), gapX = KIT.gapX * s, gapY = KIT.gapY * s;
  const fitted = [];
  for (const b of bufs) fitted.push(await fitLogo(b, boxH, w * s));
  // Balanced rows (kitLines in the preview): 8 logos in 2 rows = 4 + 4.
  const per = Math.ceil(fitted.length / kitRows(fitted.length, mwS));
  const lines = [];
  for (let i = 0; i < fitted.length; i += per) lines.push(fitted.slice(i, i + per));
  const widthOf = (line) => line.reduce((sum, f, i) => sum + f.w + (i ? gapX : 0), 0);
  const rowsW = Math.max(...lines.map(widthOf));
  const labelFs = KIT.label * s;
  const labelW = label ? tw(SUPPORTED, labelFs, 0.16, true) : 0;
  const head = label ? labelFs + KIT.labelGap * s : 0;
  const blockW = Math.max(labelW, rowsW);
  const blockH = head + lines.length * boxH + (lines.length - 1) * gapY;
  const offset = (inner, outer) => (align === 'center' ? (outer - inner) / 2 : align === 'end' ? outer - inner : 0);
  const paint = (x, y) => {
    const svg = label ? `<text x="${r(x + offset(labelW, blockW))}" y="${r(y + baseline(1) * labelFs)}" font-family="${FONT}" font-size="${r(labelFs)}" font-weight="800" letter-spacing="${r(0.16 * labelFs)}" fill="${NAVY}" fill-opacity="0.7">${SUPPORTED}</text>` : '';
    const arts = [];
    const rowsX = x + offset(rowsW, blockW);
    let ly = y + head;
    for (const line of lines) {
      let lx = rowsX + offset(widthOf(line), rowsW);
      for (const f of line) {
        arts.push({ input: f.data, top: Math.round(ly + (boxH - f.h) / 2), left: Math.round(lx) });
        lx += f.w + gapX;
      }
      ly += boxH + gapY;
    }
    return { svg, arts };
  };
  return { w: blockW, h: blockH, paint };
}
// White card around a sponsor block (.st-card). innerW overrides the width
// when the card is stretched (poster side panel).
function cardAround(block, s, x, y, innerW = null) {
  const padV = KIT.cardPadV * s, padH = KIT.cardPadH * s;
  const iw = innerW ?? block.w;
  const w = iw + 2 * padH, h = block.h + 2 * padV;
  const rect = `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${r(1.4 * s)}" fill="#ffffff" stroke="${NAVY}" stroke-opacity="0.12" stroke-width="1"/>`;
  const inner = block.paint(x + padH + (iw - block.w) / 2, y + padV);
  return { w, h, svg: rect + inner.svg, arts: inner.arts };
}
const cardSize = (block, s) => ({ w: block.w + 2 * KIT.cardPadH * s, h: block.h + 2 * KIT.cardPadV * s });
const kitInfo = (b) => ({ event: b.ctx.event || '', moment: b.moment || '', cls: b.ctx.className || '' });

// Footer layout shared by sponsor-bar, header-bar and the gallery-mat band: info left,
// sponsors right (or centred alone), vertically centred in [top, top+h].
async function footerRow(b, L, x0, x1, top, h, tone) {
  const { s, bufs } = b;
  const info = kitInfo(b);
  const solo = !hasInfo(info);
  const block = await sponsorBlock(bufs, s, L.mw, solo ? 'center' : 'end');
  let svg = '';
  const arts = [];
  // Dark surfaces: the sponsor block sits on a white card (L.card).
  const size = L.card ? cardSize(block, s) : { w: block.w, h: block.h };
  const sx = solo ? (x0 + x1 - size.w) / 2 : x1 - size.w;
  const sy = top + (h - size.h) / 2;
  const sp = L.card ? cardAround(block, s, sx, sy) : block.paint(sx, sy);
  svg += sp.svg; arts.push(...sp.arts);
  if (!solo) {
    const lines = infoLines(info, s, Math.max(0, sx - 3 * s - x0), 'base', tone);
    svg += drawInfo(lines, s, x0, top + (h - kitInfoH(info) * s) / 2);
  }
  return { svg, arts };
}
const toneOf = (b) => (b.dark ? 'dark' : 'light');
const surfOf = (b) => (b.dark ? NAVY : '#ffffff');
// Tag box (logo-plate, side-column): info on a translucent plate.
function tagBox(b, info, size, maxW, at) {
  const { s } = b;
  const padV = 1.2 * s, padH = 1.8 * s;
  const lines = infoLines(info, s, maxW - 2 * padH, size, toneOf(b));
  const w = infoWidth(lines, maxW - 2 * padH) + 2 * padH;
  const h = kitInfoH(info, size) * s + 2 * padV;
  const { x, y } = at(w, h);
  const fill = b.dark ? '<rect fill="#080e16" fill-opacity="0.72"' : '<rect fill="#ffffff" fill-opacity="0.92"';
  return `${fill} x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${r(1.2 * s)}"/>` + drawInfo(lines, s, x + padH, y + padV);
}

Object.assign(painters, {
  async 'fade-footer'(b) {
    const { W, H, s, bufs } = b;
    const info = kitInfo(b);
    const L = kitLayout('fade-footer', W / H, bufs.length, info, toneOf(b));
    const fadeH = L.fadeH * s, inset = 4 * s;
    const c = b.dark ? '#080e16' : '#ffffff';
    const [o1, o2] = b.dark ? [0.55, 0.82] : [0.6, 0.9];
    let svg = `<defs><linearGradient id="ff" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset="0.55" stop-color="${c}" stop-opacity="${o1}"/>` +
      `<stop offset="1" stop-color="${c}" stop-opacity="${o2}"/></linearGradient></defs>` +
      `<rect x="0" y="${r(H - fadeH)}" width="${W}" height="${r(fadeH)}" fill="url(#ff)"/>`;
    const block = await sponsorBlock(bufs, s, L.mw, 'center');
    const size = cardSize(block, s);
    const card = cardAround(block, s, W - inset - size.w, H - inset - size.h);
    svg += card.svg;
    if (hasInfo(info)) {
      const lines = infoLines(info, s, Math.max(0, W - 2 * inset - size.w - 3 * s), 'base', toneOf(b));
      svg += drawInfo(lines, s, inset, H - inset - kitInfoH(info) * s);
    }
    return { svg, arts: card.arts };
  },
  async 'sponsor-bar'(b) {
    const { W, H, s, bufs } = b;
    const L = kitLayout('sponsor-bar', W / H, bufs.length, kitInfo(b), toneOf(b));
    const barH = L.barH * s, top = H - barH;
    let svg = `<rect x="0" y="${r(top)}" width="${W}" height="${r(barH)}" fill="${surfOf(b)}"/>` +
      `<rect x="0" y="${r(top)}" width="${W}" height="${r(0.5 * s)}" fill="${GOLD}"/>`;
    const row = await footerRow(b, L, 4 * s, W - 4 * s, top + 0.5 * s + 2.4 * s, barH - 5.3 * s, toneOf(b));
    svg += row.svg;
    return { svg, arts: row.arts };
  },
  async 'header-bar'(b) {
    const { W, H, s, bufs } = b;
    const L = kitLayout('header-bar', W / H, bufs.length, kitInfo(b), toneOf(b));
    const barH = L.barH * s;
    let svg = `<rect x="0" y="0" width="${W}" height="${r(barH)}" fill="${surfOf(b)}"/>` +
      `<rect x="0" y="${r(barH - 0.5 * s)}" width="${W}" height="${r(0.5 * s)}" fill="${GOLD}"/>`;
    const row = await footerRow(b, L, 4 * s, W - 4 * s, 2.4 * s, barH - 5.3 * s, toneOf(b));
    svg += row.svg;
    return { svg, arts: row.arts };
  },
  async 'mat-frame'(b) {
    const { W, H, s, bufs } = b;
    const L = kitLayout('mat-frame', W / H, bufs.length, kitInfo(b), toneOf(b));
    const m = 3 * s, bandH = L.bandH * s;
    const photoRect = { left: Math.round(m), top: Math.round(m), width: Math.round(W - 2 * m), height: Math.round(H - m - bandH) };
    const row = await footerRow(b, L, m, W - m, H - bandH + 3 * s, bandH - 6 * s, toneOf(b));
    return { svg: row.svg, arts: row.arts, photoRect, background: surfOf(b) };
  },
  async 'poster-panel'(b) {
    const { W, H, s, bufs } = b;
    const info = kitInfo(b);
    const L = kitLayout('poster-panel', W / H, bufs.length, info, toneOf(b));
    const P = L.P * s, pad = 4 * s;
    const bg = surfOf(b);
    const block = await sponsorBlock(bufs, s, L.mw, 'center');
    let svg = '';
    let arts = [];
    let photoRect;
    if (L.side === 'left') {
      photoRect = { left: Math.round(P), top: 0, width: Math.round(W - P), height: H };
      svg += `<rect x="0" y="0" width="${r(P)}" height="${H}" fill="${bg}"/><rect x="${r(P - 0.6 * s)}" y="0" width="${r(0.6 * s)}" height="${H}" fill="${GOLD}"/>`;
      const innerW = P - 2 * pad - 2 * KIT.cardPadH * s;
      const cardH = block.h + 2 * KIT.cardPadV * s;
      const card = cardAround(block, s, pad, H - pad - cardH, innerW);
      svg += card.svg; arts = card.arts;
      if (hasInfo(info)) svg += drawInfo(infoLines(info, s, P - 2 * pad, 'hero', toneOf(b)), s, pad, pad);
    } else {
      photoRect = { left: 0, top: 0, width: W, height: Math.round(H - P) };
      svg += `<rect x="0" y="${r(H - P)}" width="${W}" height="${r(P)}" fill="${bg}"/><rect x="0" y="${r(H - P)}" width="${W}" height="${r(0.6 * s)}" fill="${GOLD}"/>`;
      const size = cardSize(block, s);
      const solo = !hasInfo(info);
      const top = H - P + pad, h = P - 2 * pad;
      const cx = solo ? (W - size.w) / 2 : W - pad - size.w;
      const card = cardAround(block, s, cx, top + (h - size.h) / 2);
      svg += card.svg; arts = card.arts;
      if (!solo) {
        const lines = infoLines(info, s, Math.max(0, cx - 3 * s - pad), 'hero', toneOf(b));
        svg += drawInfo(lines, s, pad, top + (h - kitInfoH(info, 'hero') * s) / 2);
      }
    }
    return { svg, arts, photoRect, background: bg };
  },
  async 'logo-plate'(b) {
    const { W, H, s, bufs, positionsAll } = b;
    const L = kitLayout('logo-plate', W / H, bufs.length, kitInfo(b), toneOf(b));
    const o = 3.5 * s;
    const groups = bufs.length > PLATE_MAX_CORNERS
      ? [{ pos: positionsAll[0], list: bufs }]
      : bufs.map((buf, i) => ({ pos: positionsAll[i], list: [buf] }));
    const place = (pos, w, h) => ({
      x: pos === 'top-left' || pos === 'bottom-left' ? o : W - o - w,
      y: pos === 'top-left' || pos === 'top-right' ? o : H - o - h,
    });
    let svg = '';
    const arts = [];
    for (const g of groups) {
      const block = await sponsorBlock(g.list, s, L.mw, 'center');
      const size = cardSize(block, s);
      const at = place(g.pos, size.w, size.h);
      const card = cardAround(block, s, at.x, at.y);
      svg += card.svg; arts.push(...card.arts);
    }
    const tagInfo = { event: '', moment: b.moment || '', cls: b.ctx.className || '' };
    const free = CORNERS.find((c) => !groups.some((g) => g.pos === c));
    if (free && hasInfo(tagInfo)) svg += tagBox(b, tagInfo, 'tag', L.tagMax * s, (w, h) => place(free, w, h));
    return { svg, arts };
  },
  async 'side-column'(b) {
    const { W, H, s, bufs } = b;
    const info = kitInfo(b);
    const L = kitLayout('side-column', W / H, bufs.length, info, toneOf(b));
    const o = 3.5 * s;
    const block = await sponsorBlock(bufs, s, L.mw, 'center');
    const size = cardSize(block, s);
    const card = cardAround(block, s, W - o - size.w, (H - size.h) / 2);
    let svg = card.svg;
    if (hasInfo(info)) svg += tagBox(b, info, 'base', L.tagMax * s, (w, h) => ({ x: o, y: H - o - h }));
    return { svg, arts: card.arts };
  },
  async 'ribbon-tag'(b) {
    const { W, H, s, bufs } = b;
    const info = kitInfo(b);
    const L = kitLayout('ribbon-tag', W / H, bufs.length, info, toneOf(b));
    let svg = '';
    if (hasInfo(info)) {
      const edge = 1 * s, padL = 3 * s, padR = 5 * s, padV = 1.8 * s, notch = 2.5 * s, top = 4 * s;
      const maxInner = L.ribMax * s - edge - padL - padR;
      const lines = infoLines(info, s, maxInner, 'base', toneOf(b));
      const w = edge + padL + infoWidth(lines, maxInner) + padR;
      const h = kitInfoH(info) * s + 2 * padV;
      svg += `<polygon points="0,${r(top)} ${r(w)},${r(top)} ${r(w - notch)},${r(top + h / 2)} ${r(w)},${r(top + h)} 0,${r(top + h)}" fill="${surfOf(b)}"/>` +
        `<rect x="0" y="${r(top)}" width="${r(edge)}" height="${r(h)}" fill="${GOLD}"/>` +
        drawInfo(lines, s, edge + padL, top + padV);
    }
    const o = 3.5 * s;
    const block = await sponsorBlock(bufs, s, L.mw, 'center');
    const size = cardSize(block, s);
    const card = cardAround(block, s, W - o - size.w, H - o - size.h);
    svg += card.svg;
    return { svg, arts: card.arts };
  },
  async 'split-footer'(b) {
    const { W, H, s, bufs } = b;
    const info = kitInfo(b);
    const L = kitLayout('split-footer', W / H, bufs.length, info, toneOf(b));
    const F = L.F * s, top = H - F, pad = 4 * s;
    const solo = !hasInfo(info);
    const infoBg = b.dark ? NAVY : '#ffffff';
    const spBg = b.dark ? '#ffffff' : '#f4f5f7';
    const half = solo ? 0 : W / 2;
    const photoRect = { left: 0, top: 0, width: W, height: Math.round(top) };
    let svg = '';
    if (!solo) svg += `<rect x="0" y="${r(top)}" width="${r(half)}" height="${r(F)}" fill="${infoBg}"/>`;
    svg += `<rect x="${r(half)}" y="${r(top)}" width="${r(W - half)}" height="${r(F)}" fill="${spBg}"/>`;
    if (!solo) {
      svg += `<rect x="${r(half - 0.3 * s)}" y="${r(top)}" width="${r(0.6 * s)}" height="${r(F)}" fill="${GOLD}"/>`;
      const lines = infoLines(info, s, half - 2 * pad, 'base', toneOf(b));
      svg += drawInfo(lines, s, pad, top + (F - kitInfoH(info) * s) / 2);
    }
    const block = await sponsorBlock(bufs, s, L.mw, 'center');
    const sp = block.paint(half + (W - half - block.w) / 2, top + (F - block.h) / 2);
    svg += sp.svg;
    return { svg, arts: sp.arts, photoRect, background: infoBg };
  },
});

// ── T-series text: one line in TYPE style t, top of its CSS line box at y.
// Width = glyph advances + kerning + letter-spacing after every char, plus
// the 0.1em italic pad the preview adds (.st-t paddingRight).
function tWidth(t, str, fs) {
  const font = tFont(t);
  const scale = fs / font.unitsPerEm;
  let w = 0, prev = null;
  for (const ch of str) {
    const g = font.charToGlyph(ch);
    if (prev) w += font.getKerningValue(prev, g) * scale;
    w += g.advanceWidth * scale;
    prev = g;
  }
  return w + str.length * t.ls * fs;
}
function tFit(t, text, fs, maxPx) {
  const str = t.up ? String(text).toUpperCase() : String(text);
  if (maxPx == null || tWidth(t, str, fs) <= maxPx) return str;
  let cut = str;
  while (cut.length > 1 && tWidth(t, cut + '…', fs) > maxPx) cut = cut.slice(0, -1);
  return cut.length > 1 ? cut + '…' : '…';
}
// Returns { svg, w, h } (px). maxS in s units or null.
function tLine(t, text, s, x, y, maxS, color, op = 1, anchor = 'start') {
  if (!text) return { svg: '', w: 0, h: 0 };
  const fs = t.z * s;
  const str = tFit(t, text, fs, maxS == null ? null : maxS * s);
  const w = tWidth(t, str, fs) + (t.i ? 0.1 * fs : 0);
  const font = tFont(t);
  const asc = font.tables.hhea.ascender / font.unitsPerEm, desc = -font.tables.hhea.descender / font.unitsPerEm;
  const by = y + ((t.lh - asc - desc) / 2 + asc) * fs;
  const tx = anchor === 'end' ? x - w : x;
  const svg = `<text x="${r(tx)}" y="${r(by)}" font-family="${T_FAMILY[t.f]}" font-size="${r(fs)}" font-weight="${t.w}"`
    + `${t.i ? ' font-style="italic"' : ''} letter-spacing="${r(t.ls * fs)}" fill="${color}"${op < 1 ? ` fill-opacity="${op}"` : ''}>${esc(str)}</text>`;
  return { svg, w, h: t.lh * fs };
}
// Vertical stack of lines (empty ones skipped), gap in s. Returns { svg, w, h }.
function tStack(items, s, x, y, gap) {
  let svg = '', cy = y, w = 0, n = 0;
  for (const [t, text, maxS, color, op] of items) {
    if (!text) continue;
    if (n++) cy += gap * s;
    const l = tLine(t, text, s, x, cy, maxS, color, op);
    svg += l.svg; w = Math.max(w, l.w); cy += l.h;
  }
  return { svg, w, h: cy - y };
}
const tStackW = (items, s) => tStack(items, s, 0, 0, 0).w;

Object.assign(painters, {
  async 'broadcast'(b) {
    const { W, H, s, bufs } = b;
    const info = kitInfo(b);
    const L = kitLayout('broadcast', W / H, bufs.length, info, toneOf(b));
    const c = T_COLORS.broadcast[toneOf(b)];
    const tickH = L.tickH * s, top = H - tickH, rule = 0.6 * s;
    const inTop = top + rule, inH = tickH - rule;
    let svg = `<rect x="0" y="${r(top)}" width="${W}" height="${r(tickH)}" fill="${c.tick}"/>`
      + `<rect x="0" y="${r(top)}" width="${W}" height="${r(rule)}" fill="${GOLD}"/>`;
    const lab = TYPE.bcLabel;
    const labH = 2 * lab.z * lab.lh * s;
    svg += tStack([[lab, 'Official', null, c.label], [lab, 'Partners', null, c.label]], s, 4 * s, inTop + (inH - labH) / 2, 0).svg;
    const block = await sponsorBlock(bufs, s, L.mw, 'start', false);
    const size = L.card ? cardSize(block, s) : { w: block.w, h: block.h };
    const sx = (4 + L.lab + 3) * s, sy = inTop + (inH - size.h) / 2;
    const sp = L.card ? cardAround(block, s, sx, sy) : block.paint(sx, sy);
    svg += sp.svg;
    if (info.cls) {
      const tabH = L.tabH * s, ty = H - (L.tickH + 1.4) * s - tabH;
      const t = tLine(TYPE.bcClass, info.cls, s, 5.6 * s, ty + 0.8 * s, L.textMax, NAVY);
      svg += `<rect x="${r(4 * s)}" y="${r(ty)}" width="${r(t.w + 3.2 * s)}" height="${r(tabH)}" fill="${GOLD}"/>` + t.svg;
    }
    if (info.event || info.moment) {
      const items = [[TYPE.bcEvent, info.event, L.textMax, c.event, c.eventOp], [TYPE.bcMoment, info.moment, L.textMax, c.moment]];
      const bottom = H - L.slabBottom * s;
      const contentH = typeH([[info.event, TYPE.bcEvent], [info.moment, TYPE.bcMoment]], 0.6) * s;
      const slabTop = bottom - contentH - 3.8 * s;
      const w = 4 * s + tStackW(items, s) + 6 * s;
      svg += `<polygon points="0,${r(slabTop)} ${r(w)},${r(slabTop)} ${r(w - 3 * s)},${r(bottom)} 0,${r(bottom)}" fill="${c.slab}"/>`
        + tStack(items, s, 4 * s, slabTop + 1.8 * s, 0.6).svg;
    }
    return { svg, arts: sp.arts };
  },
  async 'keyline'(b) {
    const { W, H, s, bufs } = b;
    const info = kitInfo(b);
    const L = kitLayout('keyline', W / H, bufs.length, info, toneOf(b));
    const c = T_COLORS.keyline[toneOf(b)];
    const topH = 22 * s, botH = 45 * s, lw = 0.3 * s;
    let svg = `<defs><linearGradient id="klt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.4"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`
      + `<linearGradient id="klb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${c.fade}"/></linearGradient></defs>`
      + `<rect x="0" y="0" width="${W}" height="${r(topH)}" fill="url(#klt)"/>`
      + `<rect x="0" y="${r(H - botH)}" width="${W}" height="${r(botH)}" fill="url(#klb)"/>`
      + `<rect x="${r(3 * s + lw / 2)}" y="${r(3 * s + lw / 2)}" width="${r(W - 6 * s - lw)}" height="${r(H - 6 * s - lw)}" fill="none" stroke="${c.line}" stroke-width="${r(lw)}"/>`;
    svg += tLine(TYPE.klEvent, info.event, s, 5.5 * s, 5.5 * s, L.eventMax, c.event).svg;
    const items = [[TYPE.klClass, info.cls, L.textMax, c.cls], [TYPE.klMoment, info.moment, L.textMax, c.moment]];
    const h = typeH([[info.cls, TYPE.klClass], [info.moment, TYPE.klMoment]], 1) * s;
    svg += tStack(items, s, 5.5 * s, H - 5.5 * s - h, 1).svg;
    const block = await sponsorBlock(bufs, s, L.mw, 'center');
    const size = cardSize(block, s);
    const card = cardAround(block, s, W - 5.5 * s - size.w, H - 5.5 * s - size.h);
    svg += card.svg;
    return { svg, arts: card.arts };
  },
  async 'result-card'(b) {
    const { W, H, s, bufs } = b;
    const info = kitInfo(b);
    const L = kitLayout('result-card', W / H, bufs.length, info, toneOf(b));
    const c = T_COLORS['result-card'][toneOf(b)];
    const F = L.F * s, top = H - F;
    const photoRect = { left: 0, top: 0, width: W, height: Math.round(top) };
    let svg = `<rect x="0" y="${r(top)}" width="${W}" height="${r(0.6 * s)}" fill="${c.rule}"/>`;
    let y = top + 0.6 * s;
    const cellH = L.cellH * s;
    resultCells(info, W / H).forEach((row, ri) => {
      svg += `<rect x="0" y="${r(y)}" width="${W}" height="${r(cellH)}" fill="${c.cell}"/>`;
      if (ri) svg += `<rect x="0" y="${r(y)}" width="${W}" height="1" fill="${c.sep}"/>`;
      const sum = row.reduce((a, x) => a + x.wt, 0);
      let x = 0;
      row.forEach((cell, ci) => {
        const cw = (W * cell.wt) / sum;
        if (ci) svg += `<rect x="${r(x)}" y="${r(y)}" width="1" height="${r(cellH)}" fill="${c.sep}"/>`;
        svg += tStack([[TYPE.rcKey, cell.key, null, c.key],
          [TYPE.rcValue, cell.text, r1((L.Ws * cell.wt) / sum - 6), cell.gold ? c.gold : c.value]], s, x + 3 * s, y + 1.8 * s, 0.8).svg;
        x += cw;
      });
      y += cellH;
    });
    const spH = L.spH * s;
    svg += `<rect x="0" y="${r(y)}" width="${W}" height="${r(spH)}" fill="${c.sp}"/>`;
    svg += tLine(TYPE.rcKey, 'Supported by', s, 3 * s, y + (spH - TYPE.rcKey.z * TYPE.rcKey.lh * s) / 2, null, c.spLabel).svg;
    const block = await sponsorBlock(bufs, s, L.mw, 'end', false);
    const sp = block.paint(W - 3 * s - block.w, y + (spH - block.h) / 2);
    svg += sp.svg;
    return { svg, arts: sp.arts, photoRect, background: c.cell };
  },
  async 'rosette'(b) {
    const { W, H, s, bufs } = b;
    const info = kitInfo(b);
    const L = kitLayout('rosette', W / H, bufs.length, info, toneOf(b));
    const c = T_COLORS.rosette[toneOf(b)];
    const size = L.size * s;
    let svg = `<g transform="translate(${r(W - 4 * s - size)} ${r(4 * s)}) scale(${size / 120})">${rosetteSvg(placingOf(info.moment), T_FAMILY.serif)}</g>`;
    if (hasInfo(info)) {
      const items = [[TYPE.roEvent, info.event, L.textMax, c.event], [TYPE.roMoment, info.moment, L.textMax, c.moment], [TYPE.roClass, info.cls, L.textMax, c.cls]];
      const th = typeH([[info.event, TYPE.roEvent], [info.moment, TYPE.roMoment], [info.cls, TYPE.roClass]], 0.5) * s;
      const w = tStackW(items, s) + 4.8 * s, h = th + 3.6 * s;
      const x = 4 * s, y = H - 4 * s - h;
      svg += `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${r(0.8 * s)}" fill="${c.plate}" fill-opacity="${c.plateOp}"/>`
        + tStack(items, s, x + 2.4 * s, y + 1.8 * s, 0.5).svg;
    }
    const block = await sponsorBlock(bufs, s, L.mw, 'center');
    const cs = cardSize(block, s);
    const card = cardAround(block, s, W - 4 * s - cs.w, H - 4 * s - cs.h);
    svg += card.svg;
    return { svg, arts: card.arts };
  },
  async 'angle'(b) {
    const { W, H, s, bufs } = b;
    const info = kitInfo(b);
    const L = kitLayout('angle', W / H, bufs.length, info, toneOf(b));
    const c = T_COLORS.angle[toneOf(b)];
    let svg = '';
    if (hasInfo(info)) {
      const items = [[TYPE.agEvent, info.event, L.textMax, c.event], [TYPE.agMoment, info.moment, L.textMax, c.moment], [TYPE.agClass, info.cls, L.textMax, c.cls]];
      const h = L.h * s, ht = L.ht * s, y0 = H - h;
      const w = Math.max(40 * s, 8 * s + tStackW(items, s));
      const th = typeH([[info.event, TYPE.agEvent], [info.moment, TYPE.agMoment], [info.cls, TYPE.agClass]], 0.8) * s;
      svg += `<polygon points="0,${r(y0)} ${r(w + ht)},${r(y0)} ${r(w)},${H} 0,${H}" fill="${c.slash}"/>`
        + `<polygon points="${r(w + ht + 1.2 * s)},${r(y0)} ${r(w + ht + 2.6 * s)},${r(y0)} ${r(w + 2.6 * s)},${H} ${r(w + 1.2 * s)},${H}" fill="${c.stripe}"/>`
        + tStack(items, s, 4 * s, H - 4.5 * s - th, 0.8).svg;
    }
    const o = 3.5 * s;
    const block = await sponsorBlock(bufs, s, L.mw, 'center');
    const cs = cardSize(block, s);
    const card = cardAround(block, s, W - o - cs.w, L.top ? o : H - o - cs.h);
    svg += card.svg;
    return { svg, arts: card.arts };
  },
});

// Overlay variants paint one badge per logo — each at its own position,
// exactly like the buyer preview. All other layouts keep one lockup:
// the logos are pre-composed into a single row (shrunk by count, like
// the preview .st-logos.multi CSS) so the 19 painters stay untouched.
const OVERLAY_MULTI = ['corner-badge', 'minimal-corner', 'round-badge'];
// Row sizing mirrors the preview (.st-logos buckets): single 5.4u,
// pair 4.2u, 3–4 share 3.4u, 5–8 share 2.6u. One row always — preview
// never wraps, so bake never wraps either.
function rowSize(count, u) {
  if (count > 4) return { h: 2.6 * u, maxW: 10 * u };
  if (count > 2) return { h: 3.4 * u, maxW: 13 * u };
  if (count > 1) return { h: 4.2 * u, maxW: 18 * u };
  return { h: 5.4 * u, maxW: 27 * u };
}
// Compose N fitted logos into one transparent row bitmap (shared by the
// strip path and the overlay-wide path below).
async function composeRow(bufs, u) {
  const { h: rowH, maxW: rowMaxW } = rowSize(bufs.length, u);
  const fitted = [];
  for (const b of bufs) fitted.push(await fitLogo(b, rowH, rowMaxW));
  const gap = Math.round(1.4 * u);
  const totalW = fitted.reduce((s, f, i) => s + f.w + (i ? gap : 0), 0);
  const maxH = Math.max(...fitted.map((f) => f.h));
  const parts = [];
  let x = 0;
  for (const f of fitted) {
    parts.push({ input: f.data, left: x, top: Math.round((maxH - f.h) / 2) });
    x += f.w + gap;
  }
  const rowSrc = await sharp({
    create: { width: totalW, height: maxH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(parts).png().toBuffer();
  return { data: rowSrc, w: totalW, h: maxH };
}
async function bakeVariant({ photoBuf, logoBufs, variant, positions, ctx, theme, designTags }) {
  if (!isVariant(variant)) throw new Error(`unknown logo variant: ${variant}`);
  const meta = await sharp(photoBuf).metadata();
  const W = meta.width || 1600, H = meta.height || 1000;
  const u = W / 100;
  const sUnit = Math.min(W, H) / 100;
  const dark = theme === 'dark' && THEMED_VARIANTS.includes(variant);
  const bufs = (logoBufs || []).slice(0, 8);
  const bakeCtx = { event: ctx?.event || '', className: ctx?.className || '', subject: ctx?.subject || '' };
  // Current templates show the buyer's moment text, else the photo's
  // canonical moment (same rule as momentText() in SponsorTemplates.jsx).
  const moment = String(designTags?.result || '').trim() || MOMENT_LABELS[ctx?.moment] || '';
  // Buyer result text (migration 097) or the default laurel word.
  const resultText = designTags?.result || 'WINNER';
  const posAt = (i) => OVERLAY_POS.includes(positions?.[i]) ? positions[i] : OVERLAY_POS[i % OVERLAY_POS.length];
  const paint = painters[variant];
  // Overlay >4 logos: one badge holding the full row at the first position
  // (mirrors the preview's .wide branch) — corners never overlap.
  if (OVERLAY_MULTI.includes(variant) && bufs.length > 4) {
    const row = await composeRow(bufs, u);
    const out = await paint({
      W, H, u, s: sUnit, bufs, logo: { data: row.data, w: row.w, h: row.h, raw: row.data }, pos: posAt(0), ctx: bakeCtx, dark,
      result: resultText, wide: true,
      refit: (h, maxW) => fitLogo(row.data, h, maxW),
    });
    const overlay = Buffer.from(
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${out.svg}</svg>`
    );
    return sharp(photoBuf)
      .composite([{ input: overlay, top: 0, left: 0 }, ...out.arts])
      .jpeg({ quality: 90 }).toBuffer();
  }
  if (OVERLAY_MULTI.includes(variant) && bufs.length > 1) {
    let svg = '';
    const arts = [];
    for (let i = 0; i < bufs.length; i++) {
      const fit = await fitLogo(bufs[i], 5.4 * u, 27 * u);
      const out = await paint({
        W, H, u, s: sUnit, bufs: [bufs[i]], logo: { data: fit.data, w: fit.w, h: fit.h, raw: bufs[i] }, pos: posAt(i), ctx: bakeCtx, dark,
        result: resultText,
        refit: (h, maxW) => fitLogo(bufs[i], h, maxW),
      });
      svg += out.svg;
      arts.push(...out.arts);
    }
    const overlay = Buffer.from(
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`
    );
    return sharp(photoBuf)
      .composite([{ input: overlay, top: 0, left: 0 }, ...arts])
      .jpeg({ quality: 90 }).toBuffer();
  }
  const { h: rowH, maxW: rowMaxW } = rowSize(bufs.length, u);
  let logo = null;
  let rowSrc = bufs[0] || null;
  if (bufs.length === 1) {
    const fit = await fitLogo(bufs[0], rowH, rowMaxW);
    logo = { data: fit.data, w: fit.w, h: fit.h, raw: bufs[0] };
  } else if (bufs.length > 1) {
    const row = await composeRow(bufs, u);
    rowSrc = row.data;
    logo = { data: row.data, w: row.w, h: row.h, raw: row.data };
  }
  const out = await paint({
    W, H, u, s: sUnit, bufs, logo, pos: posAt(0), ctx: bakeCtx, dark, moment,
    positionsAll: bufs.map((_, i) => posAt(i)),
    result: resultText,
    refit: (h, maxW) => fitLogo(rowSrc, h, maxW),
  });
  const overlay = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${out.svg}</svg>`
  );
  return (await baseFor(photoBuf, W, H, out))
    .composite([{ input: overlay, top: 0, left: 0 }, ...out.arts])
    .jpeg({ quality: 90 }).toBuffer();
}
// Matted layouts shrink the photo into photoRect (object-fit: cover,
// centred — same crop as the preview window) on a solid canvas.
async function baseFor(photoBuf, W, H, out) {
  if (!out.photoRect) return sharp(photoBuf);
  const { left, top, width, height } = out.photoRect;
  const inner = await sharp(photoBuf).resize({ width, height, fit: 'cover', position: 'centre' }).toBuffer();
  const canvas = await sharp({ create: { width: W, height: H, channels: 3, background: out.background || '#ffffff' } })
    .composite([{ input: inner, left, top }]).png().toBuffer();
  return sharp(canvas);
}

module.exports = { LOGO_VARIANTS, VARIANT_TO_TEMPLATE, THEMED_VARIANTS, templateOf, isVariant, bakeVariant };
