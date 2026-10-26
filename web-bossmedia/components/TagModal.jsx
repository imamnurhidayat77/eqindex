'use client';
import { useEffect, useState } from 'react';
import { Chip, useDialog } from './studio';
import { API } from '../lib/api';
import { studio } from '../lib/studio';
import SearchSelect from './SearchSelect';

// Shared tag & publish dialog — used by the Library grid and inline by the
// Upload page so photographers never have to leave the upload flow.
export default function TagModal({ m, events, tiers, notify, onClose, onSaved, onDeleted }) {
  const dialog = useDialog();
  const [ev, setEv] = useState(m.event_id || '');
  const [rider, setRider] = useState(m.rider || '');
  const [riderId, setRiderId] = useState(m.rider_id || '');
  const [horse, setHorse] = useState(m.horse || '');
  const [horseId, setHorseId] = useState(m.horse_id || '');
  const [others, setOthers] = useState(m.other_people || '');
  const [moment, setMoment] = useState(m.moment || '');
  const [tier, setTier] = useState(m.license_default || '');
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState(null);

  const searchPeople = (kind) => async (v) => {
    if (v.trim().length < 2) return [];
    try {
      const res = await fetch(`${API}/api/${kind}/search?q=${encodeURIComponent(v)}&limit=8`);
      const j = await res.json().catch(() => ({}));
      return (j.data || []).map((o) => ({ id: o.id, label: o.name }));
    } catch { return []; }
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', esc); };
  }, [onClose]);

  async function save() {
    setBusy(true);
    try {
      const body = { event_id: ev || null, rider_id: riderId || undefined, horse_id: horseId || undefined, other_people: others.trim() || null, moment: moment || null, license_default: tier || null };
      // Fall back to typed names only when no id picked: backend resolves slugs, not names.
      if (!riderId && rider) { notify('Pick a rider from the suggestions (names alone don’t resolve)', true); setBusy(false); return; }
      if (!horseId && horse) { notify('Pick a horse from the suggestions (names alone don’t resolve)', true); setBusy(false); return; }
      const u = await studio.patch(`/admin/media/${m.id}`, body);
      onSaved(u.data); notify('Saved'); onClose();
    } catch (e) { notify(e.message, true); }
    setBusy(false);
  }

  async function setStatus(status) {
    setBusy(true);
    try {
      const u = await studio.patch(`/admin/media/${m.id}`, { status });
      onSaved(u.data); notify(status === 'published' ? 'Published — live in the shop' : `Moved to ${status}`); onClose();
    } catch (e) { notify(e.message, true); }
    setBusy(false);
  }

  async function suggestMoment() {
    try {
      const j = await studio.post(`/admin/media/${m.id}/suggest-moment`, {});
      setSuggest(j.data || j);
    } catch (e) { notify(e.message, true); }
  }

  async function remove() {
    const ok = await dialog.confirm({ title: `Delete “${m.horse || m.rider || String(m.id).slice(0, 8)}”?`, message: 'This archives the files.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await studio.del(`/admin/media/${m.id}`); onDeleted(); notify('Deleted'); }
    catch (e) { notify(e.message, true); }
  }

  return (
    <div className="st-modal" role="dialog" aria-modal="true" aria-label="Tag and publish" onClick={onClose}>
      <div className="st-modal-card st-modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <header className="st-modal-head">
          <div className="st-modal-title">
            {m.thumb_url || m.preview_url
              ? <img src={m.thumb_url || m.preview_url} alt="" />
              : <span className="st-modal-thumb-fallback">No preview</span>}
            <div>
              <p className="eyebrow">Tag &amp; publish</p>
              <h3>{[m.horse, m.rider].filter(Boolean).join(' · ') || m.other_people || 'Untagged asset'}</h3>
              <small>{m.event_name || 'No event'} · <Chip status={m.status} /></small>
            </div>
          </div>
          <button type="button" className="st-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="st-modal-grid">
          <label>
            <span>Event (required to publish)</span>
            <SearchSelect
              options={[{ id: '', label: '— No event —' }, ...events.map((e) => ({ id: e.id, label: e.name }))]}
              value={ev || ''}
              onChange={(id) => setEv(id || '')}
              placeholder="Search events…" />
          </label>
          <label>
            <span>Rider</span>
            <SearchSelect
              options={[]}
              loadOptions={searchPeople('riders')}
              value={riderId || null}
              selectedOption={riderId ? { id: riderId, label: rider || 'Selected rider' } : null}
              onChange={(id, o) => { setRiderId(id || ''); setRider(o?.label || ''); }}
              placeholder="Type to search riders…"
              emptyHint="Type at least 2 letters to search riders" />
          </label>
          <label>
            <span>Horse</span>
            <SearchSelect
              options={[]}
              loadOptions={searchPeople('horses')}
              value={horseId || null}
              selectedOption={horseId ? { id: horseId, label: horse || 'Selected horse' } : null}
              onChange={(id, o) => { setHorseId(id || ''); setHorse(o?.label || ''); }}
              placeholder="Type to search horses…"
              emptyHint="Type at least 2 letters to search horses" />
          </label>
          <label>
            <span>Other people (judges, volunteers…)</span>
            <input value={others} onChange={(e) => setOthers(e.target.value)}
              placeholder="e.g. Judge S. Lee" maxLength={200} aria-label="Other people" />
          </label>
          <div className="st-modal-row">
            <label>
              <span>Moment</span>
              <SearchSelect
                options={[{ id: '', label: 'No moment' }, { id: 'win', label: 'Win' }, { id: 'clear', label: 'Clear' }, { id: 'debut', label: 'Debut' }, { id: 'pb', label: 'PB' }]}
                value={moment || ''}
                onChange={(id) => setMoment(id || '')}
                placeholder="Moment"
                clearable={false} />
            </label>
            <label>
              <span>Tier</span>
              <SearchSelect
                options={[{ id: '', label: 'Default' }, ...tiers.map((t) => ({ id: t.id, label: t.label }))]}
                value={tier || ''}
                onChange={(id) => setTier(id || '')}
                placeholder="Tier"
                clearable={false} />
            </label>
          </div>
        </div>
        {suggest && (
          <p className="st-suggest">
            Suggested: <b>{suggest.suggested || 'none'}</b>{suggest.reasons?.length ? ` — ${suggest.reasons.join(', ')}` : ''}
            {suggest.suggested && <button type="button" onClick={() => setMoment(suggest.suggested)}>Apply</button>}
          </p>
        )}
        <footer className="st-modal-foot">
          <button type="button" className="st-btn" disabled={busy} onClick={save}>Save</button>
          <button type="button" className="st-btn-ghost" onClick={suggestMoment}>Suggest moment</button>
          {m.status !== 'published'
            ? <button type="button" className="st-btn-ghost" disabled={busy} onClick={() => setStatus('published')}>Publish</button>
            : <button type="button" className="st-btn-ghost" disabled={busy} onClick={() => setStatus('archived')}>Unpublish</button>}
          <button type="button" className="st-btn-ghost st-btn-danger" onClick={remove}>Delete</button>
        </footer>
      </div>
    </div>
  );
}
