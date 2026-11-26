'use client';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { API } from '../lib/api';
import { LOGO_URL, currentMerchSettings, LOGO_ZOOM_MIN, clampShift, clampSpin, isClubSlot, isHorseProduct, isMerchColor, isMerchSize, isUploadSlot, merchColorName, merchModel, merchPhotoSrc, merchPositions, merchProduct, merchProducts, migrateSlotId, quoteMerch, slotShiftLimits, slotSizeUnits, snapSpin } from '../lib/merch.mjs';
import { MERCH_PRICING_RULES, merchClub } from '../lib/merch-config.mjs';
import SmartImage from './SmartImage';
import SlotEditor from './SlotEditor';
import MerchOrderForm, { ORDER_FORM_ID } from './MerchOrderForm';
import s from './MerchClient.module.css';

const Merch3D = dynamic(() => import('./Merch3D'), {
  ssr: false,
  loading: () => <p className={s.est}>Loading 3D preview…</p>,
});

export const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;
// Signed price effect for breakdown rows: "−NZ$5.00", "+NZ$8.00", "Included".
const signed = (c) => (c < 0 ? `−${nzd(-c)}` : c > 0 ? `+${nzd(c)}` : 'Included');

// Club storefront id from ?club=<id>, read after mount (no hydration
// mismatch, no Suspense boundary for useSearchParams). '' when absent or
// unknown, so callers can append it to links as-is.
export function useClubParam() {
  const [id, setId] = useState('');
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('club');
    setId(merchClub(raw) ? String(raw) : '');
  }, []);
  return id;
}
export const withClub = (href, clubId) => (clubId ? `${href}?club=${encodeURIComponent(clubId)}` : href);
const SAVE_KEY = 'bossmedia:merch-draft';


export function groupOf(productId) {
  const model = merchModel(productId);
  if (model === 'cap') return 'cap';
  if (model === 'ear-bonnet') return 'bonnet';
  if (model === 'saddle-blanket' || model === 'rug-light' || model === 'rug-warm') return 'flat';
  return 'top';
}

// Step 1 hero photo: flat horse gear is edge-on from the front, so it shows
// its side; everything else faces front.
export function heroView(productId) {
  return groupOf(productId) === 'flat' ? 'side-left' : 'front';
}

// Real product photo first, vector silhouette as fallback until the photo
// files land in public/merch/<product-id>/<view>.jpg. Views: front,
// side-left, side-right, back (Step 4 maps each position to its angle).
// Polo and tee stay vector-only: the black shots crush the
// collar/placket/buttons into a blob, while the vector draws them.
const VECTOR_ONLY = new Set(['polo', 'tee']);
export function ProductPhoto({ productId, view, alt, group, product, color, dot, dotState, className, imgStyle }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [productId, view]);
  // Tops show the collar zone; flat gear stays centred on the side panel.
  // Cover fills the tile (no letterbox); anchor tops near the collar so
  // cover crops the hem, never the collar/buttons.
  const position = group === 'flat' ? 'center 50%' : 'center 12%';
  if (!failed && !VECTOR_ONLY.has(merchModel(productId))) {
    return (
      <span className={s.photoWrap}>
        <SmartImage
          src={merchPhotoSrc(productId, view)}
          alt={alt}
          width={320}
          height={200}
          unoptimized
          className={className || s.photo}
          style={imgStyle || { objectFit: 'cover', objectPosition: position, width: '100%', height: '148px' }}
          onError={() => setFailed(true)}
        />
        {dot && (
          <span className={s.photoDot} data-state={dotState} style={{ left: `${dot[0]}%`, top: `${dot[1]}%` }} aria-hidden="true" />
        )}
      </span>
    );
  }
  return <ProductVector group={group} product={product} color={color} dot={dot} dotState={dotState} className={className} />;
}

