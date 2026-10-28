'use client';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import SearchSelect from './SearchSelect';
import DateField from './DateField';
import { API } from '../lib/api';
import { addToCart } from '../lib/cart';
import { checkoutBase, nzd, stripeCheckoutUrl } from '../lib/figma-data';
import { Icon, SiteFooter, SiteHeader } from './figma';
import { useToast } from './Toaster';

const MUSIC = [
  ['choose_for_me', 'Choose for me', 'Our editor selects a licensed track that fits.'],
  ['title', 'I have a track in mind', 'Share your preferred track in the notes.'],
  ['none', 'No music', 'Delivered silent for your own soundtrack.'],
];

export default function PreBookClient({ events, products }) {
  const toast = useToast();
  const [eventId, setEventId] = useState(null);
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [music, setMusic] = useState('choose_for_me');
  const [added, setAdded] = useState(false);
  const [needEvent, setNeedEvent] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyErr, setBuyErr] = useState('');
  const [showcase, setShowcase] = useState(false);
  const formRef = useRef(null);

  // Pre-book is for the future: only upcoming events, soonest first.
  const upcoming = useMemo(() => {
    const t = Date.now();
    return events
      .filter((e) => { const en = e.date_end || e.date_start; return en && new Date(en).getTime() >= t; })
      .sort((a, b) => String(a.date_start || '').localeCompare(String(b.date_start || '')));
  }, [events]);
  const options = useMemo(() => upcoming.map((e) => ({
    id: e.id,
    label: e.name,
    sub: [e.date_start ? new Date(e.date_start).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '', e.venue].filter(Boolean).join(' · '),
  })), [upcoming]);

  const event = upcoming.find((e) => String(e.id) === String(eventId)) || null;
  const product = products.find((p) => String(p.id) === String(productId)) || products[0];
  const musicLabel = MUSIC.find(([v]) => v === music)?.[1] || '';

  const summary = useMemo(() => {
    if (!product) return null;
    if (!event) return null;
    const d = event.date_start ? new Date(event.date_start) : null;
    return {
      eventName: event.name,
      eventMeta: `${d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : ''} · ${event.venue || ''}`.trim(),
      coverage: product.name,
      delivery: [product.coverage, product.includes_raw ? 'Raw footage included' : null].filter(Boolean).join(' · ') || product.description || '',
      total: nzd(product.price_cents),
    };
  }, [event, product]);

  function collect(form) {
    const fd = new FormData(form);
    const notes = String(fd.get('notes') || '');
    return {
      product_id: product?.id,
      event_id: event?.id || undefined,
      horse_name: String(fd.get('horse') || ''),
      class_name: String(fd.get('className') || ''),
      back_number: String(fd.get('backNumber') || ''),
      shooting_date: String(fd.get('date') || ''),
      phone: String(fd.get('phone') || ''),
      // No email field — receipt and timing confirmation go to the account email (see /api/reel-orders fallback).
      music_mode: music,
      music_title: music === 'title' ? String(fd.get('musicTitle') || '') : undefined,
      notes: notes || undefined,
      showcase,
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const payload = collect(form);
    payload.rider_name = String(new FormData(form).get('rider') || '');
    addToCart({
      key: `reel:${product.id}:${event?.id || 'open'}:${Date.now().toString(36)}`,
      kind: 'reel',
      image: null,
      type: 'Pre-book coverage',
      name: product.name,
      detail: `${event?.name || 'Open event'} · ${payload.rider_name || ''} ${payload.horse_name ? `/ ${payload.horse_name}` : ''}`.trim(),
      priceCents: product.price_cents,
      reelPayload: payload,
    });
    setAdded(true);
    toast('Coverage added to cart', { action: { label: 'View cart', href: '/cart' } });
  }

  // Skip the cart: create the reel order and go straight to Stripe.
  async function buyNow() {
    if (buying) return;
    if (!event) { setNeedEvent(true); return; }
    setNeedEvent(false);
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    setBuying(true); setBuyErr('');
    try {
      const payload = collect(form);
      payload.rider_name = String(new FormData(form).get('rider') || '');
      const res = await fetch(`${API}/api/reel-orders`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...checkoutBase(), ...payload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Order failed — try again.');
      window.location.assign(stripeCheckoutUrl(j.data));
    } catch (e) { setBuyErr(e.message); setBuying(false); }
  }

  if (!products.length) {
    return (
      <div className="booking-page">
        <SiteHeader />
        <main className="booking-shell section-gutter">
          <p className="eyebrow">Pre-book</p>
          <h1 style={{ fontSize: 44 }}>Coverage isn’t open yet.</h1>
          <p className="empty-note">Reel products are unavailable right now — check back soon.</p>
          <p style={{ marginTop: 18, display: 'flex', gap: 18, justifyContent: 'center' }}>
            <Link href="/events" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 13, color: '#fff' }}>Browse galleries</Link>
            <Link href="/contact" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 13, color: '#fff' }}>Contact us</Link>
          </p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="booking-page">
      <SiteHeader />
      <main className="booking-shell section-gutter">
        <div className="booking-heading">
          <div>
            <p className="eyebrow">Dedicated event coverage</p>
            <h1>Pre-book your ride.</h1>
          </div>
          <p>Tell us where and when you’re riding. We’ll be there to capture the moments that matter.</p>
        </div>
        <div className="booking-progress" aria-label="Booking progress">
          <span className="active">01 Coverage</span>
          <span>02 Rider details</span>
          <span>03 Review</span>
        </div>
        <div className="booking-layout">
          <form className="booking-form" ref={formRef} onSubmit={onSubmit}>
            <section>
              <div className="booking-section-title">
                <span>01</span>
                <div><h2>Event &amp; coverage</h2><p>Choose an event and the coverage you need.</p></div>
              </div>
              <label className="booking-field full">
                <span>Event</span>
                <SearchSelect
                  options={options}
                  value={eventId}
                  onChange={(id) => { setEventId(id); setAdded(false); setNeedEvent(false); }}
                  placeholder={options.length ? 'Search events…' : 'No events open for pre-book right now'}
                />
                <span style={{ marginTop: 8, display: 'block', color: '#9a9a9a', fontSize: 12 }}>
                  Only events opened by Boss Media can be booked.
                </span>
              </label>
              <div className="coverage-options">
                {products.map((p) => (
                  <button type="button" key={p.id}
                    className={String(productId) === String(p.id) ? 'active' : ''}
                    onClick={() => { setProductId(p.id); setAdded(false); }}>
                    <span className="coverage-check" />
                    <strong>{p.name}</strong>
                    <p>{p.description || p.coverage || ''}</p>
                    <small>{[p.coverage, p.includes_raw ? 'Raw footage' : null].filter(Boolean).join(' · ')}</small>
                    <b>{nzd(p.price_cents)}</b>
                  </button>
                ))}
              </div>
            </section>
            <section>
              <div className="booking-section-title">
                <span>02</span>
                <div><h2>Rider details</h2><p>Help our photographer find you on the day.</p></div>
              </div>
              <div className="booking-fields">
                <label className="booking-field"><span>Rider name</span><input name="rider" required placeholder="e.g. Amelia Green" /></label>
                <label className="booking-field"><span>Horse</span><input name="horse" required placeholder="e.g. Apollo" /></label>
                <label className="booking-field"><span>Class</span><input name="className" placeholder="e.g. 1.30m Grand Prix" /></label>
                <label className="booking-field"><span>Back number</span><input name="backNumber" placeholder="e.g. 214" /></label>
                <label className="booking-field"><span>Competition date</span><DateField name="date" key={event?.id || 'none'} defaultValue={(event?.date_start || '').slice(0, 10)} /></label>
                <label className="booking-field"><span>Phone</span><input name="phone" required type="tel" placeholder="+64" /></label>
              </div>
            </section>
            <section>
              <div className="booking-section-title">
                <span>03</span>
                <div><h2>Creative preferences</h2><p>Optional details for reel coverage.</p></div>
              </div>
              <fieldset className="music-options">
                <legend>Music direction</legend>
                {MUSIC.map(([value, label, hint]) => (
                  <label key={value}>
                    <input type="radio" name="music" checked={music === value} onChange={() => setMusic(value)} />
                    <span><strong>{label}</strong><small>{hint}</small></span>
                  </label>
                ))}
              </fieldset>
              {music === 'title' && (
                <label className="booking-field full" style={{ marginBottom: 22 }}>
                  <span>Track title</span>
                  <input name="musicTitle" placeholder="Artist — Title" />
                </label>
              )}
              <label className="booking-field full booking-notes">
                <span>Notes for our team</span>
                <textarea name="notes" placeholder="Tell us about your schedule, arena, or any important moments." />
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginTop: 20, cursor: 'pointer' }}>
                <input type="checkbox" checked={showcase} onChange={(e) => { setShowcase(e.target.checked); setAdded(false); }} style={{ accentColor: '#fff', marginTop: 3 }} />
                <span><strong style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Feature my reel in public galleries</strong>
                <small style={{ display: 'block', color: '#777', fontSize: 12 }}>Optional. Unticked = only you can watch it, forever private.</small></span>
              </label>
            </section>
          </form>
          <aside className="booking-summary">
            <p className="eyebrow">Booking summary</p>
            {summary && (
              <>
                <div className="summary-event">
                  <span>Event</span>
                  <strong>{summary.eventName}</strong>
                  <small>{summary.eventMeta}</small>
                </div>
                <div className="summary-service">
                  <span>Coverage</span>
                  <strong>{summary.coverage}</strong>
                  <small>{summary.delivery}</small>
                  {musicLabel && <small>Music: {musicLabel}</small>}
                  <small>{showcase ? 'Public galleries: allowed' : 'Private gallery only'}</small>
                </div>
                <div className="summary-total"><span>Total</span><strong>{summary.total}</strong></div>
              </>
            )}
            <button disabled={buying} onClick={buyNow}>
              {buying ? 'Opening secure checkout…' : <>Buy now{summary ? ` · ${summary.total}` : ''}</>}
              <Icon name="arrow" size={18} />
            </button>
            <button type="button" className="summary-ghost-btn" onClick={() => {
              if (!event) { setNeedEvent(true); return; }
              setNeedEvent(false);
              formRef.current?.requestSubmit();
            }}>
              {added ? 'Booking added ✓' : 'Add booking to cart'}
              <Icon name="cart" size={15} />
            </button>
            {needEvent && <p role="alert" style={{ marginTop: 10, color: '#ff9d9d', fontSize: 12 }}>Pick an event from the list first — coverage needs a date and venue.</p>}
            {buyErr && <p role="alert" style={{ marginTop: 10, color: '#ff9d9d', fontSize: 12 }}>{buyErr === 'login required' ? <Link href="/login?next=/pre-book" style={{ color: '#fff', borderBottom: '1px solid #555' }}>Sign in to book</Link> : buyErr}</p>}
            <p className="summary-note">Full payment secures your coverage. We’ll confirm timing by email before the event.</p>
            {added && (
              <Link href="/cart" className="summary-cart-link">Continue to cart <Icon name="arrow" size={15} /></Link>
            )}
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
