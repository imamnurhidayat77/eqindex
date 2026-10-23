'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import StudioShell, { Chip, Pager, useDialog, useToast } from './studio';
import SearchSelect from './SearchSelect';
import TagModal from './TagModal';
import { studio } from '../lib/studio';

const STATUSES = ['', 'draft', 'published', 'archived'];
const KINDS = ['', 'photo', 'reel'];
const LIMIT = 24;

export default function LibraryClient({ events, initial }) {
  const notify = useToast();
  const dialog = useDialog();
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

  const load = () => {
    const p = new URLSearchParams({ limit: '200' });
    if (status) p.set('status', status);
    if (eventId) p.set('event_id', eventId);
    if (kind) p.set('kind', kind);
    if (untagged) p.set('untagged', '1');
    studio.get(`/admin/media?${p}`).then((r) => { setItems(r || []); setSelected(new Set()); }).catch((e) => notify(e.message, true));
  };
  useEffect(load, [status, eventId, kind, untagged]); // eslint-disable-line react-hooks/exhaustive-deps
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

  async function bulk(patch, label) {
    if (!selected.size) return;
    if (label === 'delete') {
      const ok = await dialog.confirm({ title: `Delete ${selected.size} asset(s)?`, message: 'Files are archived and leave the shop. This can’t be undone.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
    }
    setBusy(true);
    let ok = 0; const fails = [];
    for (const id of selected) {
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

  const allVisible = visible.length > 0 && visible.every((m) => selected.has(m.id));
  const toggleAll = () => {
    if (allVisible) setSelected(new Set());
    else setSelected(new Set(visible.map((m) => m.id)));
  };

  return (
    <StudioShell active="library" kpis={{ library: drafts }}>
      <div className="st-filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search horse, rider, class…" aria-label="Search media" />
        <SearchSelect
          options={[{ id: '', label: 'All statuses' }, { id: 'draft', label: 'Draft' }, { id: 'published', label: 'Published' }, { id: 'archived', label: 'Archived' }]}
          value={status} onChange={(v) => setStatus(v || '')} placeholder="Status" />
        <SearchSelect
          options={[{ id: '', label: 'All events' }, ...(events || []).map((e) => ({ id: e.id, label: e.name }))]}
          value={eventId} onChange={(v) => setEventId(v || '')} placeholder="Event" />
        <SearchSelect
          options={[{ id: '', label: 'Photo + reel' }, { id: 'photo', label: 'Photos' }, { id: 'reel', label: 'Reels' }]}
          value={kind} onChange={(v) => setKind(v || '')} placeholder="Kind" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#aaa', fontSize: 13 }}>
          <input type="checkbox" checked={untagged} onChange={(e) => setUntagged(e.target.checked)} style={{ accentColor: '#fff' }} />
          Untagged only
        </label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <button className="st-btn-ghost" onClick={toggleAll}>{allVisible ? 'Deselect all' : `Select all (${visible.length})`}</button>
        <button className="st-btn-ghost" disabled={!selected.size || busy} onClick={() => bulk({ status: 'published' }, 'publish')}>Publish ({selected.size})</button>
        <button className="st-btn-ghost" disabled={!selected.size || busy} onClick={() => bulk({ status: 'archived' }, 'archive')}>Archive</button>
        <button className="st-btn-ghost st-btn-danger" disabled={!selected.size || busy} onClick={() => bulk(null, 'delete')}>Delete</button>
        <span style={{ color: '#777', fontSize: 12 }}>{items === null ? 'Loading…' : `${visible.length} shown`}</span>
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
              onCheck={(on) => setSelected((s) => { const n = new Set(s); on ? n.add(m.id) : n.delete(m.id); return n; })}
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

function ItemCard({ m, checked, onCheck, onOpen }) {
  return (
    <article className="st-media-card">
      <input type="checkbox" className="sel" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label="Select asset" />
      {m.thumb_url || m.preview_url ? <img src={m.thumb_url || m.preview_url} alt="" loading="lazy" /> : <span className="cover-fallback">No preview</span>}
      <footer>
        <span><Chip status={m.status} /> {m.kind === 'reel' && <Chip status="reel" />}</span>
        <strong>{[m.horse, m.rider].filter(Boolean).join(' · ') || 'Untagged'}</strong>
        <span>{m.event_name || 'No event'} · 👁 {m.view_count || 0} · 🛒 {m.purchase_count || 0}</span>
        <button className="st-link" style={{ background: 'none', border: 0, borderBottom: '1px solid #555', padding: 0, paddingBottom: 3, cursor: 'pointer', justifySelf: 'start', marginTop: 4, color: '#bbb', fontSize: 12 }} onClick={onOpen}>
          Tag &amp; publish
        </button>
      </footer>
    </article>
  );
}


