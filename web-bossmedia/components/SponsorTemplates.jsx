'use client';
import { useEffect, useState } from 'react';
import SmartImage from './SmartImage';
import s from './SponsorTemplates.module.css';

// Sponsor overlay templates — tempel di atas foto mana pun.
// Satu wrapper relative + foto cover; overlay absolute CSS/SVG murni,
// jadi bisa dipakai di gallery card, checkout preview, maupun hasil bake.
//
//   import { SponsorPhoto, TEMPLATE_VARIANTS } from '@/components/SponsorTemplates';
//   <SponsorPhoto photo={url} variant="banner-wave" sponsors={[{ label: 'Mitavite' }]} />
//
// Kalau sponsors[].src kosong, tampil lockup default "YOUR LOGO / SPONSOR"
// persis board referensi. Variant dikelompokkan:
//   sponsor-only : banner-wave, portrait-swoosh, square-bar, left-panel,
//                  top-banner, corner-badge, portrait-drape, round-badge,
//                  gold-frame, minimal-corner
//   winner       : winner-banner, winner-arch, winner-portrait, winner-side,
//                  winner-top, winner-bottom, winner-corner, winner-minimal

export const TEMPLATE_VARIANTS = [
  { id: 'banner-wave', group: 'Sponsor', name: 'Landscape · Bottom wave', short: 'Bottom wave', desc: 'Gelombang putih + garis navy/gold. Untuk foto wide 16:9, 3:2.' },
  { id: 'portrait-swoosh', group: 'Sponsor', name: 'Portrait · Corner swoosh', short: 'Corner swoosh', desc: 'Swoosh putih kanan-bawah. Untuk foto tegak 2:3, 4:5, 9:16.' },
  { id: 'square-bar', group: 'Sponsor', name: 'Square · Bottom bar', short: 'Bottom bar', desc: 'Bar putih lurus + divider gold. Untuk post 1:1.' },
  { id: 'left-panel', group: 'Sponsor', name: 'Left panel', short: 'Left panel', desc: 'Panel putih kiri. Muat teks event/category/title.' },
  { id: 'top-banner', group: 'Sponsor', name: 'Top banner', short: 'Top banner', desc: 'Foto bersih, sponsor di atas.' },
  { id: 'corner-badge', group: 'Sponsor', name: 'Badge · Corner logo', short: 'Frame', desc: 'Badge navy + kurva gold. Untuk background ramai.' },
  { id: 'portrait-drape', group: 'Sponsor', name: 'Portrait · Top drape', short: 'Top drape', desc: 'Tirai putih + list gold di atas. Untuk foto tegak.' },
  { id: 'round-badge', group: 'Sponsor', name: 'Round · Floating badge', short: 'Round badge', desc: 'Lencana bundar melayang. Untuk background ramai.' },
  { id: 'gold-frame', group: 'Sponsor', name: 'Frame · Gold line', short: 'Gold frame', desc: 'Bingkai gold tipis + pil logo bawah. Premium.' },
  { id: 'minimal-corner', group: 'Sponsor', name: 'Minimal · Corner marks', short: 'Minimal', desc: 'Hanya logo + bracket. Foto nyaris utuh.' },
  { id: 'class-spotlight', group: 'Sponsor', needsClass: true, name: 'Class · Spotlight band', short: 'Class spotlight', desc: 'Band navy: nama kelas + sponsor. Hanya untuk foto bertag kelas.' },
  { id: 'winner-banner', group: 'Winner', name: 'Winner · Full banner', short: 'Winner banner', desc: 'Panel navy kiri + gelombang sponsor. Poster landscape.' },
  { id: 'winner-arch', group: 'Winner', name: 'Winner · Gold arch', short: 'Winner arch', desc: 'Lengkung gold + mahkota. Poster premium.' },
  { id: 'winner-portrait', group: 'Winner', name: 'Winner · Vertical poster', short: 'Winner poster', desc: 'Judul event atas, winner tengah, sponsor bawah.' },
  { id: 'winner-side', group: 'Winner', name: 'Winner · Side panel', short: 'Winner panel', desc: 'Panel putih kiri: event, class, winner, sponsor.' },
  { id: 'winner-top', group: 'Winner', name: 'Winner · Top banner', short: 'Winner top', desc: 'Bar winner atas + strip sponsor bawah. Minimal.' },
  { id: 'winner-bottom', group: 'Winner', name: 'Winner · Bottom bar', short: 'Winner bar', desc: 'Satu bar: winner + class + sponsor.' },
  { id: 'winner-corner', group: 'Winner', name: 'Winner · Corner badge', short: 'Winner badge', desc: 'Badge diagonal putih. Untuk rasio apa pun.' },
  { id: 'winner-minimal', group: 'Winner', name: 'Winner · Minimal overlay', short: 'Winner minimal', desc: 'Bar gelap transparan di atas foto.' },
];

