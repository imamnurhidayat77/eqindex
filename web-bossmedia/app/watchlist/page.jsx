'use client';
import SmartImage from '../../components/SmartImage';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { API } from '../../lib/api';
import { useAuthed } from '../../lib/use-authed';
import { useDocumentTitle } from '../../lib/use-document-title';
import { useToast } from '../../components/Toaster';
import PageShell from '../../components/PageShell';
import ReelPlayer from '../../components/ReelPlayer';
import MomentShareActions from '../../components/MomentShareActions';
import { uniqueById } from '../../lib/unique-by-id.mjs';
import { fmtDay } from '../../lib/format';
import {
  sortSections, countNew, cardCaption, readSeen, writeSeen, TYPE_LABEL,
} from '../../lib/watchlist-view.mjs';
import s from './watchlist.module.css';

const PHOTOS_PER_SECTION = 8;
const MOMENTS_PER_EVENT = 3;
const ALL = 'all';

const safeStorage = () => { try { return window.localStorage; } catch { return null; } };
const nzd = (cents) => `NZ$${(Number(cents) / 100).toFixed(cents % 100 ? 2 : 0)}`;

// Latest photos of one followed subject: shop photos, plus community
// moments for events (the near-live use case: grandparents following a show).
async function loadSection(w) {
  const p = new URLSearchParams({ limit: String(PHOTOS_PER_SECTION) });
  if (w.entity_type === 'horse') p.set('horse_id', w.entity_id);
  else if (w.entity_type === 'rider') p.set('rider_id', w.entity_id);
  else if (w.entity_type === 'event') p.set('event_id', w.entity_id);
  else {
    if (w.horse_id) p.set('horse_id', w.horse_id);
    if (w.rider_id) p.set('rider_id', w.rider_id);
  }
  try {
    const r = await fetch(`${API}/photos?${p}`, { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    const shop = Array.isArray(j?.data) ? j.data : [];
    if (w.entity_type !== 'event') return shop.slice(0, PHOTOS_PER_SECTION);
    const q = new URLSearchParams({ limit: String(MOMENTS_PER_EVENT), event_id: w.entity_id });
    const mr = await fetch(`${API}/api/moments?${q}`, { credentials: 'include' });
    const mj = await mr.json().catch(() => ({}));
    // Flag name must NOT collide with the media.moment column (win/clear/…)
    // that shop rows already carry — that collision once marked every
    // tagged shop photo as community.
    const moments = Array.isArray(mj?.data) ? mj.data.map((m) => ({ ...m, isCommunity: true })) : [];
    return [...moments, ...shop]
      .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))
      .slice(0, PHOTOS_PER_SECTION);
  } catch { return []; }
}

