'use client';
import SmartImage from '../../components/SmartImage';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API, cachedJson } from '../../lib/api';
import { safeError } from '../../lib/errors';
import { fmtDay } from '../../lib/format';
import { newIdempotencyKey } from '../../lib/figma-data';
import { stripeCheckoutUrl } from '../../lib/figma-data';
import { Icon, SiteFooter, SiteHeader } from '../../components/figma';
import GalleryPager from '../../components/GalleryPager';
import SearchSelect from '../../components/SearchSelect';
import { searchSubjects } from '../../lib/search-subjects';
import { useAuthed } from '../../lib/use-authed';
import { useDocumentTitle } from '../../lib/use-document-title';

const TABS = [['photos', 'Photos'], ['reels', 'Reels'], ['credits', 'Credits']];
const PAGE_SIZE = 12;
const REEL_STATUS = { awaiting_payment: 'Waiting for payment', pending: 'Queued for production', in_production: 'Being filmed and edited', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' };
const dl = (id) => `${API}/api/media/${id}/download`;

export default function MediaHub() {
  useDocumentTitle('My media');
  const { user, loading } = useAuthed();
  const [tab, setTab] = useState('photos');
  const [page, setPage] = useState(1);
  const [photos, setPhotos] = useState(null);
  const [reels, setReels] = useState(null);
  const [credits, setCredits] = useState(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (loading || !user) return;
    cachedJson('/api/my/photos').then((j) => setPhotos(j?.data || [])).catch(() => setPhotos([]));
    cachedJson('/api/my/reels').then((j) => setReels(j?.data || [])).catch(() => setReels([]));
    cachedJson('/api/my/credits').then((j) => {
      const rows = j?.data || [];
      setCredits(rows);
      setLeft(rows.reduce((s, b) => s + Number(b.slots_left || 0), 0));
    }).catch(() => setCredits([]));
  }, [loading, user]);

  const count = tab === 'photos' ? photos?.length : tab === 'reels' ? reels?.length : credits?.length;
  const pages = typeof count === 'number' ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;
  const safePage = Math.min(page, pages);
  const slice = (rows) => (rows || []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const first = (user?.name || '').split(' ')[0];

  return (
    <div className="gallery-page">
      <SiteHeader />
      <main>
        <section className="events-section gallery-browser section-gutter" data-page-top>
          <div className="gallery-browser-heading">
            <div>
              <p className="eyebrow">Account / Library</p>
              <h1>My media.</h1>
            </div>
            <p>{user ? `Kia ora, ${first || 'rider'} — everything you own, in one place` : 'Photos, reels and credits live here'}</p>
          </div>

          {loading ? (
            <p className="empty-note">Loading…</p>
          ) : !user ? (
            <div className="empty-state">
              <p className="eyebrow">Members only</p>
              <h3>Sign in to open My media.</h3>
              <p>Bought photos, custom reels and credit packs — with lifetime re-downloads.</p>
              <p style={{ marginTop: 26 }}>
                <Link href="/login?next=/media" className="primary-link">Sign in <Icon name="arrow" size={16} /></Link>
              </p>
            </div>
          ) : (
            <>
              <div className="my-stats" aria-label="Library summary">
                <div><span>Photos owned</span><strong>{photos?.length ?? '—'}</strong></div>
                <div><span>Reel orders</span><strong>{reels?.length ?? '—'}</strong></div>
                <div><span>Credits left</span><strong>{credits ? left : '—'}</strong></div>
              </div>

              <div className="media-tabs-dark" role="group" aria-label="My media">
                {TABS.map(([k, label]) => (
                  <button key={k} aria-pressed={tab === k} className={tab === k ? 'active' : ''} onClick={() => { setTab(k); setPage(1); }}>
                    {label}
                    <span>{k === 'photos' && Array.isArray(photos) ? photos.length : k === 'reels' && Array.isArray(reels) ? reels.length : k === 'credits' && Array.isArray(credits) ? credits.length : ''}</span>
                  </button>
                ))}
              </div>

              <div className="results-meta">
                <p>{typeof count === 'number' ? `${count} ${tab === 'photos' ? (count === 1 ? 'photo' : 'photos') : tab === 'reels' ? (count === 1 ? 'reel' : 'reels') : (count === 1 ? 'pack' : 'packs')}` : 'Loading…'}</p>
              </div>

              {tab === 'photos' && (
                !photos ? <p className="empty-note">Loading…</p> : !photos.length ? (
                  <div className="empty-state">
                    <p className="eyebrow">No purchases yet</p>
                    <h3>Your bought photos land here.</h3>
                    <p>Lifetime re-downloads, always in full resolution.</p>
                    <p style={{ marginTop: 22 }}><Link href="/events" className="text-link">Browse the gallery</Link></p>
                  </div>
                ) : (
                  <>
                  <div className="event-media-grid">
                    {slice(photos).map((x) => (
                      <article key={`${x.purchase_id}-${x.media_id}`} className="my-card">
                        <span className="my-image">
                          {x.thumb_url || x.preview_url
                            ? <SmartImage src={x.thumb_url || x.preview_url} alt={[x.horse, x.rider].filter(Boolean).join(' and ') || x.event_name || 'Purchased photo'} fill sizes="(max-width: 768px) 50vw, 25vw" />
                            : <span className="cover-fallback">Boss Media</span>}
                        </span>
                        <div className="my-status"><i className="live" aria-hidden="true" /><span>{x.license_tier || 'Photo'}</span></div>
                        <h3>{[x.horse, x.rider].filter(Boolean).join(' · ') || x.event_name || 'Photo'}</h3>
                        <div className="my-data"><p>{x.event_name || '—'}</p><p>{fmtDay(x.created_at)}</p></div>
                        <div className="my-action"><p>Lifetime download</p><a href={dl(x.media_id)}>Download <Icon name="arrow" size={14} /></a></div>
                      </article>
                    ))}
                  </div>
                  <GalleryPager page={safePage} pages={pages} onPage={setPage} />
                  </>
                )
              )}

              {tab === 'reels' && (
                !reels ? <p className="empty-note">Loading…</p> : !reels.length ? (
                  <div className="empty-state">
                    <p className="eyebrow">No reel orders yet</p>
                    <h3>Your custom cuts, tracked here.</h3>
                    <p>Order a reel and watch it move from queue to delivery.</p>
                    <p style={{ marginTop: 22 }}><Link href="/pre-book" className="text-link">Pre-book coverage</Link></p>
                  </div>
                ) : (
                  <>
                  <div className="event-media-grid">
                    {slice(reels).map((o) => {
                      const done = ['ready', 'delivered'].includes(o.status);
                      return (
                        <article key={o.id} className="my-card">
                          <span className="my-image">
                            {o.preview_url && done ? (
                              <video src={o.preview_url} controls preload="metadata" poster={o.thumb_url || undefined} style={{ background: '#000' }} />
                            ) : o.thumb_url ? (
                              <SmartImage src={o.thumb_url} alt={`${o.horse_name || 'Reel'} preview`} fill sizes="(max-width: 768px) 50vw, 25vw" />
                            ) : (
                              <span className="my-reel-status">
                                <span className={`my-pill ${done ? 'my-pill-live' : o.status === 'cancelled' ? '' : 'my-pill-warn'}`}>{REEL_STATUS[o.status] || o.status}</span>
                                {!done && <span>We&apos;ll notify you the moment it drops.</span>}
                              </span>
                            )}
                          </span>
                          <div className="my-status"><i className={done ? 'live' : undefined} aria-hidden="true" /><span>{REEL_STATUS[o.status] || o.status}</span></div>
                          <h3>{[o.product_name, o.horse_name].filter(Boolean).join(' — ') || 'Reel'}</h3>
                          <div className="my-data"><p>{o.event_name || '—'}</p><p>{fmtDay(o.created_at)}</p></div>
                          <div className="my-action">
                            <p>{o.scope ? `${o.scope} cut` : 'Custom cut'}</p>
                            {o.media_id && done ? <a href={dl(o.media_id)}>Download <Icon name="arrow" size={14} /></a> : <span />}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <GalleryPager page={safePage} pages={pages} onPage={setPage} />
                  </>
                )
              )}

              {tab === 'credits' && (
                !credits ? <p className="empty-note">Loading…</p> : (
                  <>
                    <BuyCredits user={user} />
                    {!credits.length ? (
                      <div className="empty-state">
                        <p className="eyebrow">No credits yet</p>
                        <h3>Packs unlock photos one by one.</h3>
                        <p>Grab a pack above and spend it across the gallery.</p>
                      </div>
                    ) : (
                      <>
                      <div className="event-media-grid">
                        {slice(credits).map((b) => {
                      const t = Number(b.slots_total) || 0;
                      const l = Number(b.slots_left ?? t) || 0;
                      return (
                        <article key={b.id} className="my-card">
                          <span className="my-image">
                            <span className="my-credit-art"><strong>{l}</strong><small>credits left</small></span>
                          </span>
                          <div className="my-status"><i className="live" aria-hidden="true" /><span>Credit pack</span></div>
                          <h3>{[b.horse, b.rider].filter(Boolean).join(' × ') || b.event_name || 'Bundle'}</h3>
                          <div className="my-data"><p>{b.event_name || '—'}</p><p>{l} of {t} left</p></div>
                          <div className="my-action"><p>Unlocks single photos</p><Link href="/events">Spend <Icon name="arrow" size={14} /></Link></div>
                        </article>
                      );
                    })}
                  </div>
                  <GalleryPager page={safePage} pages={pages} onPage={setPage} />
                  </>
                )}
              </>
            )
          )}
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function BuyCredits({ user }) {
  const [packs, setPacks] = useState(null);
  const [events, setEvents] = useState([]);
  const [packId, setPackId] = useState(null);
  const [eventId, setEventId] = useState(null);
  const [subjectId, setSubjectId] = useState(null);
  const [subjectName, setSubjectName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`${API}/api/credit-packs`).then((r) => r.json()).then((j) => setPacks((j.data || []).filter((p) => p.status === 'published'))).catch(() => setPacks([]));
    fetch(`${API}/events?limit=200`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
  }, []);
  useEffect(() => { if (user?.email) setEmail(user.email); }, [user?.email]);
  const pack = (packs || []).find((p) => String(p.id) === String(packId));
  const scopedEvent = pack?.event_id ? events.find((e) => e.id === pack.event_id) : null;
  const effectiveEvent = scopedEvent?.id || eventId;
  const searchSubject = async (v) => {
    if (!pack) return [];
    return searchSubjects(pack.scope_type, v);
  };
  const buy = async () => {
    setErr('');
    if (!pack || !effectiveEvent || !subjectId) { setErr('Pick a pack, event and rider or horse first.'); return; }
    if (!email.trim()) { setErr('Enter your email for delivery.'); return; }
    setBusy(true);
    try {
      const body = { pack_id: pack.id, event_id: effectiveEvent, email: email.trim(), return_base: window.location.origin,
        ...(pack.scope_type === 'horse' ? { horse_id: subjectId } : { rider_id: subjectId }),
        idempotency_key: newIdempotencyKey() };
      const res = await fetch(`${API}/api/credit-orders`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Checkout failed — try again.');
      if (!j.data?.checkout_url) throw new Error('Checkout already started — check your email for the payment link.');
      window.location.assign(stripeCheckoutUrl(j.data));
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  if (packs === null) return null;
  if (!packs.length) return null;
  return (
    <div className="my-card" style={{ marginBottom: 18, padding: 20 }}>
      <p className="eyebrow">Buy more credits</p>
      <h3 style={{ margin: '10px 0 16px' }}>Top up a pack, spend per photo.</h3>
      <div className="st-filters" style={{ margin: 0 }}>
        <SearchSelect options={packs.map((p) => ({ id: p.id, label: `${p.slots}-photo credits · ${p.scope_type} · $${(Number(p.price_cents) / 100).toFixed(0)}`, sub: p.event_name || 'Any event' }))}
          value={packId} onChange={(id) => { setPackId(id); setSubjectId(null); setSubjectName(''); }} placeholder="Pick a pack…" />
        {!scopedEvent && (
          <SearchSelect options={events.map((e) => ({ id: e.id, label: e.name }))} value={eventId}
            onChange={(id) => setEventId(id)} placeholder="Pick an event…" />
        )}
        {pack && (
          <SearchSelect options={[]} loadOptions={searchSubject} value={subjectId}
            selectedOption={subjectId ? { id: subjectId, label: subjectName } : null}
            onChange={(id, o) => { setSubjectId(id); setSubjectName(o?.label || ''); }}
            placeholder={`Type ${pack.scope_type} name…`} emptyHint={`Type at least 2 letters to search ${pack.scope_type}s`} />
        )}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for delivery" type="email" aria-label="Email"
          style={{ minHeight: 50, padding: '0 12px', background: '#0b0b0b', border: '1px solid #333', color: '#fff', fontSize: 14, minWidth: 200 }} />
        <button className="st-btn" disabled={busy || !pack || !effectiveEvent || !subjectId} onClick={buy}>
          {busy ? 'Opening checkout…' : 'Buy credits'}
        </button>
      </div>
      {err && <p className="auth-error" role="alert" style={{ marginTop: 12 }}>{safeError(err)}{' '}<Link href="/contact" style={{ color: '#fff', borderBottom: '1px solid #555' }}>Need help? Contact support</Link></p>}
      {pack && <p className="empty-note" style={{ marginTop: 12 }}>Unlock any {pack.slots} photos{scopedEvent ? ` at ${scopedEvent.name}` : ' at the chosen event'} — $ buys the whole bundle in one checkout.</p>}
    </div>
  );
}