export const SPONSOR_VARIANTS = TEMPLATE_VARIANTS.filter((v) => v.group === 'Sponsor');
export const WINNER_VARIANTS = TEMPLATE_VARIANTS.filter((v) => v.group === 'Winner');

// Backend (api/src/routes/media.js + migrasi 091) hanya kenal 6 id ini.
// 15 varian di atas adalah presentasi frontend; saat checkout/cart kita
// kirim id backend terdekat lewat templateOf() agar validasi lolos.
export const BACKEND_TEMPLATES = ['corner', 'banner', 'top', 'minimal', 'winner', 'bottombar'];
const VARIANT_TO_TEMPLATE = {
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
export const OVERLAY_VARIANTS = ['corner-badge', 'minimal-corner', 'round-badge'];
export const variantName = (id) => TEMPLATE_VARIANTS.find((v) => v.id === id)?.name || id;
export const variantShort = (id) => TEMPLATE_VARIANTS.find((v) => v.id === id)?.short || id;
export const isVariant = (id) => TEMPLATE_VARIANTS.some((v) => v.id === id);
export const variantGroup = (id) => TEMPLATE_VARIANTS.find((v) => v.id === id)?.group || 'Sponsor';
export const variantNeedsClass = (id) => !!TEMPLATE_VARIANTS.find((v) => v.id === id)?.needsClass;
// Tema strip untuk banner|square|top (yang di-bake server): light = strip
// putih seperti preview, dark = strip navy legacy. Varian lain abaikan.
export const THEMED_VARIANTS = ['banner-wave', 'square-bar', 'top-banner'];
export const isTheme = (t) => t === 'light' || t === 'dark';

// Pilihan desain terakhir per foto — tombol Save di modal menulis ini,
// halaman checkout membacanya lagi supaya tidak hilang saat reload.
const SAVE_PREFIX = 'bossmedia:sponsor-design:';
export function saveDesign(mediaId, { template, logoIds, logoPos, theme }) {
  try {
    if (!mediaId) return;
    localStorage.setItem(SAVE_PREFIX + mediaId, JSON.stringify({
      template: isVariant(template) ? template : 'banner-wave',
      logoIds: (logoIds || []).slice(0, 1),
      logoPos: logoPos || {},
      theme: isTheme(theme) ? theme : 'light',
    }));
  } catch { /* private mode: pilihan sesi ini tetap jalan */ }
}
export function loadDesign(mediaId) {
  try {
    if (!mediaId) return null;
    const raw = localStorage.getItem(SAVE_PREFIX + mediaId);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || !isVariant(j.template)) return null;
    return { template: j.template, logoIds: Array.isArray(j.logoIds) ? j.logoIds : [], logoPos: j.logoPos || {}, theme: isTheme(j.theme) ? j.theme : 'light' };
  } catch { return null; }
}

function MountainMark({ light = false }) {
  return (
    <svg viewBox="0 0 44 28" width="34" height="22" aria-hidden="true">
      <path d="M4 24 16 6l7 10 4-6 13 14Z" fill={light ? '#fff' : '#0e2233'} />
      <path d="M16 6l4 6-3 2.4L13.4 12Z" fill={light ? '#0e2233' : '#fff'} opacity=".85" />
    </svg>
  );
}

