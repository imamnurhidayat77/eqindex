'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import StudioShell, { Chip, Pager } from './studio';
import { useNotify } from './Toaster';
import ConfirmModal from './ConfirmModal';
import SearchSelect from './SearchSelect';
import TagModal from './TagModal';
import SmartImage from './SmartImage';
import { studio } from '../lib/studio';
import styles from './StudioLibrary.module.css';

const STATUSES = ['', 'draft', 'published', 'archived'];
const KINDS = ['', 'photo', 'reel'];
const LIMIT = 24;

export default function LibraryClient({ events, initial }) {
  const notify = useNotify();
  const [items, setItems] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initial.status);
  const [eventId, setEventId] = useState(initial.event_id);
  const [kind, setKind] = useState(initial.kind);
  const [untagged, setUntagged] = useState(initial.untagged);
  const [selected, setSelected] = useState(new Set());
  const [offset, setOffset] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const editing = (items || []).find((m) => m.id === editingId) || null;
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const p = new URLSearchParams({ limit: '200' });
    // Photographer's own shop assets only — community moments live in
    // Studio → Moments, never here (P3 source gate, enforced client-side).
    p.set('source', 'studio');
    if (status) p.set('status', status);
    if (eventId) p.set('event_id', eventId);
    if (kind) p.set('kind', kind);
    if (untagged) p.set('untagged', '1');
    studio.get(`/admin/media?${p}`).then((r) => { setItems(r || []); setSelected(new Set()); }).catch((e) => notify(e.message, true));
  }, [status, eventId, kind, untagged, notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOffset(0); }, [q, status, eventId, kind, untagged]);
  useEffect(() => { studio.get('/admin/license-tiers').then((r) => setTiers(r || [])).catch(() => {}); }, []);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items || [];
    return (items || []).filter((m) =>
      [m.horse, m.rider, m.event_name, m.class_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(s)));
  }, [items, q]);

  const drafts = (items || []).filter((m) => m.status === 'draft').length;
  const safeOffset = Math.min(offset, Math.max(0, (Math.ceil(visible.length / LIMIT) - 1) * LIMIT));
  const pageItems = visible.slice(safeOffset, safeOffset + LIMIT);

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

  // Select-all covers the page you can see. Selecting hidden pages is an explicit second step,
  // so a bulk Delete never touches assets the photographer did not look at.
  const allOnPage = pageItems.length > 0 && pageItems.every((m) => selected.has(m.id));
  const allVisible = visible.length > 0 && visible.every((m) => selected.has(m.id));
  const toggleAll = () => {
    if (busy) return;
    setSelected(allOnPage ? new Set() : new Set(pageItems.map((m) => m.id)));
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
        <button className="st-btn-ghost" onClick={toggleAll} disabled={busy || !pageItems.length}>{busy ? 'Working…' : allOnPage ? 'Clear selection' : `Select this page (${pageItems.length})`}</button>
        {allOnPage && !allVisible && visible.length > pageItems.length && (
          <button className="st-link" style={{ background: 'none', border: 0, padding: 0, color: '#bbb', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setSelected(new Set(visible.map((m) => m.id)))} disabled={busy}>
            Select all {visible.length} across pages
          </button>
        )}
        <button className="st-btn-ghost" disabled={!selected.size || busy} onClick={() => bulk({ status: 'published' }, 'publish')}>Publish ({selected.size})</button>
        <button className="st-btn-ghost" disabled={!selected.size || busy} onClick={() => bulk({ status: 'archived' }, 'archive')}>Archive</button>
        <button className="st-btn-ghost st-btn-danger" disabled={!selected.size || busy} onClick={() => selected.size && setConfirmDelete(true)}>Delete</button>
        <ConfirmModal open={confirmDelete} danger confirmLabel="Delete"
          title={`Delete ${selected.size} asset(s)?`}
          message="They leave the shop and the files are deleted. Sold items can’t be deleted, archive those instead. This can’t be undone."
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); bulk(null, 'delete'); }} />
        <span style={{ color: '#9a9a9a', fontSize: 12 }}>{items === null ? 'Loading…' : `${selected.size ? `${selected.size} selected · ` : ''}${visible.length} shown`}</span>
        {/* shortcut: the list loads the newest 200 only, move search + paging server-side when a studio passes that */}
        {items?.length === 200 && <span style={{ color: '#e0b96a', fontSize: 12 }}>Showing the newest 200. Use the filters to find older items.</span>}
      </div>
      {items !== null && !visible.length ? (
        <div className="event-media-empty">
          <p className="eyebrow">Nothing here</p>
          <h3>{untagged || status === 'draft' ? 'Triage complete.' : 'No media matches.'}</h3>
          <Link href="/studio/upload" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 12, color: '#bbb' }}>Upload a batch</Link>
        </div>
      ) : (
        <div className="st-media-grid">
          {pageItems.map((m) => (
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
      <Pager total={visible.length} limit={LIMIT} offset={safeOffset} onPage={setOffset} />
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
