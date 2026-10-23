'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { addToCart } from '../lib/cart';
import { checkoutBase, nzd } from '../lib/figma-data';
import { Icon } from './figma';

// Honest per-tier subline when the DB has no custom description. Never
// promises "full resolution" for small/medium renditions.
function licenseSubline(t) {
  const res = String(t?.max_resolution || '').toLowerCase();
  const isOriginal = !res || res.includes('original');
  if (isOriginal) return t?.printable === false ? 'Original file · best quality' : 'Original file · best quality · print-ready';
  const size = t?.max_resolution || 'Digital file';
  return t?.printable ? `${size} · print-ready` : `${size} · for screen & sharing`;
}

export default function MediaPurchase({ media, eventName, eventSlug, backHref, backLabel }) {
  const router = useRouter();
  const [tiers, setTiers] = useState([]);
  const [tierId, setTierId] = useState(media.license_default || null);
  const [bundle, setBundle] = useState(null); // rider/horse x event package
  const [creditPack, setCreditPack] = useState(null); // N-photo credit bundle
  const [owned, setOwned] = useState(null); // {owned, owned_tier} | {credit:{slots_left}} | null
  const [unlocking, setUnlocking] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [added, setAdded] = useState(false);

  const isReel = media.kind === 'reel';
  const rider = media.rider || 'Unknown rider';
  const horse = media.horse || 'Unknown horse';

  useEffect(() => {
    fetch(`${API}/api/license-tiers`)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tier = tiers.find((t) => String(t.id) === String(tierId)) || tiers[0];
  const price = tier ? nzd(tier.price_cents) : (isReel ? 'NZ$55' : 'NZ$35');
  const scopeIds = media.rider_id ? { rider_id: media.rider_id } : media.horse_id ? { horse_id: media.horse_id } : null;
  const subjectName = media.rider || media.horse || '';

  const newKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  async function checkoutPost(path, body, cancelPath) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...checkoutBase(), ...(cancelPath ? { cancel_path: cancelPath } : {}), ...body, email: email.trim(), idempotency_key: newKey() }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.data?.owned) { setOwned({ owned: true, owned_tier: j.data.owned_tier }); return null; }
    if (res.status === 409 && j.owned) { setOwned({ owned: true, owned_tier: j.owned_tier }); throw new Error(j.error || 'You already own this.'); }
    if (!res.ok) throw new Error(j.error || 'Checkout failed — try again.');
    if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email for the payment link.');
    window.location.assign(j.data.checkout_url);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id]);

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
    if (!email.trim()) { setErr('Enter your email to receive the download link.'); return; }
    setBusy(true); setErr('');
    try {
      await checkoutPost('/api/checkout', { media_id: media.id, license_tier: t.id }, backHref);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function buyBundle() {
    if (!bundle) return;
    if (!email.trim()) { setErr('Enter your email to receive the download link.'); return; }
    setBusy(true); setErr('');
    try {
      // Real rows check out by id; virtual rows materialize server-side.
      const body = bundle.virtual
        ? { whole_event: true, event_id: media.event_id, ...scopeIds }
        : { package_id: bundle.id };
      await checkoutPost('/api/checkout', body, backHref);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function buyCredits() {
    if (!creditPack) return;
    if (!email.trim()) { setErr('Enter your email to receive the download link.'); return; }
    setBusy(true); setErr('');
    try {
      await checkoutPost('/api/credit-orders', { pack_id: creditPack.id, event_id: media.event_id, ...scopeIds });
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  function addItem(t) {
    addToCart({
      key: `media:${media.id}:${t.id}`,
      kind: 'media',
      image: media.thumb_url || media.preview_url,
      type: `${isReel ? 'Reel' : 'Photo'} license`,
      name: `${horse} × ${rider}`,
      detail: `${eventName} · ${t.label}`,
      priceCents: t.price_cents,
      mediaId: media.id,
      tierId: t.id,
      tierLabel: t.label,
    });
    setAdded(true);
  }

  function saveFavourite() {
    try {
      const raw = localStorage.getItem('bossmedia:favourites');
      const ids = raw ? JSON.parse(raw) : [];
      if (!ids.includes(media.id)) localStorage.setItem('bossmedia:favourites', JSON.stringify([...ids, media.id]));
    } catch {}
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
          <h1>{horse} <span aria-hidden="true">×</span> {rider}</h1>
          <p>{eventName}</p>
        </div>
        <Link href={backHref} aria-label={`${backLabel} — back to ${eventName}`}><span aria-hidden="true">←</span> {backLabel}</Link>
      </div>
      <div className="media-purchase-layout">
        <div className="media-preview-column">
          <figure className="purchase-preview">
            {isReel ? (
              <video src={media.preview_url} controls playsInline style={{ width: '100%', height: 'min(68vh, 720px)', objectFit: 'contain' }} />
            ) : (
              <img src={media.preview_url || media.thumb_url} alt={`${horse} and ${rider}`} loading="eager" />
            )}
            {isReel && <span className="purchase-preview-play"><Icon name="play" size={28} /></span>}
            <figcaption>
              <span>Boss Media preview</span>
              {media.photographer ? <span>© {media.photographer}</span> : <span>Watermarked preview</span>}
            </figcaption>
          </figure>
          <div className="purchase-preview-notes">
            <p>This preview has a watermark. What you pay for unlocks watermark-free right after purchase.</p>
            <div>
              <button type="button" onClick={saveFavourite} style={{ background: 'none', border: 0, padding: 0, color: '#aaa', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>Save to favourites</button>
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
            {err && <p className="auth-error" role="alert">{err}</p>}
            <button className={added ? 'added' : ''} disabled={busy || !tier}
              onClick={() => tier && addItem(tier)} aria-label={added ? 'Added to cart — view cart to check out' : `Add this ${isReel ? 'reel' : 'photo'} to cart for ${price}`}>
              {added ? 'Added to cart' : `Add to cart · ${price}`}
              <Icon name="cart" size={17} />
            </button>
            <p style={{ margin: '8px 0 12px', color: '#888', fontSize: 11 }}>No email needed — you can pay later in the cart.</p>
            <label htmlFor="license-email" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Email for delivery — for Buy now</span>
              <input id="license-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.nz"
                style={{ minHeight: 46, padding: '0 12px', color: 'white', background: '#0b0b0b', border: '1px solid #333', outline: 0, fontSize: 13 }} />
            </label>
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