// Followed riders, horses and events, one scroll row each, newest first.
// New published photos also trigger a notification (see the publish hook).
export default function WatchlistPage() {
  useDocumentTitle('Watchlist');
  const toast = useToast();
  const { user, loading } = useAuthed();
  const [rows, setRows] = useState(null);
  const [shots, setShots] = useState(null);
  const [seen, setSeen] = useState({}); // last-visit snapshot, read once per load
  const [filter, setFilter] = useState(ALL);
  const [light, setLight] = useState(null); // index into flat, null = closed

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/watchlist`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => setRows(Array.isArray(j?.data) ? j.data : []));
  }, [user]);

  useEffect(() => {
    if (!rows?.length) return;
    let live = true;
    Promise.all(rows.map(async (w) => [w.id, await loadSection(w)])).then((pairs) => {
      if (!live) return;
      // Badges compare against the previous visit; then this visit becomes
      // the new baseline.
      const storage = safeStorage();
      setSeen(readSeen(storage));
      writeSeen(storage, rows.map((w) => w.id), Date.now());
      setShots(Object.fromEntries(pairs));
    });
    return () => { live = false; };
  }, [rows]);

  const unwatch = async (w) => {
    try {
      await fetch(`${API}/watchlist/${w.id}`, { method: 'DELETE', credentials: 'include' });
    } catch { /* removed locally regardless */ }
    setRows((xs) => (xs || []).filter((x) => x.id !== w.id));
    if (filter === w.id) setFilter(ALL);
    toast(`Unfollowed ${w.name || 'this subject'}`, { type: 'info' });
  };

  const sorted = rows && shots ? sortSections(rows, shots) : rows || [];
  const visible = filter === ALL ? sorted : sorted.filter((w) => w.id === filter);
  // Flat browsing order across the visible sections, in display order. The
  // lightbox walks this list so one viewer covers shop + moments. A photo
  // shown under several subjects (event + rider) appears once, first wins.
  const flat = uniqueById(visible.flatMap((w) => (shots?.[w.id] || []).map((x) => ({ ...x, rowName: w.name }))));
  const openLight = (id) => {
    const i = flat.findIndex((x) => x.id === id);
    if (i >= 0) setLight(i);
  };

  return (
    <PageShell eyebrow="Follow / Stable" title="Watchlist." wide
      intro="Events, riders and horses you follow. New photos are marked as they land.">
      {loading ? (
        <div className="event-media-empty"><p className="eyebrow">Loading…</p></div>
      ) : !user ? (
        <div className="event-media-empty">
          <p className="eyebrow">Members only</p>
          <h3>Follow your stable.</h3>
          <p>Get notified the moment their photos drop.</p>
          <p style={{ marginTop: 18 }}>
            <Link href="/login?next=/watchlist" className="primary-link">Sign in</Link>
          </p>
        </div>
      ) : rows === null || (rows.length > 0 && shots === null) ? (
        <div className="event-media-empty"><p className="eyebrow">Loading…</p></div>
      ) : !rows.length ? (
        <div className="event-media-empty">
          <p className="eyebrow">Nothing followed yet</p>
          <h3>Build your stable.</h3>
          <p>Hit Follow on any event, rider or horse page.</p>
          <p style={{ marginTop: 18 }}>
            <Link href="/events" className="primary-link">Browse galleries</Link>
          </p>
        </div>
      ) : (
        <>
          <div className={s.chips} role="group" aria-label="Filter by followed subject">
            <button type="button" className={s.chip} aria-pressed={filter === ALL} onClick={() => setFilter(ALL)}>All</button>
            {sorted.map((w) => (
              <button key={w.id} type="button" className={s.chip} aria-pressed={filter === w.id} onClick={() => setFilter(w.id)}>
                <span className={s.chipType}>{TYPE_LABEL[w.entity_type] || w.entity_type}</span>
                {w.name || 'Unnamed'}
              </button>
            ))}
          </div>
          <div className={s.sections}>
            {visible.map((w) => (
              <Section key={w.id} w={w} photos={shots[w.id] || []} lastSeen={seen[w.id]}
                onOpen={openLight} onUnfollow={() => unwatch(w)} />
            ))}
          </div>
        </>
      )}
      {light !== null && flat.length > 0 && (
        <Lightbox item={flat[Math.min(light, flat.length - 1)]} index={Math.min(light, flat.length - 1)} total={flat.length}
          flatList={flat}
          onJump={setLight}
          onPrev={() => setLight((i) => Math.max(0, i - 1))}
          onNext={() => setLight((i) => Math.min(flat.length - 1, i + 1))}
          onClose={() => setLight(null)} />
      )}
    </PageShell>
  );
}

function Section({ w, photos, lastSeen, onOpen, onUnfollow }) {
  const name = w.name || 'Unnamed';
  const fresh = countNew(photos, lastSeen);
  const viewAll = w.entity_type === 'event'
    ? `/moments?event_id=${w.entity_id}`
    : `/photos?q=${encodeURIComponent(w.name || '')}`;
  return (
    <section aria-label={`${name} photos`}>
      <div className={s.head}>
        <p className={s.type}>{TYPE_LABEL[w.entity_type] || w.entity_type}</p>
        <h3 className={s.name}>{name}</h3>
        {fresh > 0 && <span className={s.badge}>{fresh} new</span>}
        <span className={s.actions}>
          <Link href={viewAll} className="text-link">View all</Link>
          <OverflowMenu name={name} onUnfollow={onUnfollow} />
        </span>
      </div>
      {photos.length ? (
        <ul className={s.row} tabIndex={0} aria-label={`Latest photos of ${name}, scroll sideways`}>
          {photos.map((x) => (
            <li key={x.id}><PhotoCard x={x} onOpen={onOpen} /></li>
          ))}
        </ul>
      ) : (
        <p className={s.empty}>No published photos yet. We notify you the moment they drop.</p>
      )}
    </section>
  );
}

function PhotoCard({ x, onOpen }) {
  const caption = cardCaption(x);
  const date = x.taken_at || x.created_at;
  const meta = [x.class_name, date ? fmtDay(date) : null].filter(Boolean).join(' · ');
  const src = x.thumb_url || x.preview_url;
  return (
    <Link className={s.card} href={x.isCommunity ? `/moments/${x.id}` : `/p/${x.id}`}
      onClick={(e) => { e.preventDefault(); onOpen(x.id); }}>
      <span className={s.media}>
        {src
          ? <SmartImage src={src} alt={caption} width={520} height={390} sizes="260px" />
          : <span className={s.fallback}>Boss Media</span>}
        {x.kind === 'reel' && <i className={s.reel}>▶ Reel</i>}
      </span>
      <span className={s.body}>
        <span className={s.caption} title={caption}>{caption}</span>
        <span className={s.meta}>
          {x.isCommunity && <span className="st-chip">Community</span>}
          {meta && <span className={s.metaText}>{meta}</span>}
          {!x.isCommunity && Number(x.price_cents) > 0 && <span className={s.price}>From {nzd(x.price_cents)}</span>}
        </span>
      </span>
    </Link>
  );
}

// Three-dot menu holding Unfollow behind a confirm step, so a stray tap
// never drops a subject.
function OverflowMenu({ name, onUnfollow }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const box = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return;
    box.current?.querySelector('[role="menuitem"]')?.focus();
    const close = () => { setOpen(false); setConfirming(false); };
    const onDown = (e) => { if (!box.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') { close(); button.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, confirming]);

  return (
    <span ref={box}>
      <button ref={button} type="button" className={s.menuButton} aria-haspopup="menu" aria-expanded={open}
        aria-label={`More options for ${name}`} onClick={() => { setOpen((o) => !o); setConfirming(false); }}>⋯</button>
      {open && (
        <div className={s.menu} role="menu" aria-label={`Options for ${name}`}>
          {confirming ? (
            <>
              <p className={s.confirmText}>Stop following {name}? You will no longer be notified of new photos.</p>
              <div className={s.confirmRow}>
                <button type="button" role="menuitem" className={`${s.menuItem} ${s.danger}`}
                  onClick={() => { setOpen(false); onUnfollow(); }}>Unfollow</button>
                <button type="button" role="menuitem" className={s.menuItem}
                  onClick={() => { setOpen(false); setConfirming(false); button.current?.focus(); }}>Cancel</button>
              </div>
            </>
          ) : (
            <button type="button" role="menuitem" className={`${s.menuItem} ${s.danger}`}
              onClick={() => setConfirming(true)}>Unfollow…</button>
          )}
        </div>
      )}
    </span>
  );
}

// Full-screen viewer over the flat watchlist order: arrows + keyboard walk
// shop photos and community moments without leaving the page. Commerce stays
// on the detail pages (View & buy / View moment links below the caption).
function Lightbox({ item, index, total, flatList, onJump, onPrev, onNext, onClose }) {
  useEffect(() => {
    document.querySelector('[data-lb-active="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onPrev, onNext, onClose]);
  if (!item) return null;
  const caption = cardCaption(item);
  const href = item.isCommunity ? `/moments/${item.id}` : `/p/${item.id}`;
  return (
    <div role="dialog" aria-modal="true" aria-label={caption}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.92)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <button type="button" onClick={onClose} aria-label="Close viewer"
        style={{ position: 'absolute', top: 14, right: 14, width: 44, height: 44, borderRadius: '50%', border: '1px solid #555', background: 'transparent', color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
      <button type="button" onClick={onPrev} disabled={index <= 0} aria-label="Previous photo"
        style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: '1px solid #555', background: 'rgba(0,0,0,.5)', color: '#fff', fontSize: 20, cursor: 'pointer', opacity: index <= 0 ? 0.3 : 1 }}>‹</button>
      <button type="button" onClick={onNext} disabled={index >= total - 1} aria-label="Next photo"
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: '1px solid #555', background: 'rgba(0,0,0,.5)', color: '#fff', fontSize: 20, cursor: 'pointer', opacity: index >= total - 1 ? 0.3 : 1 }}>›</button>
      <div role="tablist" aria-label="All photos and videos"
        style={{ display: 'flex', gap: 8, justifyContent: 'safe center', overflowX: 'auto', maxWidth: 1100, width: '100%', padding: '4px 2px 10px', scrollbarWidth: 'thin' }}>
        {(flatList || []).map((x, i) => (
          <button key={x.id} type="button" role="tab" aria-selected={i === index} data-lb-active={i === index} aria-label={`Go to ${i + 1} of ${total}`}
            onClick={() => onJump(i)}
            style={{ flex: 'none', padding: 0, background: 'none', border: i === index ? '2px solid #fff' : '2px solid transparent', borderRadius: 6, cursor: 'pointer', opacity: i === index ? 1 : 0.55 }}>
            <span className="st-tagthumb" style={{ display: 'block' }}>
              {(x.thumb_url || x.preview_url)
                ? <SmartImage src={x.thumb_url || x.preview_url}
                  alt={`${[x.horse, x.rider].filter(Boolean).join(' · ') || x.event_name || `Photo ${i + 1}`}`}
                  width={128} height={96} sizes="128px" />
                : <span className="st-tagthumb-fallback">·</span>}
              {x.kind === 'reel' && <i>▶</i>}
            </span>
          </button>
        ))}
      </div>
      <figure style={{ margin: 0, maxWidth: 1100, width: '100%', display: 'grid', gap: 10, justifyItems: 'center' }}>
        {item.kind === 'reel' && item.preview_url ? (
          <div style={{ width: '100%', maxHeight: '72vh', overflow: 'hidden', borderRadius: 8 }}>
            <ReelPlayer src={item.preview_url} poster={item.thumb_url || null} label={caption} />
          </div>
        ) : (item.preview_url || item.thumb_url) ? (
          <SmartImage src={item.preview_url || item.thumb_url} alt={caption}
            width={item.width || 1600} height={item.height || 1000} sizes="100vw"
            style={{ width: '100%', height: 'auto', maxHeight: '72vh', objectFit: 'contain', borderRadius: 8 }} />
        ) : (
          <span className="cover-fallback">Boss Media</span>
        )}
        <figcaption style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center', color: '#bbb', fontSize: 13 }}>
          <span style={{ color: '#777' }}>{index + 1} of {total}</span>
          {item.isCommunity && <span className="st-chip">Community</span>}
          <strong style={{ color: '#fff', fontWeight: 600 }}>{caption}</strong>
          <Link href={href} className="text-link">{item.isCommunity ? 'View moment →' : 'View & buy →'}</Link>
        </figcaption>
        {item.isCommunity && (
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <MomentShareActions kind={item.kind} media={{
              media_id: item.id,
              thumb: item.preview_url || item.thumb_url || null,
              title: caption,
              sub: item.event_name || '',
              caption: `${caption}${item.event_name ? ` at ${item.event_name}` : ''} via BossMedia`,
            }} />
          </div>
        )}
      </figure>
    </div>
  );
}
