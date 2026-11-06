'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { API } from '../lib/api';
import { addToCart, useCart } from '../lib/cart';
import { toggleFavourite, useIsFavourite } from '../lib/favourites';
import { checkoutBase, newIdempotencyKey, nzd, stripeCheckoutUrl } from '../lib/figma-data';
import { useAuthed } from '../lib/use-authed';
import SmartImage from './SmartImage';
import LogoModal from './LogoModal';
import SponsorPhoto, { isVariant, isTheme, loadDesign, templateOf, variantGroup, variantNeedsClass, variantShort } from './SponsorTemplates';
import FollowButton from './FollowButton';
import { safeError } from '../lib/errors';
import { isValidEmail, normalizeEmail } from '../lib/validation.mjs';
import { Icon } from './figma';
import { useToast } from './Toaster';
import ReelPlayer from './ReelPlayer';

// Honest per-tier subline when the DB has no custom description. Never
// promises "full resolution" for small/medium renditions.
function licenseSubline(t) {
  const res = String(t?.max_resolution || '').toLowerCase();
  const isOriginal = !res || res.includes('original');
  if (isOriginal) return t?.printable === false ? 'Original file · best quality' : 'Original file · best quality · print-ready';
  const size = t?.max_resolution || 'Digital file';
  return t?.printable ? `${size} · print-ready` : `${size} · for screen & sharing`;
}

function SaveLine({ value }) {
  if (!value) return null;
  return (
    <p style={{ color: '#8fd694', fontSize: 12 }}>
      <s style={{ color: '#777' }}>{nzd(value.singles)} singles</s>
      {' '}· save {nzd(value.save)} ({value.pct}%)
    </p>
  );
}

