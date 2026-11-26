'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StudioShell, { Chip } from './studio';
import { useNotify } from './Toaster';
import ConfirmModal from './ConfirmModal';
import SearchSelect from './SearchSelect';
import TagModal from './TagModal';
import SmartImage from './SmartImage';
import { studio, studioFetch } from '../lib/studio';
import { writeQuery } from '../lib/url-state.mjs';
import { uniqueById } from '../lib/unique-by-id.mjs';
import styles from './StudioLibrary.module.css';

const STATUSES = ['', 'draft', 'published', 'archived'];
const KINDS = ['', 'photo', 'reel'];
const PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 300;

export default function LibraryClient({ events, initial }) {
  const notify = useNotify();
  const [items, setItems] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [drafts, setDrafts] = useState(0);
  const [tiers, setTiers] = useState([]);
  const [q, setQ] = useState(initial.q);
  const [term, setTerm] = useState(initial.q);
  const [status, setStatus] = useState(initial.status);
  const [eventId, setEventId] = useState(initial.event_id);
  const [kind, setKind] = useState(initial.kind);
  const [untagged, setUntagged] = useState(initial.untagged);
  const [selected, setSelected] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const editing = (items || []).find((m) => m.id === editingId) || null;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // Server does search, filters and paging (keyset cursor), so every asset is
  // reachable no matter how many a studio has. Filters mirror into the URL.
  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE) });
    // Photographer's own shop assets only — community moments live in
    // Studio → Moments, never here (P3 source gate).
    p.set('source', 'studio');
    if (term) p.set('q', term);
    if (status) p.set('status', status);
    if (eventId) p.set('event_id', eventId);
    if (kind) p.set('kind', kind);
    if (untagged) p.set('untagged', '1');
    return p.toString();
  }, [term, status, eventId, kind, untagged]);

  const queryRef = useRef(query);
  queryRef.current = query;

  const load = useCallback(() => {
    writeQuery({ q: term, status, event_id: eventId, kind, untagged: untagged ? '1' : '' });
    let live = true;
    setItems(null);
    studioFetch(`/admin/media?${query}`).then((j) => {
      if (!live) return;
      setItems(j.data || []); setNextCursor(j.next_cursor || null); setSelected(new Set());
    }).catch((e) => notify(e.message, true));
    studio.get('/admin/media/stats').then((st) => live && setDrafts(st?.drafts || 0)).catch(() => {});
    return () => { live = false; };
  }, [query, term, status, eventId, kind, untagged, notify]);
  useEffect(() => load(), [load]);
  useEffect(() => { studio.get('/admin/license-tiers').then((r) => setTiers(r || [])).catch(() => {}); }, []);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const j = await studioFetch(`/admin/media?${query}&cursor=${encodeURIComponent(nextCursor)}`);
      if (queryRef.current !== query) return; // filters changed mid-request
      setItems((xs) => uniqueById([...(xs || []), ...(j.data || [])]));
      setNextCursor(j.next_cursor || null);
    } catch (e) { notify(e.message, true); } finally { setLoadingMore(false); }
  }

  const visible = items || [];

  async function patchOne(id, body) {
    const updated = await studio.patch(`/admin/media/${id}`, body);
    setItems((xs) => (xs || []).map((m) => (m.id === id ? { ...m, ...updated.data } : m)));
    return updated.data;
  }

  // Delete confirmation is local state driving <ConfirmModal/> directly —
  // no dialog context in the path, so it cannot fail silently.
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setConfirmDelete(false); }, [selected]);

  async function bulk(patch, label) {
    // Snapshot the selection: filter changes reload items + clear selection,
    // and that must not shrink a run already in flight.
    const ids = [...selected];
    if (!ids.length || busy) return;
    setBusy(true);
    let ok = 0; const fails = [];
    for (const id of ids) {
      try {
        if (label === 'delete') { await studio.del(`/admin/media/${id}`); setItems((xs) => (xs || []).filter((m) => m.id !== id)); }
        else await patchOne(id, patch);
        ok++;
      } catch (e) { fails.push(e.message); }
    }
    setBusy(false); setSelected(new Set());
    notify(fails.length ? `${ok} updated, ${fails.length} failed — ${fails[0]}` : `${ok} asset(s) ${label}d`, fails.length > 0);
    if (label === 'delete') load();
  }

  // Select-all covers only what is loaded on screen, so a bulk Delete never
  // touches assets the photographer did not look at.
  const allLoaded = visible.length > 0 && visible.every((m) => selected.has(m.id));
  const toggleAll = () => {
    if (busy) return;
    setSelected(allLoaded ? new Set() : new Set(visible.map((m) => m.id)));
  };

  return (
    <StudioShell active="library" kpis={{ library: drafts }}>
      <div className="st-filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search horse, rider, class…" aria-label="Search media" disabled={busy} />
        <SearchSelect
          options={[{ id: '', label: 'All statuses' }, { id: 'draft', label: 'Draft' }, { id: 'published', label: 'Published' }, { id: 'archived', label: 'Archived' }]}
          value={status} onChange={(v) => setStatus(v || '')} placeholder="Status" disabled={busy} />
        <SearchSelect
          options={[{ id: '', label: 'All events' }, ...(events || []).map((e) => ({ id: e.id, label: e.name }))]}
          value={eventId} onChange={(v) => setEventId(v || '')} placeholder="Event" disabled={busy} />
        <SearchSelect
          options={[{ id: '', label: 'Photo + reel' }, { id: 'photo', label: 'Photos' }, { id: 'reel', label: 'Reels' }]}
          value={kind} onChange={(v) => setKind(v || '')} placeholder="Kind" disabled={busy} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#aaa', fontSize: 13 }}>
          <input type="checkbox" checked={untagged} onChange={(e) => setUntagged(e.target.checked)} style={{ accentColor: '#fff' }} disabled={busy} />
          Untagged only
        </label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <button className="st-btn-ghost" onClick={toggleAll} disabled={busy || !visible.length}>{busy ? 'Working…' : allLoaded ? 'Clear selection' : `Select all loaded (${visible.length})`}</button>
        <button className="st-btn-ghost" disabled={!selected.size || busy} onClick={() => bulk({ status: 'published' }, 'publish')}>Publish ({selected.size})</button>
        <button className="st-btn-ghost" disabled={!selected.size || busy} onClick={() => bulk({ status: 'archived' }, 'archive')}>Archive</button>
        <button className="st-btn-ghost st-btn-danger" disabled={!selected.size || busy} onClick={() => selected.size && setConfirmDelete(true)}>Delete</button>
        <ConfirmModal open={confirmDelete} danger confirmLabel="Delete"
          title={`Delete ${selected.size} asset(s)?`}
          message="They leave the shop and the files are deleted. Sold items can’t be deleted, archive those instead. This can’t be undone."
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); bulk(null, 'delete'); }} />
        <span style={{ color: '#9a9a9a', fontSize: 12 }}>{items === null ? 'Loading…' : `${selected.size ? `${selected.size} selected · ` : ''}${visible.length} shown${nextCursor ? ', more below' : ''}`}</span>
      </div>
      {items !== null && !visible.length ? (
        <div className="event-media-empty">
          <p className="eyebrow">Nothing here</p>
          <h3>{untagged || status === 'draft' ? 'Triage complete.' : 'No media matches.'}</h3>
          <Link href="/studio/upload" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 12, color: '#bbb' }}>Upload a batch</Link>
        </div>
      ) : (
        <div className="st-media-grid">
          {visible.map((m) => (
            <ItemCard
              key={m.id} m={m}
              checked={selected.has(m.id)}
              disabled={busy}
              onCheck={(on) => { if (busy) return; setSelected((s) => { const n = new Set(s); on ? n.add(m.id) : n.delete(m.id); return n; }); }}
              onOpen={() => setEditingId(m.id)}
            />
          ))}
        </div>
      )}
      {nextCursor && items !== null && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
          <button type="button" className="st-btn-ghost" onClick={loadMore} disabled={loadingMore || busy} aria-busy={loadingMore}>
            {loadingMore ? 'Loading…' : `Load ${PAGE_SIZE} more`}
          </button>
        </div>
      )}
      {editing && (
        <TagModal key={editing.id} m={editing} events={events} tiers={tiers} notify={notify}
          onClose={() => setEditingId(null)}
          onSaved={(u) => setItems((xs) => (xs || []).map((x) => (x.id === editing.id ? { ...x, ...u } : x)))}
          onDeleted={() => { setItems((xs) => (xs || []).filter((x) => x.id !== editing.id)); setEditingId(null); }} />
      )}
    </StudioShell>
  );
}

