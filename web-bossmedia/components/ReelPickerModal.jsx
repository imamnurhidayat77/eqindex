'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import SmartImage from './SmartImage';
import ReelPlayer from './ReelPlayer';
import { useNotify } from './Toaster';
import { studio, studioFetch } from '../lib/studio';
import { fmtDay } from '../lib/studio-format.mjs';
import { useFocusTrap } from '../lib/focus-trap';
import { reelMatch, suggestedReels, MATCH_LABEL } from '../lib/reel-match.mjs';
import s from './ReelOrders.module.css';

const PAGE = 24;
const SUGGEST_LIMIT = 60;
const SEARCH_DEBOUNCE_MS = 250;
const STACKED_QUERY = '(max-width: 860px)'; // keep in sync with ReelOrders.module.css

const reelTitle = (m) => [m.horse, m.rider].filter(Boolean).join(' · ') || m.other_people || 'Untagged reel';

// One dialog for both linking the first reel and changing it later, so the
// admin always watches the cut before it reaches the buyer.
export default function ReelPickerModal({ order, onClose, onSave }) {
  const notify = useNotify();
  const rootRef = useRef(null);
  const bodyRef = useRef(null);
  const changing = !!order.media_id;
  const [suggested, setSuggested] = useState(null);
  const [others, setOthers] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);

  useFocusTrap(rootRef, { onClose });
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Suggestions: reels from the order's event plus reels tagged with its horse.
  useEffect(() => {
    const asks = [];
    if (order.event_id) asks.push(studio.get(`/admin/media?kind=reel&event_id=${encodeURIComponent(order.event_id)}&limit=${SUGGEST_LIMIT}`));
    if (order.horse_name) asks.push(studio.get(`/admin/media?kind=reel&q=${encodeURIComponent(order.horse_name)}&limit=${SUGGEST_LIMIT}`));
    Promise.all(asks)
      .then((lists) => {
        const list = suggestedReels(lists.flat().filter(Boolean), order);
        setSuggested(list);
        const current = order.media_id && list.find((m) => m.id === order.media_id);
        setPicked((p) => p || current || (!order.media_id && list.length === 1 ? list[0] : null));
      })
      .catch((e) => { setSuggested([]); notify(e.message, true); });
  }, [order, notify]);

  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const fetchPage = useCallback((after) => {
    const qs = new URLSearchParams({ kind: 'reel', limit: String(PAGE) });
    if (term) qs.set('q', term);
    if (after) qs.set('cursor', after);
    return studioFetch(`/admin/media?${qs}`);
  }, [term]);

  useEffect(() => {
    let live = true;
    setOthers(null);
    fetchPage(null)
      .then((j) => {
        if (!live) return;
        const list = j.data || [];
        setOthers(list);
        setCursor(j.next_cursor || null);
        if (order.media_id) setPicked((p) => p || list.find((m) => m.id === order.media_id) || null);
      })
      .catch((e) => { if (live) { setOthers([]); notify(e.message, true); } });
    return () => { live = false; };
  }, [fetchPage, order.media_id, notify]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const j = await fetchPage(cursor);
      setOthers((xs) => [...(xs || []), ...(j.data || [])]);
      setCursor(j.next_cursor || null);
    } catch (e) { notify(e.message, true); }
    setLoadingMore(false);
  }

  // On phones the preview sits above the list, so bring it into view.
  function pick(m) {
    setPicked(m);
    if (window.matchMedia(STACKED_QUERY).matches) bodyRef.current?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  async function save() {
    if (!picked || saving || picked.id === order.media_id) return;
    setSaving(true);
    try {
      await onSave(picked.id);
      onClose();
    } catch (e) { notify(e.message, true); setSaving(false); }
  }

  // With a search term the results stand alone. Without one, suggestions sit on
  // top and the rest of the library follows without repeating them.
  const suggestedIds = new Set((suggested || []).map((m) => m.id));
  const rest = term ? others : others && others.filter((m) => !suggestedIds.has(m.id));
  const pickedMatch = picked && reelMatch(picked, order);
  const context = [order.event_name, order.class_name, order.back_number && `No. ${order.back_number}`].filter(Boolean).join(' · ');

  const card = (m) => {
    const match = m.match || reelMatch(m, order);
    const isCurrent = m.id === order.media_id;
    return (
      <li key={m.id}>
        <button type="button" className={s.reel} aria-pressed={picked?.id === m.id} onClick={() => pick(m)}>
          <span className={s.reelThumb}>
            {m.thumb_url
              ? <SmartImage src={m.thumb_url} alt={`Reel thumbnail: ${reelTitle(m)}`} width={320} height={180} />
              : <span className={s.noThumb}>No thumbnail</span>}
            <span className={s.play} aria-hidden="true">▶</span>
            {isCurrent && <span className={s.current}>Linked now</span>}
          </span>
          <span className={s.reelText}>
            <strong>{reelTitle(m)}</strong>
            <span>{m.event_name || 'No event'}</span>
            {match && <span className={s.match} data-match={match}>{MATCH_LABEL[match]}</span>}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className={`st-modal ${s.overlay}`} ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="reel-picker-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.dialog} role="document">
        <header className={s.dialogHead}>
          <div>
            <p className="eyebrow">{order.status === 'delivered' ? 'Change delivered reel' : changing ? 'Change reel' : 'Link reel'}</p>
            <h3 id="reel-picker-title">Choose the reel for {order.horse_name || 'this order'}</h3>
            {context && <p className={s.context}>{context}</p>}
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className={s.body} ref={bodyRef}>
          <aside className={s.preview} aria-label="Preview">
            {picked ? (
              <>
                <div className={s.player}>
                  <ReelPlayer key={picked.id} src={picked.preview_url} poster={picked.thumb_url || null} label={`Preview: ${reelTitle(picked)}`} />
                </div>
                <div className={s.facts}>
                  <strong>{reelTitle(picked)}</strong>
                  <span>{picked.event_name || 'No event'}{picked.class_name ? ` · ${picked.class_name}` : ''}</span>
                  <span className={s.muted}>Uploaded {fmtDay(picked.created_at)}</span>
                </div>
                {pickedMatch
                  ? <p className={s.ok}>{MATCH_LABEL[pickedMatch]} as the order.</p>
                  : <p className={s.warn}>This reel is not tagged with the order&apos;s event or horse. Watch it to make sure it is {order.horse_name || 'the right horse'}.</p>}
              </>
            ) : (
              <div className={s.empty}>
                <span aria-hidden="true">▶</span>
                <p>Pick a reel to watch it here before you send it.</p>
              </div>
            )}
          </aside>

          <div className={s.browse}>
            <label className={s.search}>
              <span className={s.srOnly}>Search reels</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search horse, rider, event or class" autoComplete="off" />
            </label>

            {!term && (
              <section aria-labelledby="reel-suggested">
                <h4 id="reel-suggested" className={s.groupTitle}>Suggested for this order{suggested?.length ? ` (${suggested.length})` : ''}</h4>
                {suggested === null ? <p className={s.note}>Looking for matching reels…</p>
                  : !suggested.length ? <p className={s.note}>No reel is tagged with this order&apos;s event or horse yet. Tag the reel in Library, or search below.</p>
                  : <ul className={s.grid}>{suggested.map(card)}</ul>}
              </section>
            )}

            <section aria-labelledby="reel-rest">
              <h4 id="reel-rest" className={s.groupTitle}>{term ? `Results for “${term}”` : 'All other reels'}</h4>
              {rest === null ? <p className={s.note}>Loading reels…</p>
                : !rest.length ? <p className={s.note}>{term ? 'No reel matches that search.' : 'No other reels in the library.'}</p>
                : <ul className={s.grid}>{rest.map(card)}</ul>}
              {cursor && rest !== null && (
                <button type="button" className={`st-btn-ghost ${s.more}`} onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Show more reels'}
                </button>
              )}
            </section>
          </div>
        </div>

        <footer className={s.dialogFoot}>
          <button type="button" className="st-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="st-btn" onClick={save}
            disabled={!picked || saving || picked.id === order.media_id}>
            {saving ? 'Saving…' : picked && picked.id === order.media_id ? 'Already linked' : order.status === 'delivered' ? 'Send this version to buyer' : changing ? 'Change to this reel' : 'Link reel and mark ready'}
          </button>
        </footer>
      </div>
    </div>
  );
}
