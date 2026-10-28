'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { addToCart } from '../lib/cart';
import { addFavourite } from '../lib/favourites';
import { checkoutBase, newIdempotencyKey, nzd, stripeCheckoutUrl } from '../lib/figma-data';
import { useAuthed } from '../lib/use-authed';
import FollowButton from './FollowButton';
import { safeError } from '../lib/errors';
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
  const [tierId, setTierId] = useState(media.license_default || null);
  const [bundle, setBundle] = useState(null); // rider/horse x event package
  const [creditPack, setCreditPack] = useState(null); // N-photo credit bundle
  const [owned, setOwned] = useState(null); // {owned, owned_tier} | {credit:{slots_left}} | null
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
  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  const checkoutEmail = () => {
    const em = (email || meEmail || '').trim();
    if (!validEmail(em)) {
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
      .catch(() => {});
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
  }, [media.id]);

  const tier = tiers.find((t) => String(t.id) === String(tierId)) || tiers[0];
  const price = tier ? nzd(tier.price_cents) : (isReel ? 'NZ$55' : 'NZ$35');
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
    if (res.ok && j.data?.owned) { setOwned({ owned: true, owned_tier: j.data.owned_tier }); return null; }
    if (res.status === 409 && j.owned) { setOwned({ owned: true, owned_tier: j.owned_tier }); throw new Error(j.error || 'You already own this.'); }
    if (!res.ok) throw new Error(j.error || 'Checkout failed — try again.');
    if (j.data?.paid && j.data?.purchase_id) { router.push(`/photos/success?purchase=${j.data.purchase_id}`); return j.data; }
    if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email for the payment link.');
    window.location.assign(stripeCheckoutUrl(j.data));
    return j.data;
  }

  // Ownership + 5-pack credit hint for the logged-in buyer (mirrors EQIndex).
  useEffect(() => {
    fetch(`${API}/photos/${media.id}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data?.owned) setOwned({ owned: true, owned_tier: j.data.owned_tier });
        else if (Number(j?.data?.credit?.slots_left) > 0) setOwned({ credit: j.data.credit });
      })
      .catch(() => {});
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
      const res = await fetch(`${API}/api/credits/unlock`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: media.id }),
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
    setBusy(true); setErr('');
    try {
      const gross = Number(t.price_cents) || 0;
      const use_balance_cents = meEmail ? Math.min(balance, gross) : 0;
      await checkoutPost('/api/checkout', { media_id: media.id, license_tier: t.id, email: em, ...(use_balance_cents ? { use_balance_cents } : {}) }, backHref);
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
    addToCart({
      key: `media:${media.id}:${t.id}`,
      kind: 'media',
      image: media.thumb_url || media.preview_url,
      type: `${isReel ? 'Reel' : 'Photo'} license`,
      name: subject,
      detail: `${eventName} · ${t.label}`,
      priceCents: t.price_cents,
      mediaId: media.id,
      tierId: t.id,
      tierLabel: t.label,
    });
    setAdded(true);
    toast('Added to cart', { action: { label: 'View cart', href: '/cart' } });
  }

  async function saveFavourite() {
    // Members only — guests log in first, then land back here.
    try {
      const r = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (!r.ok) throw new Error('login required');
    } catch {
      router.push(`/login?next=${encodeURIComponent(pathname || `/p/${media.id}`)}`);
      return;
    }
    if (addFavourite(media.id)) {
      toast('Saved to favourites', { action: { label: 'View', href: '/favourites' } });
    } else {
      toast('Already in favourites', { type: 'info', action: { label: 'View', href: '/favourites' } });
      return;
    }
    router.push('/favourites');
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
            ) : (
              <img src={media.preview_url || media.thumb_url} alt={subject} loading="eager" />
            )}
            <figcaption>
              <span>Boss Media preview</span>
              {media.photographer ? <span>© {media.photographer}</span> : <span>Watermarked preview</span>}
            </figcaption>
          </figure>
          <div className="purchase-preview-notes">
            <p>This preview has a watermark. What you pay for unlocks watermark-free right after purchase.</p>
            <div>
              <button type="button" onClick={saveFavourite} className="text-link">Save to favourites</button>
              {media.rider_id && <FollowButton kind="rider" id={media.rider_id} name={media.rider} />}
              {media.horse_id && <FollowButton kind="horse" id={media.horse_id} name={media.horse} />}
              <Link href="/contact">Need help? Contact us</Link>
            </div>
          </div>
        </div>
        <aside className="purchase-panel">
          <section className="license-panel">
            <p className="purchase-label">Choose your license</p>
            {owned?.owned ? (
              <>
                <div className="license-option selected">
                  <div><strong>✓ You own this {isReel ? 'reel' : 'photo'}{owned.owned_tier ? ` · ${owned.owned_tier}` : ''}</strong><span>Full resolution unlocked — re-download any time.</span></div>
                </div>
                <a href={`${API}/api/media/${media.id}/download`} className="st-btn" style={{ width: '100%', textDecoration: 'none', marginTop: 12 }}>Download full file</a>
                <small>Lifetime re-downloads, always in full resolution.</small>
              </>
            ) : (
              <>
                {owned?.credit && Number(owned.credit.slots_left) > 0 && (
                  <button disabled={unlocking} onClick={unlock}
                    style={{ width: '100%', minHeight: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2, padding: '8px 16px', marginBottom: 12, border: '1px solid #4a6fa5', background: 'rgba(74,111,165,.12)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                    <span>{unlocking ? 'Unlocking…' : `Unlock with credit (${owned.credit.slots_left} left)`}</span>
                    <span style={{ color: '#888', fontSize: 11, fontWeight: 400 }}>Uses 1 credit — full resolution, no extra charge.</span>
                  </button>
                )}
                {tiers.length <= 1 ? (
                  tier && (
                    <div className="license-option selected" aria-current="true">
                      <div><strong>{tier.label}</strong><span>{tier.description || licenseSubline(tier)}</span></div>
                      <b>{nzd(tier.price_cents)}</b>
                    </div>
                  )
                ) : (
                  tiers.map((t) => (
                    <button type="button" key={t.id} onClick={() => { setTierId(t.id); setAdded(false); }}
                      className={`license-option${String(t.id) === String(tierId) ? ' selected' : ''}`}
                      aria-pressed={String(t.id) === String(tierId)}>
                      <div><strong>{t.label}</strong><span>{t.description || licenseSubline(t)}</span></div>
                      <b>{nzd(t.price_cents)}</b>
                    </button>
                  ))
                )}
            <ul>
              <li>{tier && (tier.printable || String(tier.max_resolution || '').toLowerCase().includes('original')) ? 'Watermark-free file — print-ready' : 'Watermark-free file for screen & sharing'}</li>
              <li>Instant download after checkout</li>
              <li>Kept in your account — download again anytime</li>
            </ul>
            <div className="license-total"><span>Total</span><strong>{price}</strong></div>
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
            <button className={added ? 'added' : ''} disabled={busy || !tier}
              onClick={() => tier && addItem(tier)} aria-label={added ? 'Added to cart — view cart to check out' : `Add this ${isReel ? 'reel' : 'photo'} to cart for ${price}`}>
              {added ? 'Added to cart' : `Add to cart · ${price}`}
              <Icon name="cart" size={17} />
            </button>
            <p style={{ margin: '8px 0 12px', color: '#888', fontSize: 11 }}>No email needed — you can pay later in the cart.</p>
            <label htmlFor="license-email" style={{ display: 'grid', gap: 8, margin: '0 0 12px' }}>
              <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Email for receipt{meEmail ? '' : ' \u2014 no account needed'}</span>
              <input id="license-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.nz"
                style={{ minHeight: 46, padding: '0 12px', color: 'white', background: '#0b0b0b', border: '1px solid #333', outline: 0, fontSize: 13 }} />
            </label>
            <p style={{ margin: '0 0 12px', color: '#888', fontSize: 11, lineHeight: 1.6 }}>
              {meEmail
                ? <>Receipt to <strong style={{ color: '#ddd' }}>{meEmail}</strong> \u2014 downloads live in <Link href="/media" style={{ color: '#fff', borderBottom: '1px solid #555' }}>My media</Link>.</>
                : <>Receipt and download access go to this email \u2014 no account needed.</>}
            </p>
            <button disabled={busy || !tier} onClick={() => buyNow()}
              style={{ marginTop: 10, background: 'transparent', border: '1px solid #555', color: 'white' }}>
              {busy ? 'Opening checkout…' : 'Buy now — pay immediately'}
              <Icon name="arrow" size={17} />
            </button>
            <small>Stripe secure checkout · Download unlocked after payment · Re-download anytime.</small>
              </>
            )}
          </section>
          {(bundle || creditPack) && (
            <div className="purchase-packages">
              <p className="purchase-label">Bundles — save on more photos</p>
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