function ItemCard({ m, checked, disabled, onCheck, onOpen }) {
  const title = [m.horse, m.rider].filter(Boolean).join(' · ') || m.other_people || 'Untagged';
  const sold = Number(m.purchase_count) || 0;
  return (
    <article className="st-media-card">
      <input type="checkbox" className="sel" checked={checked} disabled={disabled} onChange={(e) => onCheck(e.target.checked)} aria-label={`Select ${title}`} />
      <button type="button" className={styles.thumb} onClick={onOpen} aria-label={`Edit ${title}`}>
        {m.thumb_url || m.preview_url ? <SmartImage src={m.thumb_url || m.preview_url} alt={`${title}${m.event_name ? ` at ${m.event_name}` : ''}`} width={800} height={600} sizes="(max-width: 768px) 50vw, 25vw" /> : <span className="cover-fallback">No preview</span>}
        {m.kind === 'reel' && <span className={styles.play} aria-hidden="true">▶ Reel</span>}
      </button>
      <footer>
        <span><Chip status={m.status} /></span>
        <strong>{title}</strong>
        <span>{m.event_name || 'No event'}{sold ? ` · ${sold} sold` : ''}</span>
        <button className="st-link" style={{ background: 'none', border: 0, borderBottom: '1px solid #555', padding: 0, paddingBottom: 3, cursor: 'pointer', justifySelf: 'start', marginTop: 4, color: '#bbb', fontSize: 12 }} onClick={onOpen}>
          {m.status === 'published' ? 'Edit details' : 'Tag & publish'}
        </button>
      </footer>
    </article>
  );
}