// Product illustrations: shaded vector garments in the buyer's colourway.
// Cards pass `product` for per-style details (jacket zip, polo collar…);
// position maps pass `group` and get a generic silhouette + dot.
function ProductVector({ group, product, color, dot, dotState, className }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const light = ['#ffffff', '#e8e4da'].includes(String(color).toLowerCase());
  const stroke = light ? '#3a352c' : '#ffffff';
  const detail = light ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.55)';
  const fab = `fab${uid}`;
  const top = `top${uid}`;
  const model = merchModel(product);
  const topKind = group === 'top' ? (model === 'jacket' ? 'jacket' : model === 'polo' ? 'polo' : 'tee') : null;
  const body = 'M22 8 L28 12 L32 14 L36 12 L42 8 L52 18 L47 28 L42 25 L42 58 L22 58 L22 25 L17 28 L12 18 Z';
  return (
    <svg viewBox="0 0 64 64" className={className || s.thumb} aria-hidden="true">
      <defs>
        <linearGradient id={fab} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".5" />
          <stop offset=".25" stopColor="#000" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".16" />
          <stop offset=".75" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".5" />
        </linearGradient>
        <linearGradient id={top} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".2" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".38" />
        </linearGradient>
      </defs>
      {topKind && (
        <>
          <path d={body} fill={color} stroke={stroke} strokeOpacity=".8" strokeWidth="1.5" strokeLinejoin="round" />
          <path d={body} fill={`url(#${fab})`} />
          <path d={body} fill={`url(#${top})`} />
          {topKind === 'jacket' && (
            <>
              <path d="M26 7 h12 v7 h-12 Z" fill={color} stroke={stroke} strokeOpacity=".8" strokeWidth="1.2" />
              <line x1="32" y1="14" x2="32" y2="58" stroke={detail} strokeWidth="1.6" />
              <rect x="30.6" y="19" width="2.8" height="5" rx="1" fill="none" stroke={detail} strokeWidth="1.2" />
              <line x1="23" y1="38" x2="28" y2="38" stroke={detail} strokeWidth="1.4" />
              <line x1="36" y1="38" x2="41" y2="38" stroke={detail} strokeWidth="1.4" />
            </>
          )}
          {topKind === 'polo' && (
            <>
              <path d="M26 8 L32 15 L32 8 Z M38 8 L32 15 L32 8 Z" fill={color} stroke={stroke} strokeOpacity=".8" strokeWidth="1.1" strokeLinejoin="round" />
              <line x1="32" y1="15" x2="32" y2="27" stroke={detail} strokeWidth="1.4" />
              <circle cx="32" cy="19" r="1.3" fill={detail} />
              <circle cx="32" cy="23.5" r="1.3" fill={detail} />
            </>
          )}
          {topKind === 'tee' && (
            <ellipse cx="32" cy="11.5" rx="6" ry="2.6" fill="none" stroke={detail} strokeWidth="1.6" />
          )}
        </>
      )}
      {group === 'cap' && (
        <>
          <path d="M14 42 Q16 20 32 20 Q48 20 50 42 Z" fill={color} stroke={stroke} strokeOpacity=".8" strokeWidth="1.5" />
          <path d="M14 42 Q16 20 32 20 Q48 20 50 42 Z" fill={`url(#${top})`} />
          <path d="M32 20 Q30 30 32 42 M22 22 Q24 31 24 41 M42 22 Q40 31 40 41" fill="none" stroke={detail} strokeWidth="1" />
          <circle cx="32" cy="20" r="1.8" fill={detail} />
          <rect x="6" y="40" width="52" height="7" rx="3.5" fill={color} stroke={stroke} strokeOpacity=".8" strokeWidth="1.5" />
          <line x1="12" y1="43.5" x2="52" y2="43.5" stroke={detail} strokeWidth="1" strokeDasharray="3 2" />
        </>
      )}
      {group === 'flat' && (
        <>
          <rect x="8" y="20" width="48" height="26" rx="4" fill={color} stroke={stroke} strokeOpacity=".8" strokeWidth="1.5" />
          <rect x="8" y="20" width="48" height="26" rx="4" fill={`url(#${top})`} />
          <path d="M14 20 L30 46 M26 20 L42 46 M38 20 L54 46 M50 20 L54 28 M14 46 L20 46 M8 38 L14 46 M8 26 L14 26" stroke={detail} strokeWidth="1" />
          <line x1="8" y1="33" x2="56" y2="33" stroke="#e3b341" strokeWidth="3" />
          <line x1="8" y1="31.6" x2="56" y2="31.6" stroke="#fff" strokeOpacity=".7" strokeWidth=".8" />
        </>
      )}
      {group === 'bonnet' && (
        <>
          <path d="M22 22 L18 8 L30 18 Z" fill={color} stroke={stroke} strokeOpacity=".8" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M42 22 L46 8 L34 18 Z" fill={color} stroke={stroke} strokeOpacity=".8" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M23 19 L21 11 L27 17 Z M41 19 L43 11 L37 17 Z" fill={detail} />
          <rect x="20" y="20" width="24" height="34" rx="10" fill={color} stroke={stroke} strokeOpacity=".8" strokeWidth="1.5" />
          <rect x="20" y="20" width="24" height="34" rx="10" fill={`url(#${top})`} />
          <circle cx="27" cy="38" r="2.2" fill="#0b0b0b" />
          <circle cx="37" cy="38" r="2.2" fill="#0b0b0b" />
        </>
      )}
      {dot && (
        <circle cx={dot[0] * 0.64} cy={dot[1] * 0.64}
          r={dotState === 'active' ? 6 : 4.5}
          fill={dotState === 'filled' ? '#b98a1f' : dotState === 'active' ? '#e3b341' : 'none'}
          stroke={dotState === 'empty' ? '#8a8474' : '#b98a1f'}
          strokeWidth="1.6" strokeDasharray={dotState === 'empty' ? '2.5 2' : undefined} />
      )}
    </svg>
  );
}

// Live price breakdown: every row comes from quote.lines, so the rows
// always add up to the total shown next to them and in the order bar.
function PriceLines({ quote }) {
  if (!quote) return null;
  return (
    <div className={s.priceBox}>
      {quote.lines.map((l, i) => (
        <div className={s.row} key={`${l.kind}:${l.slot || ''}:${i}`} data-kind={l.kind}>
          <span>{l.label}</span>
          <span className={l.cents < 0 ? s.gold : undefined}>{l.kind === 'base' || (l.kind === 'upload' && !l.cents) ? nzd(l.cents) : signed(l.cents)}</span>
        </div>
      ))}
      <div className={`${s.row} ${s.total}`}><span>Per item</span><span>{nzd(quote.totalCents)}</span></div>
      <p className={s.est}>
        Live estimate. Checkout re-quotes on the server.
        {MERCH_PRICING_RULES.placeholder ? ' Prices are provisional and confirmed on your proof.' : ''}
      </p>
    </div>
  );
}

