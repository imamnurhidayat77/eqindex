'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, TABLE, TD, TH, NUM, INP, BTN_PRIMARY } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import DataTable from '../../../components/DataTable';
import EntityPicker from '../../../components/EntityPicker';

// Media Library — every photo/reel as admin datatable rows.
// Upload lives on /admin/media/upload. Tag via bulk bar or per-row Edit.
export default function AdminMediaLibrary() {
  const call = useAdminApi();
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  // filters
  const [fStatus, setFStatus] = useState('');
  const [fEvent, setFEvent] = useState('');
  const [fHorse, setFHorse] = useState(null);
  const [fRider, setFRider] = useState(null);
  const [fUntagged, setFUntagged] = useState(false);
  // selection + bulk
  const [selected, setSelected] = useState([]);
  const [bulkHorse, setBulkHorse] = useState(null);
  const [bulkRider, setBulkRider] = useState(null);
  const [bulkClass, setBulkClass] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkMoment, setBulkMoment] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [applying, setApplying] = useState(false);
  // candidate classes for the filtered event
  const [classes, setClasses] = useState([]);
  // edit modal
  const [editing, setEditing] = useState(null);
  const [eHorse, setEHorse] = useState(null);
  const [eRider, setERider] = useState(null);
  const [eClass, setEClass] = useState('');
  const [ePrice, setEPrice] = useState('');
  const [eMoment, setEMoment] = useState('');
  const [eStatus, setEStatus] = useState('');
  const [eEvent, setEEvent] = useState('');
  const [saving, setSaving] = useState(false);
  // sales strip
  const [totals, setTotals] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (fStatus) p.set('status', fStatus);
      if (fEvent) p.set('event_id', fEvent);
      if (fHorse) p.set('horse_id', fHorse.id);
      if (fRider) p.set('rider_id', fRider.id);
      if (fUntagged) p.set('untagged', '1');
      setRows(await call(`/admin/media?limit=200&${p}`) || []);
      setSelected([]);
    } catch (e) { setMsg(e.message); }
    setLoading(false);
  }
  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
    call('/admin/sales?limit=1').then((d) => setTotals(d.totals || null)).catch(() => {});
    try {
      const ev = new URLSearchParams(window.location.search).get('event');
      if (ev) { setFEvent(ev); setFStatus('draft'); }
    } catch { /* non-browser */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fStatus, fEvent, fHorse, fRider, fUntagged]);

  useEffect(() => {
    if (!fEvent) { setClasses([]); setBulkClass(''); return; }
    fetch(`${API}/admin/media/suggest-tags`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: fEvent }),
    }).then((r) => r.json()).then((j) => setClasses(j.data || [])).catch(() => setClasses([]));
    setBulkClass('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fEvent]);

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = (ids) => setSelected((s) => (s.length === ids.length ? [] : ids));

  async function applyTags() {
    if (!selected.length) { setMsg('Tick at least one photo first.'); return; }
    const body = {};
    if (bulkHorse) body.horse_id = bulkHorse.id;
    if (bulkRider) body.rider_id = bulkRider.id;
    if (bulkClass) body.class_id = bulkClass;
    if (bulkPrice !== '') body.price_cents = bulkPrice;
    if (bulkMoment) body.moment = bulkMoment;
    if (bulkStatus) body.status = bulkStatus;
    if (!Object.keys(body).length) { setMsg('Pick a horse, rider, class, price, moment or status first.'); return; }
    setApplying(true); setMsg('');
    let ok = 0, fail = 0, firstErr = '';
    for (const id of selected) {
      try { await call(`/admin/media/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); ok += 1; }
      catch (e) { fail += 1; if (!firstErr) firstErr = e.message; }
    }
    setMsg(`Applied to ${ok}/${selected.length}${fail ? ` (${fail} failed${firstErr ? `: ${firstErr}` : ''})` : ''}.`);
    setBulkHorse(null); setBulkRider(null); setBulkClass(''); setBulkPrice(''); setBulkMoment(''); setBulkStatus('');
    load();
    setApplying(false);
  }

  async function removeSelected() {
    if (!selected.length) return;
    if (!window.confirm(`Delete ${selected.length} photos permanently (files too)?`)) return;
    let ok = 0, fail = 0;
    for (const id of selected) {
      try { await call(`/admin/media/${id}`, { method: 'DELETE' }); ok += 1; }
      catch { fail += 1; }
    }
    setMsg(`Deleted ${ok}/${selected.length}${fail ? ` (${fail} blocked — paid purchases, archive instead)` : ''}.`);
    load();
  }

  async function removeOne(id) {
    if (!window.confirm('Delete this photo permanently (files too)?')) return;
    try { await call(`/admin/media/${id}`, { method: 'DELETE' }); setMsg('Deleted.'); load(); }
    catch (e) { setMsg(e.message); }
  }

  function openEdit(r) {
    setEditing(r);
    setEHorse(r.horse_id ? { id: r.horse_id, name: r.horse } : null);
    setERider(r.rider_id ? { id: r.rider_id, name: r.rider } : null);
    setEClass(r.class_id || '');
    setEPrice(r.price_cents ?? '');
    setEMoment(r.moment || '');
    setEStatus(r.status || 'draft');
    setEEvent(r.event_id || '');
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      await call(`/admin/media/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          horse_id: eHorse ? eHorse.id : null,
          rider_id: eRider ? eRider.id : null,
          class_id: eClass || null,
          price_cents: ePrice === '' ? null : ePrice,
          moment: eMoment || null,
          status: eStatus,
          event_id: eEvent || null,
        }),
      });
      setMsg(`Saved — ${eHorse?.name || '?'} × ${eRider?.name || '?'}.`);
      setEditing(null);
      load();
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  }

  function useCandidate(cls, pair) {
    setBulkHorse({ id: pair.horse_id, name: pair.horse });
    setBulkRider({ id: pair.rider_id, name: pair.rider });
    setBulkClass(cls.class_id);
    setMsg(`Picked ${pair.horse} × ${pair.rider} (${cls.name}) — tick photos, then Apply.`);
  }

  const nzd = (c) => (c === null || c === undefined ? '—' : `$${(Number(c) / 100).toFixed(2)}`);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className={H1}>Media Library</h1>
        <Link href="/admin/media/upload" className={`${BTN_PRIMARY} no-underline ml-auto`}>+ Upload photos</Link>
      </div>
      <p className={SUB}>Every photo & reel, filterable by event / horse / rider. Tick rows to tag in bulk, or Edit one by one.{totals ? ` · ${totals.sales} paid · $${(totals.gross_cents / 100).toFixed(2)} gross` : ''}</p>
      {msg && <section className={CARD}><p className="text-sm text-gold">{msg}</p></section>}

      {/* filters */}
      <section className={CARD}>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event
            <select value={fEvent} onChange={(e) => setFEvent(e.target.value)} className={`${INP} min-w-[200px]`}>
              <option value="">All events</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Horse
            <EntityPicker kind="horse" value={fHorse} onPick={setFHorse} placeholder="Filter by horse…" width={210} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Rider
            <EntityPicker kind="rider" value={fRider} onPick={setFRider} placeholder="Filter by rider…" width={210} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Status
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={INP}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select></label>
          <label className="flex items-center gap-1.5 text-[13px] text-muted pb-2">
            <input type="checkbox" checked={fUntagged} onChange={(e) => setFUntagged(e.target.checked)} /> Untagged only
          </label>
        </div>
      </section>

      {/* bulk bar */}
      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Tag selected {selected.length ? `(${selected.length})` : ''}</h2>
        <p className="text-[13px] text-muted mb-3">Tick rows below, pick horse & rider by name, then Apply. Or click a start-list candidate to fill this in.</p>
        <div className="grid gap-2.5 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Horse
            <EntityPicker kind="horse" value={bulkHorse} onPick={setBulkHorse} placeholder="Type horse name…" /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Rider
            <EntityPicker kind="rider" value={bulkRider} onPick={setBulkRider} placeholder="Type rider name…" /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Class
            <select value={bulkClass} onChange={(e) => setBulkClass(e.target.value)} className={INP} disabled={!fEvent}>
              <option value="">{fEvent ? 'Keep / no class' : 'Filter an event first'}</option>
              {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.name} ({c.rounds} rounds)</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Price (cents)
            <input value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} placeholder="e.g. 3500" inputMode="numeric" className={INP} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Moment
            <select value={bulkMoment} onChange={(e) => setBulkMoment(e.target.value)} className={INP}>
              <option value="">Keep</option>
              <option value="win">win</option>
              <option value="clear">clear</option>
              <option value="debut">debut</option>
              <option value="pb">pb</option>
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Status
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className={INP}>
              <option value="">Keep</option>
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select></label>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 mt-3">
          <button onClick={applyTags} disabled={applying || !selected.length} className={BTN_PRIMARY}>
            {applying ? 'Applying…' : `Apply to selected (${selected.length})`}
          </button>
          {!!selected.length && (
            <>
              <button onClick={() => setSelected([])} className="text-faint text-[13px] hover:text-white bg-none border-0 cursor-pointer">Clear</button>
              <button onClick={removeSelected} className="text-blood text-[13px] hover:underline bg-none border-0 cursor-pointer ml-auto">
                Delete selected ({selected.length})
              </button>
            </>
          )}
        </div>
        {!!classes.length && (
          <details className="mt-3">
            <summary className="text-[13px] text-sky cursor-pointer hover:underline">Start-list candidates for this event ({classes.length} classes)</summary>
            <div className="space-y-2 mt-2 max-h-[240px] overflow-y-auto pr-1">
              {classes.slice(0, 12).map((c) => (
                <div key={c.class_id} className="rounded border border-line bg-card2 p-2.5 text-[13px]">
                  <b>{c.name}</b>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {(c.candidates || []).slice(0, 8).map((p) => (
                      <button key={`${p.horse_id}-${p.rider_id}`} onClick={() => useCandidate(c, p)}
                        className={`rounded-full border px-2.5 py-1 text-[12px] cursor-pointer transition
                          ${bulkHorse?.id === p.horse_id && bulkRider?.id === p.rider_id
                            ? 'border-gold bg-goldbg text-gold font-bold' : 'border-line text-muted hover:text-white hover:border-gold/50'}`}>
                        {p.horse} × {p.rider}
                      </button>
                    ))}
                    {!(c.candidates || []).length && <span className="text-faint text-[12px]">No candidates yet — results not imported.</span>}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* datatable */}
      <section className={CARD}>
        <DataTable
          rows={rows}
          searchKeys={['horse', 'rider', 'event_name', 'class_name', 'status']}
          placeholder="Search this list…"
          initialPerPage={15}
          loading={loading}
          emptyText="No photos match these filters."
          tableMinWidth="860px"
          colSpan={8}
          thead={
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="border-b border-line px-2 py-2.5 font-semibold w-8">
                <input type="checkbox" checked={rows.length > 0 && selected.length === rows.length}
                  onChange={() => toggleAll(rows.map((r) => r.id))} title="Select all on this filter" />
              </th>
              <th className="border-b border-line px-2 py-2.5 font-semibold">Photo</th>
              <th className="border-b border-line px-2 py-2.5 font-semibold">Event</th>
              <th className="border-b border-line px-2 py-2.5 font-semibold">Horse × Rider</th>
              <th className="border-b border-line px-2 py-2.5 font-semibold">Class</th>
              <th className="border-b border-line px-2 py-2.5 font-semibold text-right">Price</th>
              <th className="border-b border-line px-2 py-2.5 font-semibold">Status</th>
              <th className="border-b border-line px-2 py-2.5 font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          }
          renderRow={(r) => (
            <tr key={r.id} className={`border-b border-rowline last:border-0 hover:bg-white/[0.02] ${selected.includes(r.id) ? 'bg-goldbg/20' : ''}`}>
              <td className="px-2 py-2"><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /></td>
              <td className="px-2 py-2">
                {r.thumb_url
                  ? <img src={r.thumb_url} alt="" loading="lazy" className="h-11 w-auto rounded border border-line" />
                  : <span className="text-faint text-xs">{r.kind}</span>}
              </td>
              <td className="px-2 py-2 text-muted text-[13px] max-w-[180px] truncate" title={r.event_name}>{r.event_name || '—'}</td>
              <td className="px-2 py-2 text-[13px]">
                {(r.horse || r.rider)
                  ? <><b className="text-white">{r.horse || '?'}</b><span className="text-faint"> × </span><b className="text-white">{r.rider || '?'}</b></>
                  : <span className="text-gold font-semibold">Untagged</span>}
              </td>
              <td className="px-2 py-2 text-muted text-[12px] max-w-[160px] truncate" title={r.class_name}>{r.class_name || '—'}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.price_cents ?? '—'}</td>
              <td className="px-2 py-2"><span className={`text-[11px] font-bold rounded px-1.5 py-0.5 ${r.status === 'published' ? 'bg-greenbg text-moss' : r.status === 'archived' ? 'bg-redbg text-blood' : 'bg-card2 text-faint border border-line'}`}>{r.status}</span></td>
              <td className="px-2 py-2 whitespace-nowrap text-right">
                <button onClick={() => openEdit(r)} className="text-sky text-[13px] hover:underline bg-none border-0 cursor-pointer mr-2">Edit</button>
                <button onClick={() => removeOne(r.id)} className="text-faint text-[13px] hover:text-blood bg-none border-0 cursor-pointer">Delete</button>
              </td>
            </tr>
          )}
        />
      </section>

      {/* edit modal */}
      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-[520px] rounded border border-line bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[16px] font-bold mb-1">Edit photo</h2>
            <p className="text-[13px] text-muted mb-4">{editing.event_name || 'Unsorted'} · {editing.kind}</p>
            {editing.thumb_url && <img src={editing.thumb_url} alt="" className="h-28 w-auto rounded border border-line mb-4" />}
            <div className="grid gap-2.5 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Horse
                <EntityPicker kind="horse" value={eHorse} onPick={setEHorse} placeholder="Type horse name…" /></label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Rider
                <EntityPicker kind="rider" value={eRider} onPick={setERider} placeholder="Type rider name…" /></label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event
                <select value={eEvent} onChange={(e) => setEEvent(e.target.value)} className={INP}>
                  <option value="">Unsorted</option>
                  {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select></label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Class
                {(eEvent || editing?.event_id) === fEvent && classes.length ? (
                  <select value={eClass} onChange={(e) => setEClass(e.target.value)} className={INP}>
                    <option value="">No class</option>
                    {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.name}</option>)}
                  </select>
                ) : (
                  <span className="text-[13px] text-muted normal-case py-2">{editing?.class_name || 'No class'} <button onClick={() => setEClass('')} className="text-faint text-[12px] hover:text-white bg-none border-0 cursor-pointer ml-1">clear</button></span>
                )}</label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Price (cents)
                <input value={ePrice} onChange={(e) => setEPrice(e.target.value)} inputMode="numeric" className={INP} /></label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Moment
                <select value={eMoment} onChange={(e) => setEMoment(e.target.value)} className={INP}>
                  <option value="">None</option>
                  <option value="win">win</option>
                  <option value="clear">clear</option>
                  <option value="debut">debut</option>
                  <option value="pb">pb</option>
                </select></label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Status
                <select value={eStatus} onChange={(e) => setEStatus(e.target.value)} className={INP}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select></label>
            </div>
            <div className="flex items-center gap-2.5 mt-4">
              <button onClick={saveEdit} disabled={saving} className={BTN_PRIMARY}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditing(null)} className="text-faint text-[13px] hover:text-white bg-none border-0 cursor-pointer">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  function openEdit(r) {
    setEditing(r);
    setEHorse(r.horse_id ? { id: r.horse_id, name: r.horse } : null);
    setERider(r.rider_id ? { id: r.rider_id, name: r.rider } : null);
    setEClass(r.class_id || '');
    setEPrice(r.price_cents ?? '');
    setEMoment(r.moment || '');
    setEStatus(r.status || 'draft');
    setEEvent(r.event_id || '');
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await call(`/admin/media/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          horse_id: eHorse ? eHorse.id : null,
          rider_id: eRider ? eRider.id : null,
          class_id: eClass || null,
          price_cents: ePrice === '' ? null : ePrice,
          moment: eMoment || null,
          status: eStatus,
          event_id: eEvent || null,
        }),
      });
      setMsg(`Saved — ${eHorse?.name || '?'} × ${eRider?.name || '?'}.`);
      setEditing(null);
      load();
    } catch (e) { setMsg(e.message); }
    setSaving(false);
  }

  async function removeOne(id) {
    if (!window.confirm('Delete this photo permanently (files too)?')) return;
    try { await call(`/admin/media/${id}`, { method: 'DELETE' }); setMsg('Deleted.'); load(); }
    catch (e) { setMsg(e.message); }
  }
}
