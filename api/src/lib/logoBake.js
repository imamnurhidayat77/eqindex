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
  'winner-banner', 'winner-arch', 'winner-portrait', 'winner-side',
  'winner-top', 'winner-bottom', 'winner-corner', 'winner-minimal',
];
// Mirrors templateOf() in SponsorTemplates.jsx — keep both in sync
// (web-bossmedia/tests/sponsor-templates.test.mjs guards the drift).
const VARIANT_TO_TEMPLATE = {
  'banner-wave': 'banner', 'portrait-swoosh': 'corner', 'square-bar': 'bottombar',
  'left-panel': 'winner', 'top-banner': 'top', 'corner-badge': 'corner',
  'portrait-drape': 'corner', 'round-badge': 'corner', 'gold-frame': 'minimal',
  'minimal-corner': 'minimal', 'class-spotlight': 'banner',
  'winner-banner': 'winner', 'winner-arch': 'winner', 'winner-portrait': 'winner',
  'winner-side': 'winner', 'winner-top': 'winner', 'winner-bottom': 'winner',
  'winner-corner': 'winner', 'winner-minimal': 'winner',
};
// Theme toggle only exists for these three (preview: THEMED_VARIANTS).
const THEMED_VARIANTS = ['banner-wave', 'square-bar', 'top-banner'];
const OVERLAY_POS = ['bottom-left', 'bottom-right', 'top-right'];

const templateOf = (v) => VARIANT_TO_TEMPLATE[v] || 'corner';
const isVariant = (v) => LOGO_VARIANTS.includes(v);

const NAVY = '#0e2233', NAVY2 = '#14304a', DEEP = '#0c1c2c';
const GOLD = '#d4a017', GOLD_LT = '#f2cd6b', GOLD_DK = '#cf9a2b';
const RESULT_TEXT = 'WINNER';
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
    const { W, H, u, logo, pos } = b;
    const padV = 1.8 * u, padH = 2.5 * u, sFs = 1.4 * u;
    const logoH = logo ? logo.h : 0;
    // Fixed 44% width like the preview (content hugs the left padding).
    const badgeW = Math.round(W * 0.44), badgeH = Math.round(padV + sFs + 0.7 * u + logoH + padV);
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
    const { W, H, u, logo, pos } = b;
    const dia = 24 * u, off = 3 * u;
    const cx = pos === 'bottom-left' ? off + dia / 2 : W - off - dia / 2;
    const cy = pos === 'top-right' ? off + dia / 2 : H - off - dia / 2;
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
    const lauCx = px + (tw(RESULT_TEXT, 4.6 * u, 0.04) + 2 * (4.6 * u + 1 * u)) / 2;
    svg += laurel(u, lauCx, midY - 1.2 * u, RESULT_TEXT, true);
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
    svg += crown(u, px + (tw(RESULT_TEXT, 4.6 * u, 0.04) + 2 * (4.6 * u + 1 * u)) / 2, midY - 4.6 * u - 1.2 * u, 6.5 * u);
    const lauCx = px + (tw(RESULT_TEXT, 4.6 * u, 0.04) + 2 * (4.6 * u + 1 * u)) / 2;
    svg += laurel(u, lauCx, midY, RESULT_TEXT, true);
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
    svg += laurel(u, cx, fy + lauH / 2, RESULT_TEXT, true);
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
    const lauCx = px + (tw(RESULT_TEXT, 4.6 * u, 0.04) + 2 * (4.6 * u + 1 * u)) / 2;
    svg += laurel(u, lauCx, midY - 1.2 * u, RESULT_TEXT, false);
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
    const lauTextW = tw(RESULT_TEXT, 4.6 * u, 0.04);
    const lauW = lauTextW + 2 * (4.6 * u + 1 * u);
    const nameMaxW = W - 2 * 3.2 * u - lauW - 2.5 * u - tagW - 1.4 * u - 1 * u;
    const pill = ctx.className ? classPill(u, 0, 0, cFs, String(ctx.className), 'row', NAVY, nameMaxW) : null;
    const groupW = lauW + (pill ? 2.5 * u + pill.w : 0);
    const contentH = Math.max(4.6 * u, pill ? pill.h : 0);
    const topH = Math.round(contentH + 2 * 1 * u);
    let svg = `<rect x="0" y="0" width="${W}" height="${topH}" fill="#ffffff"/>`;
    let gx = (W - groupW) / 2;
    const cy = 1 * u + contentH / 2;
    svg += laurel(u, gx + lauW / 2, cy, RESULT_TEXT, false);
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
    const lauTextW = tw(RESULT_TEXT, 4.6 * u, 0.04);
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
    svg += laurel(u, m + 2.5 * u + lauW / 2, lcy, RESULT_TEXT, true);
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
    const lauW = tw(RESULT_TEXT, 4.6 * u, 0.04) + 2 * (4.6 * u + 1 * u);
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
    svg += laurel(u, cx, y + 4.6 * u * 0.5, RESULT_TEXT, true);
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

async function bakeVariant({ photoBuf, logoBufs, variant, positions, ctx, theme }) {
  if (!isVariant(variant)) throw new Error(`unknown logo variant: ${variant}`);
  const meta = await sharp(photoBuf).metadata();
  const W = meta.width || 1600, H = meta.height || 1000;
  const u = W / 100;
  const dark = theme === 'dark' && THEMED_VARIANTS.includes(variant);
  const pos = OVERLAY_POS.includes(positions?.[0]) ? positions[0] : 'bottom-left';
  let logo = null;
  const first = (logoBufs || [])[0];
  if (first) {
    const fit = await fitLogo(first, 5.4 * u, 27 * u);
    logo = { data: fit.data, w: fit.w, h: fit.h, raw: first };
  }
  const out = await painters[variant]({
    W, H, u, logo, pos, ctx: { event: ctx?.event || '', className: ctx?.className || '', subject: ctx?.subject || '' }, dark,
    refit: (h, maxW) => fitLogo(first, h, maxW),
  });
  const overlay = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${out.svg}</svg>`
  );
  return sharp(photoBuf)
    .composite([{ input: overlay, top: 0, left: 0 }, ...out.arts])
    .jpeg({ quality: 90 }).toBuffer();
}

module.exports = { LOGO_VARIANTS, VARIANT_TO_TEMPLATE, THEMED_VARIANTS, templateOf, isVariant, bakeVariant };