export default function MediaPurchase({ media, eventName, eventSlug, backHref, backLabel }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [tiers, setTiers] = useState([]);
  const [tiersReady, setTiersReady] = useState(false); // license-tiers fetch settled (success or fail)
  const [tierId, setTierId] = useState(media.license_default || null);
  const [bundle, setBundle] = useState(null); // rider/horse x event package
  const [creditPack, setCreditPack] = useState(null); // N-photo credit bundle
  const [logos, setLogos] = useState([]); // active sponsor logos for Option 1
  const [logoIds, setLogoIds] = useState([]);
  const [logoPos, setLogoPos] = useState({}); // {logoId: 'bottom-left'|...}
  const [logoTemplate, setLogoTemplate] = useState('banner-wave');
  const [logoTheme, setLogoTheme] = useState('light'); // strip light|dark (di-bake server)
  const [logoRestored, setLogoRestored] = useState(false);
  // Desain yang tampil di foto utama = yang terakhir di-Save di modal saja.
  // Browsing template / centang logo tidak mengubah foto sampai Save.
  const [applied, setApplied] = useState(null); // {template, logoIds, theme} | null
  const isWinMoment = (media.moment || '') === 'win';
  const hasClass = !!media.class_name;
  const templateVisible = (t) => isVariant(t)
    && (variantGroup(t) !== 'Winner' || isWinMoment)
    && (!variantNeedsClass(t) || hasClass);
  // Save di modal dikembalikan ke sini sekali, saat daftar logo tiba.
  useEffect(() => {
    if (logoRestored || !logos.length) return;
    const saved = loadDesign(media.id);
    if (!saved) { setLogoRestored(true); return; }
    const ids = saved.logoIds.filter((id) => logos.some((l) => String(l.id) === String(id))).slice(0, 1);
    if (isVariant(saved.template)) setLogoTemplate(saved.template);
    if (isTheme(saved.theme)) setLogoTheme(saved.theme);
    if (ids.length) {
      setLogoIds(ids);
      setLogoPos(saved.logoPos || {});
      setApplied({ template: saved.template, logoIds: ids, theme: isTheme(saved.theme) ? saved.theme : 'light' });
    }
    setLogoRestored(true);
  }, [logos, logoRestored, media.id]);
  // Overlay tampil hanya jika desain Save masih cocok dengan logo terpilih
  // DAN masih terlihat di carousel (momen/kelas bisa berubah).
  // Batal centang / tutup tanpa Save → foto kembali asli.
  const appliedLive = applied && applied.logoIds.length
    && applied.logoIds.every((id) => logoIds.includes(id))
    && templateVisible(applied.template) ? applied : null;
  const pickedLogo = logos.find((l) => String(l.id) === String(logoIds[0]));
  const [logoOpen, setLogoOpen] = useState(false);
  const setPos = (id, pos) => setLogoPos((v) => ({ ...v, [id]: pos }));
  const posOf = (id, i) => logoPos[id] || ['bottom-left', 'bottom-right', 'top-right'][i % 3];
  const [discounts, setDiscounts] = useState([]); // sponsor budgets for Option 2
  // The discount is automatic: picking a logo opts in, and the best funded
  // budget among the chosen logos' sponsors applies (server decides).
  const discountFor = (logoId) => {
    const logo = logos.find((l) => String(l.id) === String(logoId));
    if (!logo) return null;
    const cands = discounts.filter((d) => d.sponsor_name === logo.sponsor_name);
    return cands.length ? cands.reduce((a, b) => (Number(b.discount_cents) > Number(a.discount_cents) ? b : a)) : null;
  };
  const discount = logoIds.map(discountFor).filter(Boolean)
    .reduce((a, b) => (Number(b.discount_cents) > Number(a?.discount_cents || 0) ? b : a), null);
  // Satu logo per foto. Klik logo = pilih + langsung buka modal desain
  // (1 klik). Batal via Remove — foto & diskon kembali seperti semula.
  // The server bakes the real file at download.
  const selectAndOpen = (id) => {
    if (!logoIds.includes(id)) setLogoIds([id]);
    setAdded(false);
    setLogoOpen(true);
  };
  const removeLogo = () => {
    setLogoIds([]);
    setAdded(false);
  };
  const [owned, setOwned] = useState(null); // {owned, owned_tier, versions[], viaPackage} | {credit:{slots_left}} | null
  const versions = Array.isArray(owned?.versions) ? owned.versions : [];
  const plainVersions = versions.filter((v) => !(v.logos?.length));
  const designVersions = versions.filter((v) => v.logos?.length);
  const ownsPlain = plainVersions.length > 0 || !!owned?.viaPackage || owned?.owned_tier === 'credit';
  // Draft identical to an owned design → buying again would 409; say so upfront.
  // Exact variant match only: every winner variant is its own design, and
  // legacy rows (no stored variant) never block an exact draft.
  const draftOwnedVersion = logoIds.length && isVariant(logoTemplate) ? versions.find((v) =>
    (v.logos?.length || 0) === logoIds.length
    && v.logo_variant === logoTemplate
    && (v.logos || []).map((l) => String(l.id)).sort().join() === logoIds.map(String).sort().join()
  ) : null;
  const ownedDesigns = designVersions.map((v) => ({
    variant: v.logo_variant, template: v.logo_template, theme: v.logo_theme,
    logoIds: (v.logos || []).map((l) => l.id),
  }));
  // Backend template id → canonical frontend variant for legacy rows that
  // predate logo_variant. New rows carry the exact variant already.
  const INVERSE_TEMPLATES = { banner: 'banner-wave', corner: 'corner-badge', top: 'top-banner', minimal: 'minimal-corner', winner: 'winner-banner', bottombar: 'square-bar' };
  // Owned design matching the current draft → hero shows it (opt-in only:
  // nothing is pre-selected on load, so no silent discount opt-in).
  const heroOwnedVariant = draftOwnedVersion
    ? (isVariant(draftOwnedVersion.logo_variant) ? draftOwnedVersion.logo_variant : INVERSE_TEMPLATES[draftOwnedVersion.logo_template])
    : null;
  const heroOwned = draftOwnedVersion && heroOwnedVariant ? { ...draftOwnedVersion, variant: heroOwnedVariant } : null;
  // A restored draft (localStorage) that turns out to be already owned is
  // silently dropped once ownership data arrives — the red note only ever
  // fires for a design the buyer picks themselves in this session.
  const [draftClearedFor, setDraftClearedFor] = useState(null);
  useEffect(() => {
    if (draftClearedFor !== media.id && versions.length > 0 && logoIds.length > 0 && draftOwnedVersion) {
      setLogoIds([]);
      setApplied(null);
      setDraftClearedFor(media.id);
    }
  }, [versions, logoIds, draftOwnedVersion, draftClearedFor, media.id]);
  const [unlocking, setUnlocking] = useState(false);
  const { user: meUser } = useAuthed();
  const meEmail = meUser?.email || null;
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [added, setAdded] = useState(false);
  const [nav, setNav] = useState(null); // { prev, next, index, total }
  useEffect(() => {
    setNav(null);
    fetch(`${API}/photos/${media.id}/neighbors`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.data?.total > 1) setNav(j.data); })
      .catch(() => {});
  }, [media.id]);
  const goId = (id) => {
    if (!id) return;
    if (eventSlug && (pathname || '').includes('/events/')) router.push(`/events/${eventSlug}/media/${id}`);
    else router.push(`/p/${id}`);
  };
  // Guests buy with just an email — receipt + download access go there.
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (meEmail && !email) setEmail(meEmail);
  }, [meEmail, email]);
  const checkoutEmail = () => {
    const em = normalizeEmail(email || meEmail || '');
    if (!isValidEmail(em)) {
      setErr(meEmail ? 'Enter your email to receive the receipt.' : 'Enter your email — no account needed. Receipt and download access go there.');
      return null;
    }
    return em;
  };

  const isReel = media.kind === 'reel';
  const rider = media.rider || media.other_people || 'Unknown rider';
  const horse = media.horse || (media.rider || media.other_people ? '' : 'Unknown horse');
  const subject = [horse, rider].filter(Boolean).join(' × ');

  useEffect(() => {
    fetch(`${API}/api/license-tiers?kind=${media.kind === 'reel' ? 'reel' : 'photo'}`)
      .then((r) => r.json())
      .then((j) => {
        const list = j.data || [];
        setTiers(list);
        if (!tierId && list.length) setTierId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setTiersReady(true));
    // Bundles for this photo's scope: whole rider/horse x event, + credit pack.
    const scope = media.rider_id ? `rider_id=${media.rider_id}` : media.horse_id ? `horse_id=${media.horse_id}` : null;
    if (!isReel && media.event_id && scope) {
      fetch(`${API}/photos/packages?event_id=${media.event_id}&${scope}`)
        .then((r) => r.json())
        .then((j) => {
          const b = (j.data || [])[0];
          if (b && b.items > 1) setBundle(b);
        })
        .catch(() => {});
      fetch(`${API}/api/credit-packs?event_id=${media.event_id}&${scope}`)
        .then((r) => r.json())
        .then((j) => { if ((j.data || []).length) setCreditPack(j.data[0]); })
        .catch(() => {});
    }
    // Sponsor logos (single photos only — baked at download). Scoped to the
    // photo's event like the discounts below, so a shown logo always funds
    // this photo's discount; the server hides the rest.
    if (!isReel) {
      const dq = media.event_id ? `?event_id=${media.event_id}` : '';
      fetch(`${API}/api/sponsor-logos${dq}`)
        .then((r) => r.json())
        .then((j) => setLogos(j?.data || []))
        .catch(() => {});
      fetch(`${API}/api/sponsor-discounts${dq}`)
        .then((r) => r.json())
        .then((j) => setDiscounts(j?.data || []))
        .catch(() => {});
    }
  }, [media.id]);

  const tier = tiers.find((t) => String(t.id) === String(tierId)) || tiers[0];
  const grossCents = Number(tier?.price_cents) || 0;
  const discCents = discount && !isReel ? Math.min(Number(discount.discount_cents) || 0, Math.max(0, grossCents - 1)) : 0;
  const price = tier ? nzd(Math.max(0, grossCents - discCents)) : (isReel ? 'NZ$55' : 'NZ$35');
  // Before the tiers fetch settles, tier is undefined and price is a guess —
  // show a neutral loading state instead of flashing the wrong number.
  const priceLabel = tiersReady ? price : 'Loading…';
  const [cartList] = useCart();
  // Still in cart after navigating back: local `added` resets on remount,
  // cart membership does not. Matched on media + selected tier.
  const inCart = tier
    ? cartList.some((x) => x.mediaId === media.id && String(x.tierId) === String(tier.id)
        && (logoIds.length
          ? x.logoTemplate === logoTemplate && (x.logoIds || []).map(String).sort().join() === logoIds.map(String).sort().join()
          : !(x.logoIds?.length)))
    : cartList.some((x) => x.mediaId === media.id);
  const showAdded = added || inCart;
  // Bundle savings vs buying the same photos one by one at this license.
  // Null when there is no saving to brag about.
  const savingsFor = (items, priceCents) => {
    const single = Number(tier?.price_cents) || 0;
    const n = Number(items) || 0;
    const bundlePrice = Number(priceCents);
    if (!single || !n || !bundlePrice) return null;
    const singles = single * n;
    const save = singles - bundlePrice;
    if (save <= 0) return null;
    return { singles, save, pct: Math.round((save / singles) * 100) };
  };
  const scopeIds = media.rider_id ? { rider_id: media.rider_id } : media.horse_id ? { horse_id: media.horse_id } : null;
  const subjectName = media.rider || media.horse || '';

  const newKey = newIdempotencyKey;
  async function checkoutPost(path, body, cancelPath) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...checkoutBase(), ...(cancelPath ? { cancel_path: cancelPath } : {}), ...body, email: body.email || meEmail, idempotency_key: newKey() }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.data?.owned) { fetchOwned(); return null; }
    if (res.status === 409 && j.owned) { fetchOwned(); throw new Error(j.error || 'You already own this.'); }
    if (!res.ok) throw new Error(j.error || 'Checkout failed — try again.');
    if (j.data?.paid && j.data?.purchase_id) { router.push(`/photos/success?purchase=${j.data.purchase_id}`); return j.data; }
    if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email for the payment link.');
    window.location.assign(stripeCheckoutUrl(j.data));
    return j.data;
  }

  // Ownership + 5-pack credit hint for the logged-in buyer (mirrors EQIndex).
  // owned_versions drives the per-version UI (downloads + still-buyable).
  function fetchOwned() {
    fetch(`${API}/photos/${media.id}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data?.owned) setOwned({
          owned: true, owned_tier: j.data.owned_tier,
          versions: Array.isArray(j.data.owned_versions) ? j.data.owned_versions : [],
          viaPackage: !!j.data.owned_via_package,
        });
        else if (Number(j?.data?.credit?.slots_left) > 0) setOwned({ credit: j.data.credit });
      })
      .catch(() => {});
  }
  useEffect(() => {
    fetchOwned();
    if (meUser) {
      fetch(`${API}/api/my/wallet`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((w) => setBalance(Number(w?.data?.balance_cents) || 0))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id, meUser]);

  // Buying requires an account (backend 401s otherwise). Receipt goes to
  // the account email, downloads live in My media.

  async function unlock() {
    if (unlocking) return;
    setUnlocking(true); setErr('');
    try {
      // Same logo params as paid checkout (sponsor_logo_*): a credit unlock
      // bakes the picked design but pays no money, so no sponsor discount.
      const res = await fetch(`${API}/api/credits/unlock`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: media.id, ...(logoIds.length && !isReel ? { sponsor_logo_ids: logoIds, sponsor_logo_positions: Object.fromEntries(logoIds.map((id, i) => [id, posOf(id, i)])), sponsor_logo_template: templateOf(logoTemplate), sponsor_logo_variant: logoTemplate, sponsor_logo_theme: logoTheme } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Unlock failed — try again.');
      setOwned({ owned: true, owned_tier: 'credit' });
    } catch (e) { setErr(e.message); }
    setUnlocking(false);
  }

  async function buyNow(tierOverride) {
    const t = tierOverride || tier;
    if (!t) { setErr('Licensing is unavailable right now — try again shortly.'); return; }
    const em = checkoutEmail();
    if (!em) return;
    if (logoIds.length && !isReel && draftOwnedVersion) {
      setErr('Already yours — download it from My photos.');
      return;
    }
    setBusy(true); setErr('');
    try {
      const gross = Number(t.price_cents) || 0;
      const use_balance_cents = meEmail ? Math.min(balance, gross) : 0;
      await checkoutPost('/api/checkout', { media_id: media.id, license_tier: t.id, email: em, ...(use_balance_cents ? { use_balance_cents } : {}), ...(logoIds.length && !isReel ? { sponsor_logo_ids: logoIds, sponsor_logo_positions: Object.fromEntries(logoIds.map((id, i) => [id, posOf(id, i)])), sponsor_logo_template: templateOf(logoTemplate), sponsor_logo_variant: logoTemplate, sponsor_logo_theme: logoTheme } : {}) }, backHref);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function buyBundle() {
    if (!bundle) return;
    const em = checkoutEmail();
    if (!em) return;
    setBusy(true); setErr('');
    try {
      // Real rows check out by id; virtual rows materialize server-side.
      const body = bundle.virtual
        ? { whole_event: true, event_id: media.event_id, ...scopeIds }
        : { package_id: bundle.id };
      const gross = Number(bundle.price_cents) || 0;
      const use_balance_cents = meEmail ? Math.min(balance, gross) : 0;
      await checkoutPost('/api/checkout', { ...body, email: em, ...(use_balance_cents ? { use_balance_cents } : {}) }, backHref);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function buyCredits() {
    if (!creditPack) return;
    const em = checkoutEmail();
    if (!em) return;
    setBusy(true); setErr('');
    try {
      await checkoutPost('/api/credit-orders', { pack_id: creditPack.id, event_id: media.event_id, ...scopeIds, email: em });
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  function addItem(t) {
    const withLogos = logoIds.length && !isReel ? logoIds : [];
    if (withLogos.length && draftOwnedVersion) {
      setErr('Already yours — download it from My photos.');
      return;
    }
    // Cart stores the undiscounted tier price — the sponsor discount is
    // resolved server-side at checkout from the chosen logos.
    // href lets the cart link back to this exact product page.
    const href = eventSlug && (pathname || '').includes('/events/')
      ? `/events/${eventSlug}/media/${media.id}` : `/p/${media.id}`;
    addToCart({
      key: `media:${media.id}:${t.id}${withLogos.length ? `:logos:${withLogos.slice().sort().join(',')}:${logoTemplate}` : ''}`,
      kind: 'media',
      href,
      image: media.thumb_url || media.preview_url,
      type: `${isReel ? 'Reel' : 'Photo'} license`,
      name: subject,
      detail: `${eventName} · ${t.label}${withLogos.length ? ` · ${withLogos.length} sponsor logo${withLogos.length > 1 ? 's' : ''}` : ''}`,
      priceCents: t.price_cents,
      mediaId: media.id,
      tierId: t.id,
      tierLabel: t.label,
      ...(withLogos.length ? { logoIds: withLogos, logoPos: Object.fromEntries(withLogos.map((id) => [id, posOf(id, logoIds.indexOf(id))])), logoTemplate, logoTheme } : {}),
    });
    setAdded(true);
    toast('Added to cart', { action: { label: 'View cart', href: '/cart' } });
  }

  const saved = useIsFavourite(media.id);
  async function saveFavourite() {
    // Members only — guests log in first, then land back here.
    try {
      const r = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (!r.ok) throw new Error('login required');
    } catch {
      router.push(`/login?next=${encodeURIComponent(pathname || `/p/${media.id}`)}`);
      return;
    }
    if (toggleFavourite(media.id)) {
      toast('Saved to favourites', { action: { label: 'View', href: '/favourites' } });
    } else {
      toast('Removed from favourites', { type: 'info' });
    }
  }

  return (
    <main className="media-purchase section-gutter">
      <div className="media-purchase-breadcrumb">
        <Link href="/events">Event galleries</Link>
        {eventSlug && <><span>/</span><Link href={`/events/${eventSlug}`}>{eventName}</Link></>}
      </div>
      <div className="media-purchase-title">
        <div>
          <p className="eyebrow">{isReel ? 'Reel' : 'Photo'}{media.class_name ? ` · ${media.class_name}` : ''}</p>
          <h1>{subject}</h1>
          <p>{eventName}</p>
        </div>
        <Link href={backHref} aria-label={`${backLabel} — back to ${eventName}`}><span aria-hidden="true">←</span> {backLabel}</Link>
      </div>
      {nav && (
        <nav className="media-neighbors" aria-label="Browse this event's photos">
          <button type="button" disabled={!nav.prev} onClick={() => goId(nav.prev)} aria-label="Previous photo">← Prev</button>
          <span>{nav.index + 1} of {nav.total}</span>
          <button type="button" disabled={!nav.next} onClick={() => goId(nav.next)} aria-label="Next photo">Next →</button>
        </nav>
      )}
      <div className="media-purchase-layout">
        <div className="media-preview-column">
          <figure className="purchase-preview">
            {isReel ? (
              <span className="rp-wrap"><ReelPlayer src={media.preview_url} poster={media.thumb_url || undefined}
                label={`${subject} reel`} autoPlay /></span>
            ) : appliedLive && !versions.length ? (
              // Draft design preview — only while nothing is owned yet, so a
              // bought photo never masquerades as an unbought design.
              <SponsorPhoto photo={media.preview_url || media.thumb_url} alt={subject}
                variant={appliedLive.template} ratio={null} theme={appliedLive.theme || 'light'}
                frameStyle={{ height: 'min(68vh, 720px)', width: 'auto', maxWidth: '100%' }}
                sponsors={appliedLive.logoIds.map((id) => {
                  const l = logos.find((x) => String(x.id) === String(id));
                  return { id, label: l?.label, src: `${API}/api/sponsor-logos/${id}/file` };
                })}
                positions={Object.fromEntries(appliedLive.logoIds.map((id, i) => [id, posOf(id, i)]))}
                event={eventName} className={media.class_name} subject={subject} />
            ) : heroOwned ? (
              // Owned design matching the draft — the owner verifies what
              // they own instead of reading an id like `banner`.
              <SponsorPhoto photo={media.preview_url || media.thumb_url} alt={subject}
                variant={heroOwned.variant} ratio={null} theme={heroOwned.logo_theme || 'light'}
                frameStyle={{ height: 'min(68vh, 720px)', width: 'auto', maxWidth: '100%' }}
                sponsors={(heroOwned.logos || []).map((l) => ({ id: l.id, label: l.label, src: `${API}/api/sponsor-logos/${l.id}/file` }))}
                positions={Object.fromEntries((heroOwned.logos || []).map((l) => [l.id, l.position || 'bottom-left']))}
                event={eventName} className={media.class_name} subject={subject} />
            ) : (
              <SmartImage src={media.preview_url || media.thumb_url} alt={subject} width={1200} height={800} priority />
            )}
            <figcaption style={{
              background: 'linear-gradient(transparent, rgba(0,0,0,.55))',
              padding: '34px 17px 13px', left: 0, right: 0, bottom: 0,
              ...(logoIds.length && !isReel ? { display: 'none' } : null),
            }}>
              <span>Boss Media preview</span>
              {media.photographer ? <span>© {media.photographer}</span> : <span>Watermarked preview</span>}
            </figcaption>
            {heroOwned && (
              <span style={{ position: 'absolute', top: 12, left: 12, zIndex: 3, padding: '6px 10px', background: 'rgba(0,0,0,.65)', border: '1px solid rgba(255,255,255,.35)', color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>Your design</span>
            )}
            {!isReel && logoIds.length > 0 && !appliedLive && (
              <button type="button" onClick={() => setLogoOpen(true)}
                aria-label="Finish your sponsor design — open the design modal"
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3, display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 17px',
                  background: 'rgba(0,0,0,.62)', border: 0, borderTop: '1px dashed rgba(255,255,255,.45)',
                  color: '#fff', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                <span>Your {pickedLogo?.label || 'sponsor'} bar will appear here</span>
                <span style={{ borderBottom: '1px solid #fff', fontWeight: 700, whiteSpace: 'nowrap' }}>Design & preview →</span>
              </button>
            )}
          </figure>
          <div className="purchase-preview-notes">
            <p>Watermarked preview — yours comes clean.</p>
            <div>
              <button type="button" onClick={saveFavourite} className={`mini-icon-btn${saved ? ' on' : ''}`}
                title={saved ? 'Saved — click to remove' : 'Save to favourites'} aria-label={saved ? 'Remove from favourites' : 'Save to favourites'} aria-pressed={saved}>
                <Icon name={saved ? 'heart-fill' : 'heart'} size={17} />
              </button>
              {media.rider_id && <FollowButton kind="rider" id={media.rider_id} name={media.rider} icon />}
              <Link href="/contact">Need help? Contact us</Link>
            </div>
          </div>
        </div>
        <aside className="purchase-panel">
          <section className="license-panel">
            <h2 className="purchase-label">Choose your license</h2>
            {versions.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <p className="purchase-label">You own{versions.length > 1 ? ` ${versions.length} versions` : ''}</p>
                {plainVersions.map((v) => (
                  <div key={v.purchase_id}>
                    <div className="license-option selected">
                      <div><strong>✓ Yours{v.license_tier ? ` · ${v.license_tier}` : ''}</strong><span>Full resolution unlocked — re-download any time.</span></div>
                    </div>
                    <a href={`${API}/api/media/${media.id}/download?purchase=${v.purchase_id}`} className="st-btn" style={{ width: '100%', textDecoration: 'none', marginTop: 12 }}>Download full file</a>
                  </div>
                ))}
                {designVersions.map((v) => (
                  <div key={v.purchase_id} style={{ marginTop: plainVersions.length ? 16 : 0 }}>
                    {isVariant(v.logo_variant) ? (
                      <SponsorPhoto photo={media.preview_url || media.thumb_url} alt={subject}
                        variant={v.logo_variant} ratio="16 / 10" theme={v.logo_theme || 'light'}
                        sponsors={(v.logos || []).map((l) => ({ id: l.id, label: l.label, src: `${API}/api/sponsor-logos/${l.id}/file` }))}
                        positions={Object.fromEntries((v.logos || []).map((l) => [l.id, l.position || 'bottom-left']))}
                        event={eventName} className={media.class_name} subject={subject} />
                    ) : (
                      <div className="license-option selected">
                        <div><strong>✓ Your sponsor design</strong><span>Baked into your download.</span></div>
                      </div>
                    )}
                    <a href={`${API}/api/media/${media.id}/download?purchase=${v.purchase_id}`} className="st-btn-ghost" style={{ width: '100%', textDecoration: 'none', marginTop: 12, textAlign: 'center' }}>Download design</a>
                  </div>
                ))}
                <small>Lifetime re-downloads, always in full resolution.</small>
              </div>
            )}
            {owned?.owned && !versions.length && (
              <>
                <div className="license-option selected">
                  <div><strong>✓ You own this {isReel ? 'reel' : 'photo'}{owned.owned_tier ? ` · ${owned.owned_tier}` : ''}</strong><span>Full resolution unlocked — re-download any time.</span></div>
                </div>
                <a href={`${API}/api/media/${media.id}/download`} className="st-btn" style={{ width: '100%', textDecoration: 'none', marginTop: 12 }}>Download full file</a>
                <small>Lifetime re-downloads, always in full resolution.</small>
              </>
            )}
            {(!owned?.owned || versions.length > 0) && (
              <>
                {owned?.credit && Number(owned.credit.slots_left) > 0 && !ownsPlain && (
                  <button disabled={unlocking} onClick={unlock}
                    style={{ width: '100%', minHeight: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2, padding: '8px 16px', marginBottom: 12, border: '1px solid #4a6fa5', background: 'rgba(74,111,165,.12)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                    <span>{unlocking ? 'Unlocking…' : `Unlock with credit (${owned.credit.slots_left} left)`}</span>
                    <span style={{ color: '#888', fontSize: 11, fontWeight: 400 }}>Uses 1 credit — full resolution, no extra charge.</span>
                  </button>
                )}
                {!ownsPlain && (tiers.length <= 1 ? (
                  tier && (
                    <div className="license-option selected">
                      <div><strong>{tier.label}</strong><span>{tier.description || licenseSubline(tier)}</span></div>
                      <b>{nzd(tier.price_cents)}</b>
                    </div>
                  )
                ) : (
                  <div role="radiogroup" aria-label="Choose your license">
                  {tiers.map((t) => (
                    <button type="button" key={t.id} role="radio" onClick={() => { setTierId(t.id); setAdded(false); }}
                      className={`license-option${String(t.id) === String(tierId) ? ' selected' : ''}`}
                      aria-checked={String(t.id) === String(tierId)}>
                      <div><strong>{t.label}</strong><span>{t.description || licenseSubline(t)}</span></div>
                      <b>{nzd(t.price_cents)}</b>
                    </button>
                  ))}
                  </div>
                ))}
            {!isReel && logos.length > 0 && (
              <div style={{ margin: '12px 0' }} role="group" aria-label="Add sponsor logos">
                <p className="purchase-label">Sponsor logo <em className="auth-opt">(optional · baked in)</em></p>
                {logos.map((l) => {
                  const d = discountFor(l.id);
                  const on = logoIds.includes(l.id);
                  return (
                    <div key={l.id}>
                      <button type="button" role="checkbox" aria-checked={on} onClick={() => selectAndOpen(l.id)}
                        className={`license-option${on ? ' selected' : ''}`}>
                        <span style={{ flex: 'none', width: 72, height: 36, background: '#fff', borderRadius: 4, overflow: 'hidden' }}>
                          <SmartImage src={`${API}/api/sponsor-logos/${l.id}/file`} alt={`${l.label} logo`} width={72} height={36}
                            unoptimized style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                        </span>
                        <div><strong>{l.label}</strong>{on ? <span> · {variantShort(logoTemplate)}</span> : (d && <span> −{nzd(d.discount_cents)} off</span>)}</div>
                        <b>{d ? `−${nzd(d.discount_cents)}` : 'Free'}</b>
                      </button>
                      {on && (
                        <button type="button" onClick={removeLogo}
                          style={{ marginTop: 8, background: 'none', border: 0, padding: '0 0 2px', color: '#999', fontSize: 12, borderBottom: '1px solid #444', cursor: 'pointer' }}>
                          Remove logo
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <LogoModal open={logoOpen} onClose={() => setLogoOpen(false)}
              logos={logos} logoIds={logoIds} logoPos={logoPos}
              template={logoTemplate} setTemplate={setLogoTemplate}
              theme={logoTheme} setTheme={setLogoTheme}
              photo={media.preview_url || media.thumb_url} mediaId={media.id}
              ownedDesigns={ownedDesigns}
              onSave={(d) => {
                setApplied(d);
                if (isTheme(d?.theme)) setLogoTheme(d.theme);
                if (d?.logoPos) setLogoPos((v) => ({ ...v, ...d.logoPos }));
              }}
              meta={{ event: eventName, className: media.class_name, subject, moment: media.moment || null }} />
            {draftOwnedVersion && (
              <p role="status" style={{ marginTop: 8, fontSize: 12, color: '#e08a8a' }}>
                Already yours — <Link href="/media" style={{ color: '#fff', borderBottom: '1px solid #555' }}>download it from My photos</Link>.
              </p>
            )}
            {(!ownsPlain || logoIds.length > 0) && !draftOwnedVersion && (
            <>
            <ul>
              <li>{tier && (tier.printable || String(tier.max_resolution || '').toLowerCase().includes('original')) ? 'Watermark-free file — print-ready' : 'Watermark-free file for screen & sharing'}</li>
              <li>Instant download after checkout</li>
            </ul>
            <div className="license-total"><span>Total</span><strong>{priceLabel}</strong></div>
            {meEmail && balance > 0 && tier?.price_cents > 0 && (
              <p style={{ margin: '12px 0', color: '#ccc', fontSize: 13, lineHeight: 1.5 }}>
                {nzd(Math.min(balance, Number(tier.price_cents)))} balance applied
                {Math.min(balance, Number(tier.price_cents)) < Number(tier.price_cents)
                  ? ` · ${nzd(Number(tier.price_cents) - Math.min(balance, Number(tier.price_cents)))} left by card`
                  : ' · covers it fully'}
                <span style={{ display: 'block', marginTop: 4, color: '#777', fontSize: 11 }}>Balance payments are final — no refunds to balance.</span>
              </p>
            )}
            {err && <p className="auth-error" role="alert">{safeError(err)}{' '}<Link href="/contact" style={{ color: '#fff', borderBottom: '1px solid #555' }}>Need help? Contact support</Link></p>}
            <button className={showAdded ? 'added' : ''} disabled={busy || !tier}
              onClick={() => tier && addItem(tier)} aria-label={showAdded ? 'Added to cart — view cart to check out' : tiersReady ? `Add this ${isReel ? 'reel' : 'photo'} to cart for ${price}` : 'Loading price'}>
              {!tiersReady ? 'Loading…' : showAdded ? 'Added to cart' : `Add to cart · ${price}`}
              <Icon name="cart" size={17} />
            </button>
            {!meEmail && (
              <label htmlFor="license-email" style={{ display: 'grid', gap: 8, margin: '20px 0 12px' }}>
                <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Email for receipt</span>
                <input id="license-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.nz"
                  style={{ minHeight: 46, padding: '0 12px', color: 'white', background: '#0b0b0b', border: '1px solid #333', outline: 0, fontSize: 13 }} />
              </label>
            )}
            <button disabled={busy || !tier} onClick={() => buyNow()}
              style={{ marginTop: 10, background: 'transparent', border: '1px solid #555', color: 'white' }}>
              {busy ? 'Opening checkout…' : 'Buy now — pay immediately'}
              <Icon name="arrow" size={17} />
            </button>
            <small>Secure Stripe checkout · instant unlock.</small>
            </>
            )}
              </>
            )}
          </section>
          {(bundle || creditPack) && (
            <div className="purchase-packages">
              <h2 className="purchase-label">Bundles — save on more photos</h2>
              {bundle && (
                <article>
                  <div>
                    <strong>{bundle.title}</strong>
                    <p>{bundle.items} photos · one checkout, watermark-free full resolution.</p>
                    <SaveLine value={savingsFor(bundle.items, bundle.price_cents)} />
                    <span>{nzd(bundle.price_cents)}</span>
                  </div>
                  <button disabled={busy} onClick={buyBundle}>Buy</button>
                </article>
              )}
              {creditPack && (
                <article>
                  <div>
                    <strong>{creditPack.slots}-photo credits{subjectName ? ` · ${subjectName}` : ''}</strong>
                    <p>Unlock any {creditPack.slots} photos of {subjectName || 'this rider'} at this event.</p>
                    <SaveLine value={savingsFor(creditPack.slots, creditPack.price_cents)} />
                    <span>{nzd(creditPack.price_cents)}</span>
                  </div>
                  <button disabled={busy} onClick={buyCredits}>Buy</button>
                </article>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
