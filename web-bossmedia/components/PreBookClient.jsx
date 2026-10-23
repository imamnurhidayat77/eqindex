'use client';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import SearchSelect from './SearchSelect';
import { addToCart } from '../lib/cart';
import { nzd } from '../lib/figma-data';
import { Icon, SiteFooter, SiteHeader } from './figma';

const MUSIC = [
  ['choose_for_me', 'Choose for me', 'Our editor selects a licensed track that fits.'],
  ['title', 'I have a track in mind', 'Share your preferred track in the notes.'],
  ['none', 'No music', 'Delivered silent for your own soundtrack.'],
];

export default function PreBookClient({ events, products }) {
  const [eventId, setEventId] = useState(null);
  const [manual, setManual] = useState(null); // {name, date, venue} when event added by hand
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [music, setMusic] = useState('choose_for_me');
  const [added, setAdded] = useState(false);
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

  const event = manual ? null : upcoming.find((e) => String(e.id) === String(eventId)) || null;
  const product = products.find((p) => String(p.id) === String(productId)) || products[0];
  const musicLabel = MUSIC.find(([v]) => v === music)?.[1] || '';

  const summary = useMemo(() => {
    if (!product) return null;
    if (manual) {
      return {
        eventName: manual.name || 'Custom event',
        eventMeta: [manual.date ? new Date(`${manual.date}T00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : '', manual.venue].filter(Boolean).join(' · ') || 'Date TBC',
        coverage: product.name,
        delivery: [product.coverage, product.includes_raw ? 'Raw footage included' : null].filter(Boolean).join(' · ') || product.description || '',
        total: nzd(product.price_cents),
      };
    }
    if (!event) return null;
    const d = event.date_start ? new Date(event.date_start) : null;
    return {
      eventName: event.name,
      eventMeta: `${d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : ''} · ${event.venue || ''}`.trim(),
      coverage: product.name,
      delivery: [product.coverage, product.includes_raw ? 'Raw footage included' : null].filter(Boolean).join(' · ') || product.description || '',
      total: nzd(product.price_cents),
    };
  }, [event, manual, product]);

  function collect(form) {
    const fd = new FormData(form);
    const customLine = manual
      ? `Custom event: ${manual.name}${manual.date ? ` on ${manual.date}` : ''}${manual.venue ? ` at ${manual.venue}` : ''}`
      : '';
    const notes = [customLine, String(fd.get('notes') || '')].filter(Boolean).join('\n');
    return {
      product_id: product?.id,
      event_id: event?.id || undefined,
      horse_name: String(fd.get('horse') || ''),
      class_name: String(fd.get('className') || ''),
      back_number: String(fd.get('backNumber') || ''),
      shooting_date: String(fd.get('date') || manual?.date || ''),
      phone: String(fd.get('phone') || ''),
      email: String(fd.get('email') || ''),
      music_mode: music,
      music_title: music === 'title' ? String(fd.get('musicTitle') || '') : undefined,
      notes: notes || undefined,
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
  }

  if (!products.length) {
    return (
      <div className="booking-page">
        <SiteHeader />
        <main className="booking-shell section-gutter">
          <p className="eyebrow">Pre-book</p>
          <h1 style={{ fontSize: 44 }}>Coverage isn’t open yet.</h1>
          <p className="empty-note">Reel products are unavailable right now — check back soon.</p>
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
                <span>Event — upcoming dates only</span>
                {manual ? (
                  <div className="st-card" style={{ padding: 16 }}>
                    <div className="st-form">
                      <label><span>Event name</span>
                        <input value={manual.name} onChange={(e) => { setManual({ ...manual, name: e.target.value }); setAdded(false); }} placeholder="e.g. Mystery Creek Spring Show" />
                      </label>
                      <div className="st-form-row">
                        <label><span>Date</span>
                          <input type="date" value={manual.date} onChange={(e) => { setManual({ ...manual, date: e.target.value }); setAdded(false); }} />
                        </label>
                        <label><span>Venue (optional)</span>
                          <input value={manual.venue} onChange={(e) => { setManual({ ...manual, venue: e.target.value }); setAdded(false); }} placeholder="e.g. Mystery Creek" />
                        </label>
                      </div>
                    </div>
                    <button type="button" className="st-link" style={{ background: 'none', border: 0, borderBottom: '1px solid #555', padding: 0, paddingBottom: 3, color: '#aaa', fontSize: 12, cursor: 'pointer', marginTop: 12 }}
                      onClick={() => setManual(null)}>
                      ← Pick from the event list instead
                    </button>
                  </div>
                ) : (
                  <>
                    <SearchSelect
                      options={options}
                      value={eventId}
                      onChange={(id) => { setEventId(id); setAdded(false); }}
                      placeholder={options.length ? 'Search upcoming events…' : 'No upcoming events — add yours manually'}
                      onRequestCustom={(name) => { setManual({ name, date: '', venue: '' }); setEventId(null); setAdded(false); }}
                    />
                    <span style={{ marginTop: 8, display: 'block', color: '#9a9a9a', fontSize: 12 }}>
                      Can’t find it? Type the name, hit Enter, and add it manually.
                    </span>
                  </>
                )}
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
                <label className="booking-field"><span>Competition date</span><input name="date" type="date" /></label>
                <label className="booking-field"><span>Phone</span><input name="phone" required type="tel" placeholder="+64" /></label>
                <label className="booking-field"><span>Email</span><input name="email" required type="email" placeholder="you@example.nz" /></label>
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
                </div>
                <div className="summary-total"><span>Total</span><strong>{summary.total}</strong></div>
              </>
            )}
            <button className={added ? 'added' : ''} disabled={!event && !manual?.name?.trim()} title={!event && !manual?.name?.trim() ? 'Pick an event or add yours manually first' : undefined} onClick={() => formRef.current?.requestSubmit()}>
              {added ? 'Booking added' : 'Add booking to cart'}
              <Icon name={added ? 'cart' : 'arrow'} size={18} />
            </button>
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