function DefaultLogo({ compact = false, light = false }) {
  return (
    <span className={`${s["st-logo-default"]}${light ? ` ${s["light"]}` : ''}`}>
      <MountainMark light={light} />
      <span className={`${s["st-logo-words"]}`}>
        <strong>YOUR LOGO</strong>
        {!compact && <small>S P O N S O R</small>}
      </span>
    </span>
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

function EventHead({ event = 'AUCKLAND SHOW JUMPING CHAMPIONSHIP', light = false }) {
  return (
    <span className={`${s["st-event"]}${light ? " " + s["light"] : ""}`}>
      <svg viewBox="0 0 32 24" aria-hidden="true"><path d="M3 20C5 12 10 5 17 4c4-.5 8 1 11 5M7 20c2-6 6-11 12-12M17 4c-1 3-1 7 1 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      <strong>{event}</strong>
    </span>
  );
}

function ClassPill({ children }) {
  if (!children) return null;
  return (
    <span className={`${s["st-class"]}`}><span className={`${s["st-class-tag"]}`}>CLASS</span><span>{children}</span></span>
  );
}

// shortcut: logo pertama untuk lockup single
function firstLogo(sponsors) {
  return sponsors?.length ? sponsors.slice(0, 1) : [{ label: 'YOUR LOGO' }];
}

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
  const posOf = (i) => positions[logos[i]?.id] || ['bottom-left', 'bottom-right', 'top-right'][i % 3];
  const posCls = (i) => {
    const p = posOf(i);
    return p === 'top-right' ? s['pos-tr'] : p === 'bottom-right' ? s['pos-br'] : s['pos-bl'];
  };
  return (
    <div className={`${s["st-frame"]}${ar ? '' : ` ${s["st-natural"]}`}${compact ? ` ${s["st-compact"]}` : ''}`} style={{ ...(ar ? { aspectRatio: ar } : undefined), ...frameStyle }}>
      {photo && ar ? (
        <SmartImage src={photo} alt={alt} fill sizes="(max-width: 640px) 100vw, 560px" className={`${s["st-photo"]}`} />
      ) : (
        <div className={`${s["st-photo"]} ${s["st-photo-ph"]}`} aria-hidden="true"><span>PHOTO</span></div>
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
            <span className={`${s["st-logos"]}`}><LogoImg logo={logos[0]} /></span>
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
            <LogoImg logo={logos[0]} />
          </div>
        </>
      )}

      {variant === 'square-bar' && (
        <div className={`${s["st-strip"]} ${s["st-strip-square"]}${dark ? ` ${s["st-dark"]}` : ''}`}>
          <SupportedLabel light={dark} />
          <span className={`${s["st-divider"]}`} aria-hidden="true" />
          <span className={`${s["st-logos"]}`}><LogoImg logo={logos[0]} /></span>
        </div>
      )}

      {variant === 'left-panel' && (
        <div className={`${s["st-side"]}`}>
          <small>SUPPORTED BY</small>
          <LogoImg logo={logos[0]} />
          {event && <strong className={`${s["st-side-event"]}`}>{event}</strong>}
          {classLabel && <span className={`${s["st-side-class"]}`}>{classLabel}</span>}
        </div>
      )}

      {variant === 'top-banner' && (
        <div className={`${s["st-strip"]} ${s["st-strip-top"]}${dark ? ` ${s["st-dark"]}` : ''}`}>
          <SupportedLabel light={dark} />
          <span className={`${s["st-divider"]}`} aria-hidden="true" />
          <span className={`${s["st-logos"]}`}><LogoImg logo={logos[0]} /></span>
        </div>
      )}

      {variant === 'corner-badge' && (
        <div className={`${s["st-badge"]} ${posCls(0)}`}>
          <small>SUPPORTED BY</small>
          <span className={`${s["st-badge-logo"]}`}><LogoImg logo={logos[0]} light /></span>
        </div>
      )}

      {variant === 'portrait-drape' && (
        <>
          <svg className={`${s["st-drape"]}`} viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 0 L400 0 L400 60 C320 96 240 70 160 92 C100 108 40 104 0 118 Z" fill="#fff" />
            <path d="M0 118 C40 104 100 108 160 92 C240 70 320 96 400 60" fill="none" stroke="#d4a017" strokeWidth="5" />
            <path d="M0 126 C40 112 100 116 160 100 C240 78 320 104 400 68" fill="none" stroke="#0e2233" strokeWidth="9" />
          </svg>
          <div className={`${s["st-drape-lockup"]}`}>
            <small>SUPPORTED BY</small>
            <LogoImg logo={logos[0]} />
          </div>
        </>
      )}

      {variant === 'round-badge' && (
        <div className={`${s["st-round"]} ${posCls(0)}`}>
          <LogoImg logo={logos[0]} />
        </div>
      )}

      {variant === 'gold-frame' && (
        <>
          <span className={`${s["st-gframe"]}`} aria-hidden="true" />
          <div className={`${s["st-gpill"]}`}>
            <SupportedLabel />
            <LogoImg logo={logos[0]} />
          </div>
        </>
      )}

      {variant === 'minimal-corner' && (
        <>
          <span className={`${s["st-corner"]} ${s["tl"]}`} aria-hidden="true" />
          <span className={`${s["st-corner"]} ${s["br"]}`} aria-hidden="true" />
          <div className={`${s["st-minimal"]} ${posCls(0)}`}><LogoImg logo={logos[0]} /></div>
        </>
      )}

      {variant === 'class-spotlight' && classLabel && (
        <div className={`${s["st-strip"]} ${s["st-classband"]}`}>
          <span className={`${s["st-classband-left"]}`}>
            <span className={`${s["st-class-tag"]}`}>CLASS</span>
            <strong className={`${s["st-classband-name"]}`}>{classLabel}</strong>
          </span>
          <span className={`${s["st-minchip"]}`}>{logos[0]?.src ? <LogoImg logo={logos[0]} /> : <DefaultLogo />}</span>
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
            <WinnerLaurel gold><strong>{result || 'WINNER'}</strong></WinnerLaurel>
            {subject && <em className={`${s["st-subject"]} ${s["light"]}`}>{subject}</em>}
          </div>
          <svg className={`${s["st-arch-seam"]}`} viewBox="0 0 100 800" preserveAspectRatio="none" aria-hidden="true">
            <path d="M28 0 C88 220 88 580 28 800" fill="none" stroke="#d4a017" strokeWidth="7" />
          </svg>
          <svg className={`${s["st-wave"]}`} viewBox="0 0 800 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 78 C160 60 260 96 420 74 C580 52 660 88 800 40 L800 120 L0 120 Z" fill="#fff" />
            <path d="M0 78 C160 60 260 96 420 74 C580 52 660 88 800 40" fill="none" stroke="#d4a017" strokeWidth="4" />
          </svg>
          <div className={`${s["st-strip"]} ${s["st-strip-bottom"]}`}>
            <SupportedLabel />
            <span className={`${s["st-logos"]}`}><LogoImg logo={logos[0]} /></span>
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
            <WinnerLaurel gold><strong>{result || 'WINNER'}</strong></WinnerLaurel>
            {subject && <em className={`${s["st-subject"]} ${s["light"]}`}>{subject}</em>}
          </div>
          <svg className={`${s["st-wave"]}`} viewBox="0 0 800 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 78 C160 60 260 96 420 74 C580 52 660 88 800 40 L800 120 L0 120 Z" fill="#fff" />
            <path d="M0 78 C160 60 260 96 420 74 C580 52 660 88 800 40" fill="none" stroke="#d4a017" strokeWidth="4" />
          </svg>
          <div className={`${s["st-strip"]} ${s["st-strip-bottom"]}`}>
            <SupportedLabel />
            <span className={`${s["st-logos"]}`}><LogoImg logo={logos[0]} /></span>
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
              <span className={`${s["st-logos"]}`}><LogoImg logo={logos[0]} /></span>
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
            <div className={`${s["st-wside-sponsor"]}`}><SupportedLabel /><LogoImg logo={logos[0]} /></div>
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
            <span className={`${s["st-logos"]}`}><LogoImg logo={logos[0]} /></span>
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
            <LogoImg logo={logos[0]} />
          </span>
        </div>
      )}

      {variant === 'winner-corner' && (
        <>
          <div className={`${s["st-diag"]}`}><SupportedLabel /><LogoImg logo={firstLogo(logos)[0]} /></div>
        </>
      )}

      {variant === 'winner-minimal' && (
        <div className={`${s["st-strip"]} ${s["st-strip-minimal"]}`}>
          <WinnerLaurel gold><strong>{result || 'WINNER'}</strong></WinnerLaurel>
          {classLabel && <span className={`${s["st-minclass"]}`}>{classLabel}</span>}
          <span className={`${s["st-minsponsor"]}`}>
            <SupportedLabel light />
            <span className={`${s["st-minchip"]}`}>{logos[0]?.src ? <LogoImg logo={logos[0]} /> : <DefaultLogo />}</span>
          </span>
        </div>
      )}
    </div>
  );
}