// Interactive merch customizer (Charles × Paladin concept).
// Sponsor rule = same as photos: the picker lists ONLY logos from
// GET /api/sponsor-logos, which the server already filters to funded,
// registered sponsors. No free upload here — buyer picks, never adds.
export default function MerchClient({ productId: initialProductId = 'jacket', single = false }) {
  const [productId, setProductId] = useState(merchProduct(initialProductId) ? initialProductId : 'jacket');
  const product = merchProduct(productId) || merchProducts()[0];
  const colorName = (c) => merchColorName(product.id, c);
  const [color, setColor] = useState(product.colors[0]);
  const [size, setSize] = useState(product.sizes[2] || product.sizes[0]);
  const [slots, setSlots] = useState({});
  const [slotZoom, setSlotZoom] = useState({});
  const [slotShift, setSlotShift] = useState({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  // Studio inspector tab, mirrored by the left stage rail. Garment first.
  const [tab, setTab] = useState('garment');
  const [activePos, setActivePos] = useState('chest-left');
  // Club storefront (?club=): its logo sits in this product's default slot.
  // A locked club logo cannot be removed or replaced, only fine-tuned.
  const clubId = useClubParam();
  const club = merchClub(clubId);
  // A new product takes its club default from the model it reuses.
  const clubDefault = club?.defaults?.[productId] ?? club?.defaults?.[merchModel(productId)];
  const clubSlot = club && merchPositions(productId).some((p) => p.id === clubDefault) ? clubDefault : null;
  const isLocked = (pos) => !!(club?.locked && pos === clubSlot);
  // Logo aspect ratios as measured by the 3D preview (for slider limits).
  const [aspects, setAspects] = useState({});
  const [logos, setLogos] = useState([]);
  const [discounts, setDiscounts] = useState({});
  // Buyer production notes (Details tab): persisted with the draft so a
  // design survives reloads; shown in the review summary.
  const [notes, setNotes] = useState('');
  // Buyer club logos: session-only object URLs, placed but never discounted.
  const [uploads, setUploads] = useState([]);
  const uploadsRef = useRef([]);
  useEffect(() => { uploadsRef.current = uploads; }, [uploads]);
  const [uploadErr, setUploadErr] = useState('');
  // Logged-in buyers: logos saved to their account ("My sponsor logos",
  // shared with photos). null = not checked yet, false = guest.
  const [myLogos, setMyLogos] = useState(null);
  const [myBusy, setMyBusy] = useState(false);
  // Two-tap delete of a saved logo (no blocking dialog): first tap asks.
  const [delAsk, setDelAsk] = useState('');
  const [delBusy, setDelBusy] = useState('');
  const uploadRef = useRef(null);
  const stageRef = useRef(null);
  // Wheel over the 3D stage must scroll the page, never dolly the camera:
  // OrbitControls listens on the canvas, so swallow wheel events at the
  // stage (capture) before they reach it. Pinch-zoom and the +/− dock
  // buttons keep working — only the scroll hijack goes away.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e) => e.stopPropagation();
    el.addEventListener('wheel', onWheel, { capture: true, passive: true });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, []);
  // First 3D frame presented: retires the onboarding hint (§3D — it never
  // comes back, product switches keep the last frame mounted).
  const [modelReady, setModelReady] = useState(false);
  // Guided stages: one horizontal progress system drives the inspector.
  // Back never loses configuration — all stages share the same state.
  // Stage switches keep the page where the buyer left it, except the small
  // nudge below that keeps the order bar on screen.
  const goStage = (t) => {
    setTab(t);
  };
  // Two-column layout: the order bar is the right panel's footer. The panel
  // always ends just above the viewport bottom, wherever the page is
  // scrolled, so the bar is never cut off. Its height only changes while
  // the panel moves up to its sticky spot under the header (top 96px);
  // after that it is constant and nothing is written per scroll frame.
  const sideRef = useRef(null);
  useEffect(() => {
    const el = sideRef.current;
    if (!el) return undefined;
    const mq = window.matchMedia('(min-width: 901px)');
    let last = -1;
    let raf = 0;
    const fit = () => {
      raf = 0;
      if (!mq.matches) { if (last !== -1) { el.style.maxHeight = ''; last = -1; } return; }
      const top = Math.max(96, el.getBoundingClientRect().top);
      const h = Math.max(240, Math.round(window.innerHeight - top - 16));
      if (h !== last) { el.style.maxHeight = `${h}px`; last = h; }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(fit); };
    fit();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    mq.addEventListener('change', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      mq.removeEventListener('change', onScroll);
    };
  }, []);
  // Sticky bar primary action follows the stage: advance, or submit the
  // proof on the final stage (scrolling to the form when details are missing).
  // On Details it submits the order form (native validation first).
  const [order, setOrder] = useState({ busy: false, done: false, totalCents: null });
  const primaryAction = tab === 'garment' ? () => goStage('branding')
    : tab === 'branding' ? () => goStage('details')
    : order.busy || order.done || order.totalCents == null ? null
    : () => document.getElementById(ORDER_FORM_ID)?.requestSubmit();
  const primaryLabel = tab === 'garment' ? 'Next: Branding →'
    : tab === 'branding' ? 'Next: Details →'
    : order.done ? 'Order sent' : order.busy ? 'Sending…' : 'Send request';
  // Tapping a 3D placement opens its branding config: an explicit gesture
  // on the thing being configured, never an automatic context yank.
  const selectPos = (pos) => {
    setActivePos(pos);
    if (tab !== 'branding') goStage('branding');
  };
  // Undo/redo over buyer-visible design state. One debounced commit per
  // edit burst (slider drags coalesce); uploads stay out because their
  // object URLs are session-only — restoring one would point at a dead blob.
  const hist = useRef({ stack: [], i: -1, timer: null, applying: false });
  const [histPos, setHistPos] = useState({ i: -1, n: 0 });
  useEffect(() => {
    const h = hist.current;
    if (h.applying) { h.applying = false; return; }
    clearTimeout(h.timer);
    h.timer = setTimeout(() => {
      h.stack = h.stack.slice(0, h.i + 1);
      h.stack.push({ productId, color, size, slots, slotZoom, slotShift });
      if (h.stack.length > 40) h.stack.shift();
      h.i = h.stack.length - 1;
      setHistPos({ i: h.i, n: h.stack.length });
    }, 500);
    return () => clearTimeout(h.timer);
  }, [productId, color, size, slots, slotZoom, slotShift]);
  const applySnap = (snap) => {
    const h = hist.current;
    h.applying = true;
    clearTimeout(h.timer);
    const alive = new Set(uploadsRef.current.map((u) => `upload:${u.url}`));
    const kept = Object.fromEntries(
      Object.entries(snap.slots || {}).filter(([, v]) => !String(v || '').startsWith('upload:') || alive.has(String(v))),
    );
    setProductId(snap.productId);
    setColor(snap.color);
    setSize(snap.size);
    setSlots(kept);
    setSlotZoom(snap.slotZoom || {});
    setSlotShift(snap.slotShift || {});
    setHistPos({ i: h.i, n: h.stack.length });
  };
  const undo = () => {
    const h = hist.current;
    if (h.i <= 0) return;
    h.i -= 1;
    applySnap(h.stack[h.i]);
  };
  const redo = () => {
    const h = hist.current;
    if (h.i >= h.stack.length - 1) return;
    h.i += 1;
    applySnap(h.stack[h.i]);
  };
  const canUndo = histPos.i > 0;
  const canRedo = histPos.i < histPos.n - 1;

  useEffect(() => {
    setColor(product.colors[0]);
    setSize(product.sizes[2] || product.sizes[0]);
    // Placement differs per product — park on the first valid position and
    // drop slots for positions this product does not offer (shared draft
    // across /merch/[id] pages must never plant a jacket shoulder on a polo).
    const ids = merchPositions(productId).map((p) => p.id);
    const allow = new Set(ids);
    setActivePos((cur) => (ids.includes(cur) ? cur : ids[0]));
    setSlots((v) => Object.fromEntries(Object.entries(v).filter(([k]) => allow.has(k))));
    setSlotZoom((v) => Object.fromEntries(Object.entries(v).filter(([k]) => allow.has(k))));
    setSlotShift((v) => Object.fromEntries(Object.entries(v).filter(([k]) => allow.has(k))));
  }, [productId]); // eslint-disable-next-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    // Merch only lists sponsors funding merchandise (photo budgets are separate).
    fetch(`${API}/api/sponsor-logos?applies_to=merch`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setLogos(j?.data || []); }).catch(() => {});
    fetch(`${API}/api/my/sponsor-logos`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setMyLogos(j ? j.data || [] : false); })
      .catch(() => { if (live) setMyLogos(false); });
    fetch(`${API}/api/sponsor-discounts?applies_to=merch`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live) return;
        const m = {};
        for (const row of j?.data || []) {
          const key = String(row.sponsor_name || '').toLowerCase();
          m[key] = Number(row.discount_cents) || 0;
        }
        setDiscounts(m);
      }).catch(() => {});
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        // Single-product page stays on its own product; only the shared
        // picker page follows the saved draft.
        if (d?.productId && !single) setProductId(d.productId);
        // Uploaded club logos are session-only object URLs — drop them on
        // reload so no slot ever points at a dead blob. Slots are also
        // scoped to this product's positions (see the productId effect).
        const allow = new Set(merchPositions(initialProductId).map((p) => p.id));
        // Older drafts may name slots this product no longer uses (jacket
        // shoulders became sleeves): carry them over before filtering.
        const migrate = (obj) => Object.fromEntries(
          Object.entries(obj || {}).map(([k, v]) => [migrateSlotId(d?.productId || initialProductId, k), v]),
        );
        if (d?.slots) {
          const kept = Object.fromEntries(
            Object.entries(migrate(d.slots)).filter(([k, v]) => allow.has(k) && !String(v || '').startsWith('upload:')),
          );
          setSlots(kept);
        }
        if (d?.slotZoom) setSlotZoom(Object.fromEntries(Object.entries(migrate(d.slotZoom)).filter(([k]) => allow.has(k))));
        if (d?.slotShift) {
          const kept = {};
          for (const [k, v] of Object.entries(migrate(d.slotShift))) {
            if (!allow.has(k)) continue;
            kept[k] = { x: clampShift(v?.x), y: clampShift(v?.y), r: clampSpin(v?.r), f: !!v?.f };
          }
          setSlotShift(kept);
        }
        if (typeof d?.notes === 'string') setNotes(d.notes.slice(0, 500));
        if (typeof d?.color === 'string' && isMerchColor(initialProductId, d.color)) setColor(d.color);
        if (typeof d?.size === 'string' && isMerchSize(initialProductId, d.size)) setSize(d.size);
      }
    } catch { /* private mode: start fresh */ }
    setDraftLoaded(true);
    return () => { live = false; };
  }, []);

  useEffect(() => () => {
    uploads.forEach((u) => { try { URL.revokeObjectURL(u.url); } catch { /* ignore */ } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A guest's saved-logo slots (from a draft made while logged in) cannot
  // be ordered, so drop them once we know nobody is logged in.
  useEffect(() => {
    if (myLogos !== false) return;
    setSlots((v) => Object.fromEntries(Object.entries(v).filter(([, val]) => !String(val || '').startsWith('my:'))));
  }, [myLogos]);

  // Logged in: save to the account so the logo is reusable on photos too.
  const saveMyLogos = async (list) => {
    setMyBusy(true);
    for (const f of list) {
      const okType = ['image/png', 'image/jpeg'].includes(f.type) || /\.(png|jpe?g)$/i.test(f.name || '');
      if (!okType) { setUploadErr('Logos must be PNG or JPEG.'); continue; }
      if (f.size > 2 * 1024 * 1024) { setUploadErr('Saved logos must be 2 MB or less.'); continue; }
      const fd = new FormData();
      fd.append('logo', f);
      fd.append('label', String(f.name || 'My logo').replace(/\.[^.]+$/, '').slice(0, 40) || 'My logo');
      try {
        const r = await fetch(`${API}/api/my/sponsor-logos`, { method: 'POST', body: fd, credentials: 'include' });
        const j = await r.json().catch(() => null);
        if (!r.ok) { setUploadErr(j?.error ? `Upload failed: ${j.error}.` : 'Upload failed. Try again.'); continue; }
        setMyLogos((v) => [{ id: j.data.id, label: j.data.label, sponsor_name: j.data.sponsor_name }, ...(v || [])]);
      } catch { setUploadErr('Upload failed. Check your connection.'); }
    }
    setMyBusy(false);
  };

  const deleteMyLogo = async (l) => {
    setDelBusy(l.id);
    setUploadErr('');
    try {
      const r = await fetch(`${API}/api/my/sponsor-logos/${encodeURIComponent(l.id)}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok && r.status !== 404) throw new Error();
      setMyLogos((v) => (v || []).filter((x) => x.id !== l.id));
      setSlots((v) => Object.fromEntries(Object.entries(v).filter(([, val]) => val !== `my:${l.id}`)));
    } catch { setUploadErr('Could not delete the logo. Try again.'); }
    setDelBusy('');
    setDelAsk('');
  };

  const handleUploadFiles = (files) => {
    setUploadErr('');
    const list = [...(files || [])];
    if (!list.length) return;
    if (myLogos) { saveMyLogos(list); return; }
    if (uploads.length + list.length > 3) { setUploadErr('Up to 3 club logos per design — remove one first.'); return; }
    const next = [];
    for (const f of list) {
      const okType = ['image/png', 'image/jpeg'].includes(f.type) || /\.(png|jpe?g)$/i.test(f.name || '');
      if (!okType) { setUploadErr('Club logos must be PNG or JPEG.'); continue; }
      if (f.size > 10 * 1024 * 1024) { setUploadErr('Club logos must be 10 MB or less.'); continue; }
      const label = String(f.name || 'Club logo').replace(/\.[^.]+$/, '').slice(0, 40) || 'Club logo';
      next.push({ key: `u${Date.now().toString(36)}${next.length}`, url: URL.createObjectURL(f), label, file: f });
    }
    if (next.length) setUploads((v) => [...v, ...next]);
  };
  const clearUploads = () => {
    uploads.forEach((u) => { try { URL.revokeObjectURL(u.url); } catch { /* ignore */ } });
    setUploads([]);
    setSlots((v) => {
      const next = { ...v };
      for (const [k, val] of Object.entries(next)) {
        if (String(val || '').startsWith('upload:')) delete next[k];
      }
      return next;
    });
  };

  // Never save before the draft above has been read back: the first commit
  // still holds the empty initial state, and saving it would wipe the draft
  // (React's dev double-mount then reloads that empty draft).
  useEffect(() => {
    if (!draftLoaded) return;
    // Debounced: a burst of edits (keys, sliders) writes the draft once.
    const t = setTimeout(() => {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ productId, color, size, notes, slots, slotZoom, slotShift })); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [draftLoaded, productId, color, size, notes, slots, slotZoom, slotShift]);

  // Slots as shown and priced: the club logo is merged in here instead of
  // being written into state, so undo, drafts and product switches can
  // never drop or duplicate it.
  const effSlots = useMemo(() => {
    if (!clubSlot) return slots;
    if (club.locked || !slots[clubSlot]) return { ...slots, [clubSlot]: `club:${club.id}` };
    return slots;
  }, [slots, club, clubSlot]);
  // Live transform from the 2D slot editor while a gesture runs; it is
  // committed to slotShift/slotZoom once on release (one undo step).
  const [preview, setPreview] = useState(null);
  const zoomFractions = useMemo(() => {
    const m = {};
    for (const [k, v] of Object.entries(slotZoom)) m[k] = Number(v) / 100;
    if (preview) m[preview.pos] = preview.zoom;
    return m;
  }, [slotZoom, preview]);
  const viewShift = useMemo(() => (
    preview
      ? { ...slotShift, [preview.pos]: { ...(slotShift[preview.pos] || {}), x: preview.x, y: preview.y, r: preview.r } }
      : slotShift
  ), [slotShift, preview]);
  const setSlot = (pos, logoId) => !isLocked(pos) && setSlots((v) => {
    const next = { ...v };
    if (!logoId) delete next[pos];
    else next[pos] = logoId;
    return next;
  });
  // Gentle next step: when the active position is filled, offer the next
  // empty one (explicit tap — never yanks context mid-tuning).
  const nextEmptyPos = merchPositions(product.id).map((p) => p.id)
    .find((id) => id !== activePos && !effSlots[id]);
  const discountOf = (l) => discounts[String(l.sponsor_name || '').toLowerCase()] || 0;
  // Human-readable artwork name for the review summary.
  const logoLabel = (id) => {
    if (!id) return '—';
    if (isClubSlot(id)) return `${merchClub(String(id).slice(5))?.name || 'Club'} logo`;
    if (String(id).startsWith('my:')) {
      const m = (myLogos || []).find((x) => `my:${x.id}` === String(id));
      return m ? `${m.label} (your logo)` : 'Your saved logo';
    }
    if (isUploadSlot(id)) {
      const u = uploads.find((x) => `upload:${x.url}` === String(id));
      return u ? `${u.label} (your upload)` : 'Your upload';
    }
    const l = logos.find((x) => String(x.id) === String(id));
    return l ? l.label : 'Sponsor logo';
  };
  const logoById = useMemo(() => Object.fromEntries(logos.map((l) => [String(l.id), l])), [logos]);
  // What a sponsor logo takes off: its funded amount, or the rules'
  // fallback when the API has no amount (the quote uses the same rule).
  const sponsorAmount = (l) => discountOf(l) || currentMerchSettings().fallbackSponsorDiscountCents;
  const quoteCtx = useMemo(() => ({
    discountFor: (id) => (logoById[String(id)] ? discountOf(logoById[String(id)]) : NaN),
    sponsorOf: (id) => logoById[String(id)]?.sponsor_name || id,
    labelFor: (v) => logoLabel(v),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [logoById, discounts, uploads, club, myLogos]);
  const quote = useMemo(() => quoteMerch(product.id, effSlots, quoteCtx), [product.id, effSlots, quoteCtx]);
  // Price effect of each slot, read from the same quote lines as the total.
  const slotCents = (pos) => (quote?.lines || []).filter((l) => l.slot === pos).reduce((n, l) => n + l.cents, 0);

  const posLabel = (id) => merchPositions(product.id).find((p) => p.id === id)?.label || id;
  const activeLogoId = effSlots[activePos] || '';
  // Zoom is a share of the slot's default logo size; it can never outgrow
  // the print area (older drafts stored up to 200).
  const ZOOM_MAX = 125;
  const activeZoom = Math.min(ZOOM_MAX, Math.max(LOGO_ZOOM_MIN * 100, Number(slotZoom[activePos]) || 100));
  const activeShift = {
    x: clampShift(slotShift[activePos]?.x),
    y: clampShift(slotShift[activePos]?.y),
    r: clampSpin(slotShift[activePos]?.r),
    f: !!slotShift[activePos]?.f,
  };
  // Travel left inside the slot for the active logo (same maths as 3D).
  const lim = slotShiftLimits(product.id, activePos, {
    aspect: Number(aspects[String(activeLogoId)]) || 2, zoom: activeZoom / 100, spin: activeShift.r,
  });
  const fit = (v, m) => Math.min(m, Math.max(-m, v));
  // Print area of the active slot for the 2D editor (percent of garment
  // width, the unit slotShift is stored in) and its real size in mm.
  const activeSlot = slotSizeUnits(product.id, activePos, 100);
  const activeSpec = merchPositions(product.id).find((p) => p.id === activePos);
  const activeMm = activeSpec?.widthMm ? { w: activeSpec.widthMm, h: activeSpec.heightMm } : null;
  const nudge = (dx, dy) => patchShift(activePos, {
    x: fit(fit(activeShift.x, lim.mx) + dx, lim.mx), y: fit(fit(activeShift.y, lim.my) + dy, lim.my),
  });
  const setZoom = (z) => setSlotZoom((v) => ({ ...v, [activePos]: Math.min(ZOOM_MAX, Math.max(LOGO_ZOOM_MIN * 100, Math.round(z))) }));
  const without = (obj, key) => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
  const resetPlacement = () => {
    setSlotShift((v) => without(v, activePos));
    setSlotZoom((v) => without(v, activePos));
  };
  // Arrow keys move the selected logo (Shift = bigger steps) while the
  // preview has focus; form fields keep their own arrow behaviour.
  const onStageKey = (e) => {
    if (!activeLogoId || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const step = e.shiftKey ? 2 : 0.5;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    nudge(d[0], d[1]);
  };
  // Merge a partial logo transform (drag writes {x,y}, panel writes r/f).
  const patchShift = (pos, patch) => setSlotShift((v) => ({
    ...v,
    [pos]: {
      x: clampShift(patch.x ?? v[pos]?.x),
      y: clampShift(patch.y ?? v[pos]?.y),
      r: clampSpin(patch.r ?? v[pos]?.r),
      f: patch.f ?? v[pos]?.f ?? false,
    },
  }));
  const logoCount = Object.values(effSlots).filter(Boolean).length;
  const stageIdx = { garment: 0, branding: 1, details: 2 };
  // Photoshoot mode (?clean=1): hide every logo/decal + badge so the 3D
  // stage screenshots as a clean product photo for public/merch/*.
  const clean = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('clean') === '1';
  const recap = `${product.label} · ${colorName(color)} · ${size} · ${logoCount} logo${logoCount === 1 ? '' : 's'}`;

  return (
    <div className={s.studio}>
      <div className={s.wrap}>
        {!clean && (
          <div className={s.topbar}>
            <ol className={s.progress} aria-label="Customisation progress">
              {[
                ['garment', 'Garment', 'Choose colour and size'],
                ['branding', 'Branding', 'Add logos and artwork'],
                ['details', 'Details', 'Review and request proof'],
              ].map(([id, label, hint], i) => (
                <li key={id} className={s.pStep} data-state={tab === id ? 'active' : stageIdx[id] < stageIdx[tab] ? 'done' : 'idle'}>
                  <button type="button" onClick={() => goStage(id)} aria-current={tab === id ? 'step' : undefined}>
                    <span className={s.pN}>{stageIdx[id] < stageIdx[tab] ? '✓' : `0${i + 1}`}</span>
                    <span className={s.pLabel}>{label}<small>{hint}</small></span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
        <section className={s.previewCard} aria-label="Live 3D preview">
          <div className={`${s.stage}${isHorseProduct(product.id) ? ` ${s.stageDark}` : ''}`} ref={stageRef}
            tabIndex={0} onKeyDown={onStageKey} aria-label="3D preview. Arrow keys move the selected logo.">
            <Merch3D productId={product.id} color={color} slots={clean ? {} : effSlots} zoom={zoomFractions} shift={viewShift} onShift={patchShift} selectedPos={clean ? null : activePos} onSelectPos={selectPos} switching={false} stageRef={stageRef} clean={clean} hotspots={tab === 'branding'} onAspects={setAspects} onReady={() => setModelReady(true)} onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} />
            {!clean && activeLogoId && tab === 'branding' && (
              <div className={s.quickBar} role="toolbar" aria-label={`Quick edit: ${posLabel(activePos)}`}>
                <span className={s.quickLabel}>{posLabel(activePos)}</span>
                <button type="button" className={s.dockBtn} onClick={() => setZoom(activeZoom - 10)} disabled={activeZoom <= LOGO_ZOOM_MIN * 100} aria-label="Smaller">−</button>
                <button type="button" className={s.dockBtn} onClick={() => setZoom(activeZoom + 10)} disabled={activeZoom >= ZOOM_MAX} aria-label="Bigger">+</button>
                <button type="button" className={s.dockBtn} onClick={() => patchShift(activePos, { r: snapSpin(activeShift.r - 15) })} aria-label="Rotate left 15 degrees">⟲</button>
                <button type="button" className={s.dockBtn} onClick={() => patchShift(activePos, { r: snapSpin(activeShift.r + 15) })} aria-label="Rotate right 15 degrees">⟳</button>
                <button type="button" className={s.dockBtn} onClick={() => patchShift(activePos, { x: 0, y: 0 })} aria-label="Centre in slot">◎</button>
                {!isLocked(activePos) && (
                  <button type="button" className={s.dockBtn} onClick={() => setSlot(activePos, '')} aria-label="Remove logo">✕</button>
                )}
              </div>
            )}
            {!clean && !modelReady && (
              <div className={s.stageHint} role="note">
                <strong>Your design appears here.</strong>
                <span>Pick a slot, choose a logo, then drag it in 3D to fine-tune.</span>
              </div>
            )}
          </div>
        </section>

        {/* Right column: the inspector scrolls inside the panel and the order
            bar is its footer, so the bar never sits on top of the form. */}
        <div className={s.side} ref={sideRef}>
        <div className={s.inspector} role="group" aria-label="Customiser">
          {tab === 'branding' && (
          <>
          <div className={s.stageHead}>
            <h2 className={s.stepTitle}>Make it yours</h2>
            <p className={s.est}>Pick a slot, choose its logo, then drag it on the 3D preview to fine-tune.</p>
          </div>
          {club && (
            <p className={s.clubNote}>
              <strong>{club.name}</strong>
              {club.placeholder ? ' (placeholder club)' : ''}
              {clubSlot ? `: your club logo is on the ${posLabel(clubSlot).toLowerCase()} and included in the price.` : '.'}
            </p>
          )}
          <div className={s.step}>
            <h2 className={s.stepTitle}>Logo slots</h2>
            <ul className={s.slotList} aria-label="Logo slots">
              {merchPositions(product.id).map((pos) => {
                const v = effSlots[pos.id];
                const cents = v ? slotCents(pos.id) : pos.premiumCents;
                return (
                  <li key={pos.id}>
                    <button type="button" className={s.slotRow} aria-pressed={pos.id === activePos}
                      data-filled={v ? 'true' : 'false'} onClick={() => setActivePos(pos.id)}>
                      <span className={s.slotDot} aria-hidden="true" />
                      <span className={s.slotName}>
                        <strong>{pos.label}</strong>
                        <small>{pos.widthMm} × {pos.heightMm} mm{isLocked(pos.id) ? ' · locked' : ''}</small>
                      </span>
                      <span className={s.slotLogo}>{v ? logoLabel(v) : 'Empty'}</span>
                      <span className={s.slotPrice} data-sign={cents < 0 ? 'minus' : cents > 0 ? 'plus' : 'zero'}>
                        {v ? (isUploadSlot(v) && !cents ? 'No discount' : signed(cents)) : cents ? `+${nzd(cents)} if used` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className={s.step} aria-live="polite">
            <h2 className={s.stepTitle}>{posLabel(activePos)} <em>{activeLogoId ? logoLabel(activeLogoId) : 'empty'}</em></h2>
            {isLocked(activePos) ? (
              <p className={s.est}>This is the {club.name} logo. It stays on every item from this club store, so it cannot be removed or swapped. You can still adjust its size and position.</p>
            ) : (
            <div className={s.artGrid}>
              <div className={s.artCard} data-active={!!activeLogoId && !isUploadSlot(activeLogoId)}>
                <p className={s.artHead}><span className={s.artIcon} aria-hidden="true">★</span><span><strong>Sponsor logo</strong><small>Registered sponsors · each one lowers the price</small></span></p>
                <div className={s.chipGrid} role="group" aria-label={`Sponsor logos for ${posLabel(activePos)}`}>
                  {logos.map((l) => (
                    <button key={l.id} type="button" className={s.chip} aria-pressed={String(activeLogoId) === String(l.id)}
                      onClick={() => setSlot(activePos, l.id)}>
                      <span className={s.chipThumb}>
                        <SmartImage src={`/merch-logo/${l.id}`} alt={`${l.label} logo`} width={112} height={56}
                          unoptimized style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                      </span>
                      <span><strong>{l.label}</strong>
                        <small>−{nzd(sponsorAmount(l))}{discountOf(l) ? ' funded' : ' (estimate)'}</small></span>
                    </button>
                  ))}
                </div>
                {!logos.length && (
                  <p className={s.est}>No registered sponsors are funding a discount yet. The list fills in automatically once a sponsor goes live.</p>
                )}
              </div>
              <div className={s.artCard} data-active={!!activeLogoId && isUploadSlot(activeLogoId)}>
                <p className={s.artHead}><span className={s.artIcon} aria-hidden="true">↑</span><span><strong>Your own logo</strong><small>{myLogos
                  ? 'Saved to your account, also usable on photos · PNG or JPEG up to 2 MB · no discount'
                  : 'PNG or JPEG up to 10 MB · no discount · log in to keep it for photos too'}</small></span></p>
                <div className={s.uploadRow}>
                  <input ref={uploadRef} type="file" accept="image/png,image/jpeg" multiple hidden
                    onChange={(e) => { handleUploadFiles(e.target.files); e.target.value = ''; }}
                    aria-label={`Upload your logo, PNG or JPEG up to ${myLogos ? 2 : 10} MB`} />
                  <button type="button" className={s.viewBtn} disabled={myBusy} onClick={() => uploadRef.current?.click()}>
                    {myBusy ? 'Saving…' : '+ Upload logo'}
                  </button>
                  {uploads.length > 0 && (
                    <button type="button" className={s.linkBtn} onClick={clearUploads}>
                      Clear my uploads ({uploads.length})
                    </button>
                  )}
                </div>
                {uploadErr && <p className={s.err} role="alert">{uploadErr}</p>}
                {(myLogos || []).map((l) => (
                  <div key={l.id} className={s.savedRow}>
                    <button type="button" className={s.chip} aria-pressed={activeLogoId === `my:${l.id}`}
                      onClick={() => setSlot(activePos, `my:${l.id}`)}>
                      <span className={s.chipThumb}>
                        <SmartImage src={`/merch-logo/${l.id}`} alt={`${l.label} logo`} width={112} height={56}
                          unoptimized style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                      </span>
                      <span><strong>{l.label}</strong><small>saved · no discount</small></span>
                    </button>
                    <button type="button" className={s.savedDel} disabled={delBusy === l.id}
                      data-confirm={delAsk === l.id || undefined}
                      onClick={() => (delAsk === l.id ? deleteMyLogo(l) : setDelAsk(l.id))}
                      onBlur={() => setDelAsk((v) => (v === l.id ? '' : v))}
                      aria-label={delAsk === l.id ? `Confirm: delete ${l.label} from your account` : `Delete ${l.label} from your account`}>
                      {delBusy === l.id ? 'Deleting…' : delAsk === l.id ? 'Delete?' : 'Delete'}
                    </button>
                  </div>
                ))}
                {myLogos?.length > 0 && <p className={s.est}>Deleting removes the logo from your account (photos too). Orders already sent keep it.</p>}
                {uploads.map((u) => (
                  <button key={u.key} type="button" className={s.chip} aria-pressed={activeLogoId === `upload:${u.url}`}
                    onClick={() => setSlot(activePos, `upload:${u.url}`)}>
                    <span className={s.chipThumb}>
                      <SmartImage src={u.url} alt={`${u.label} logo`} width={112} height={56}
                        unoptimized style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                    </span>
                    <span><strong>{u.label}</strong><small>yours · no discount</small></span>
                  </button>
                ))}
              </div>
            </div>
            )}
            {activeLogoId && !isLocked(activePos) && (
              <button type="button" className={s.removeBtn} onClick={() => setSlot(activePos, '')}>
                Remove logo from {posLabel(activePos).toLowerCase()}
              </button>
            )}
            {activeLogoId && nextEmptyPos && (
              <p className={s.est}>
                Next free slot:{' '}
                <button type="button" className={s.linkBtn} onClick={() => setActivePos(nextEmptyPos)}>
                  {posLabel(nextEmptyPos)} →
                </button>
              </p>
            )}
          </div>
          {activeLogoId && (
          <div className={s.step}>
            <h2 className={s.stepTitle}>Adjust <em>drag the logo, the corner resizes, the dot rotates</em></h2>
            {activeSlot && activeMm && (
              <SlotEditor
                key={`${product.id}:${activePos}`}
                label={posLabel(activePos)}
                slot={activeSlot}
                mm={activeMm}
                logoSrc={LOGO_URL(activeLogoId)}
                aspect={Number(aspects[String(activeLogoId)]) || 2}
                zoom={activeZoom / 100}
                maxZoom={Math.min(ZOOM_MAX / 100, lim.maxZoom)}
                shift={activeShift}
                onPreview={(v) => setPreview({ pos: activePos, ...v })}
                onCommit={(v) => { patchShift(activePos, v); setPreview(null); }}
                onZoom={(z) => { setZoom(z * 100); setPreview(null); }}
              />
            )}
            <div className={s.adjBtns}>
              <button type="button" className={s.viewBtn} onClick={() => patchShift(activePos, { x: 0, y: 0 })}>Centre</button>
              <button type="button" className={s.viewBtn} aria-pressed={activeShift.f}
                onClick={() => patchShift(activePos, { f: !activeShift.f })}>
                {activeShift.f ? 'Mirrored' : 'Mirror'}
              </button>
              <button type="button" className={s.viewBtn} onClick={resetPlacement}>Reset</button>
            </div>
            <details className={`${s.sizeGuide} ${s.exact}`}>
              <summary>Exact values</summary>
            <label className={s.zoomRow}>
              <span>Size <strong>{activeZoom}%</strong></span>
              <input type="range" min={LOGO_ZOOM_MIN * 100} max={ZOOM_MAX} step={5} value={activeZoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label={`Logo size for ${posLabel(activePos)}`} />
            </label>
            <div className={s.adjGrid}>
              <label className={s.zoomRow}>Left / right
                <input type="range" min={-lim.mx} max={lim.mx} step={0.1} value={fit(activeShift.x, lim.mx)} disabled={lim.mx < 0.05}
                  onChange={(e) => patchShift(activePos, { x: Number(e.target.value) })}
                  aria-label={`Move logo horizontally for ${posLabel(activePos)}`} />
              </label>
              <label className={s.zoomRow}>Up / down
                <input type="range" min={-lim.my} max={lim.my} step={0.1} value={fit(activeShift.y, lim.my)} disabled={lim.my < 0.05}
                  onChange={(e) => patchShift(activePos, { y: Number(e.target.value) })}
                  aria-label={`Move logo vertically for ${posLabel(activePos)}`} />
              </label>
              <label className={s.zoomRow}>Rotate <strong>{activeShift.r}°</strong>
                <input type="range" min={-180} max={180} step={1} value={activeShift.r}
                  onChange={(e) => patchShift(activePos, { r: snapSpin(e.target.value) })}
                  aria-label={`Rotate logo for ${posLabel(activePos)}`} />
              </label>
            </div>
            </details>
          </div>
          )}
          <div className={s.step} aria-live="polite">
            <h2 className={s.stepTitle}>Price</h2>
            <PriceLines quote={quote} />
          </div>
          </>)}
          {tab === 'garment' && (
          <>
          <div className={s.stageHead}>
            <h2 className={s.stepTitle}>Choose your garment</h2>
            <p className={s.est}>Select your preferred colour and size.</p>
          </div>
          <div className={s.infoCard}>
            <div><strong>{product.label}</strong><small>{product.blurb}</small></div>
            <p className={s.est}>Logo placements: {merchPositions(product.id).map((p) => p.short).join(' · ')}</p>
          </div>
          <div className={s.stepCols}>
            <div className={s.step}>
              <h2 className={s.stepTitle}>Colour <em>— {colorName(color)}</em></h2>
              <div className={s.pickGrid} role="group" aria-label="Colour">
                {product.colors.map((c) => (
                  <button key={c} type="button" className={s.swatch} aria-pressed={color === c}
                    aria-label={`Colour ${colorName(c)}`} title={colorName(c)}
                    style={{ backgroundColor: c }} onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
            <div className={s.step}>
              <h2 className={s.stepTitle}>Size</h2>
              <div className={s.pickGrid} role="group" aria-label="Size">
                {product.sizes.map((z) => (
                  <button key={z} type="button" className={s.sizeBtn} aria-pressed={size === z}
                    onClick={() => setSize(z)}>{z}</button>
                ))}
              </div>
              <details className={s.sizeGuide}>
                <summary>Size guide</summary>
                <p className={s.est}>Tops follow standard alpha sizing — between sizes, size up for a relaxed team fit. Horse sizes (Pony · Cob · Full) follow the maker&apos;s chart; add fit notes in Details and the artwork proof confirms everything before production.</p>
                <p className={s.est}><Link href="/faq">Delivery &amp; returns →</Link></p>
              </details>
            </div>
          </div>
          </>)}
          {tab === 'details' && (
          <>
          <div className={s.stageHead}>
            <h2 className={s.stepTitle}>Review your design</h2>
            <p className={s.est}>Check everything, add notes, then request the artwork proof.</p>
          </div>
          <div className={s.step}>
            <h2 className={s.stepTitle}>Design summary</h2>
            <div className={s.priceBox}>
              <div className={s.row}><span>Product</span><span>{product.label}</span></div>
              <div className={s.row}><span>Colour</span><span>{colorName(color)}</span></div>
              <div className={s.row}><span>Size</span><span>{size}</span></div>
              {merchPositions(product.id).filter((p) => effSlots[p.id]).map((p) => (
                <div className={s.row} key={p.id}><span>{p.label}</span><span>{logoLabel(effSlots[p.id])}</span></div>
              ))}
              {!logoCount && <div className={s.row}><span>Branding</span><span>No logos yet</span></div>}
            </div>
            <label className={s.zoomRow}><span>Additional production notes</span>
              <textarea className={s.notes} value={notes} rows={3} maxLength={500}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                placeholder="Anything the maker should know — placement tweaks, deadlines…"
                aria-label="Additional production notes" />
            </label>
          </div>

          <div className={s.step} aria-live="polite">
            <h2 className={s.stepTitle}>Price per item</h2>
            <PriceLines quote={quote} />
          </div>
          <div className={s.step} id="merch-proof">
            <h2 className={s.stepTitle}>Order request <em>pay after you approve the proof</em></h2>
            <p className={s.est}>We check your artwork, then email a proof with exact size and placement. Payment opens once you approve it. Your design is saved on this device: {recap}.</p>
            <MerchOrderForm product={product} color={color} size={size} slots={effSlots} slotZoom={slotZoom}
              slotShift={slotShift} notes={notes} uploads={uploads} quoteCtx={quoteCtx} clubName={club?.name || ''}
              onState={setOrder} />
          </div>
          </>)}
          </div>
        <div className={s.orderBar} role="region" aria-label="Order summary">
          <div className={s.orderThumb}>
            <ProductPhoto productId={product.id} view={heroView(product.id)} alt={`${product.label} preview`}
              group={groupOf(product.id)} product={product.id} color={color} />
          </div>
          <div className={s.orderMeta}><strong>{product.label}</strong><small>{colorName(color)} · {size}</small></div>
          <div className={s.orderTotal}>
            <span>{tab === 'details' && order.totalCents != null ? 'Order total' : 'Estimated total'}</span>
            <strong>{nzd(tab === 'details' && order.totalCents != null ? order.totalCents : quote?.totalCents)}</strong>
            <small>{tab === 'details' ? 'Pay after proof approval'
              : quote?.discountCents ? `Sponsors save you ${nzd(quote.discountCents)}` : 'Add a sponsor logo to lower the price'}</small>
          </div>
          <div className={s.orderCta}>
            {tab !== 'garment' && (
              <button type="button" className={s.backBtn}
                onClick={() => goStage(tab === 'branding' ? 'garment' : 'branding')}
                aria-label={tab === 'branding' ? 'Back to Garment' : 'Back to Branding'}>
                <span aria-hidden="true">←</span><span className={s.backText}>Back</span>
              </button>
            )}
            <button type="button" className={s.cta} onClick={primaryAction || undefined} disabled={!primaryAction}
              aria-disabled={!primaryAction}>{primaryLabel}</button>
          </div>
        </div>
        </div>
        </div>
      </div>
  );
}
