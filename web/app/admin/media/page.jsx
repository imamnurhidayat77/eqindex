'use client';
import { useEffect, useRef, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, INP, BTN_PRIMARY } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';

// Searchable picker (horse / rider): type a name, pick from matches.
// Returns the picked {id, name} — never asks the user for UUIDs/slugs.
function EntityPicker({ kind, value, onPick, placeholder }) {
  const call = useAdminApi();
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState([]);
  const [open, setOpen] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);

  function search(v) {
    setQ(v);
    clearTimeout(t.current);
    if (v.trim().length < 2) { setOpts([]); setOpen(false); return; }
    t.current = setTimeout(async () => {
      try {
        const d = await call(`/admin/${kind === 'horse' ? 'horses' : 'riders'}?q=${encodeURIComponent(v.trim())}`);
        setOpts((d || []).slice(0, 8));
        setOpen(true);
      } catch { setOpts([]); }
    }, 250);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <input
          value={value ? value.name : q}
          onChange={(e) => { onPick(null); search(e.target.value); }}
          onFocus={() => { if (opts.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className={`${INP} w-full !text-[13px] ${value ? '!border-moss/60' : ''}`}
        />
        {value && (
          <button onClick={() => { onPick(null); setQ(''); }} title="Clear"
            className="text-faint hover:text-white bg-none border-0 cursor-pointer text-[14px] shrink-0">✕</button>
        )}
      </div>
      {open && !!opts.length && !value && (
        <div className="absolute z-20 mt-1 w-full max-h-[220px] overflow-y-auto rounded border border-line bg-card2 shadow-xl">
          {opts.map((o) => (
            <button key={o.id} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick({ id: o.id, name: o.name }); setOpen(false); setQ(''); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-white/5">
              <span className="truncate font-semibold text-white">{o.name}</span>
              <span className="text-[11px] text-faint shrink-0 ml-2">{o.starts ?? ''} rounds</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminMedia() {
  const call = useAdminApi();
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [upEvent, setUpEvent] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // review filters
  const [fStatus, setFStatus] = useState('draft');
  const [fEvent, setFEvent] = useState('');
  const [fUntagged, setFUntagged] = useState(true);
  // bulk tagging
  const [selected, setSelected] = useState([]);
  const [bulkHorse, setBulkHorse] = useState(null);
  const [bulkRider, setBulkRider] = useState(null);
  const [bulkClass, setBulkClass] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkMoment, setBulkMoment] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [applying, setApplying] = useState(false);
  // suggestions
  const [classes, setClasses] = useState([]);
  const [sgTaken, setSgTaken] = useState('');
  const [sales, setSales] = useState([]);
  const [totals, setTotals] = useState(null);

  async function load() {
    try {
      const p = new URLSearchParams();
      if (fStatus) p.set('status', fStatus);
      if (fEvent) p.set('event_id', fEvent);
      if (fUntagged) p.set('untagged', '1');
      setRows(await call(`/admin/media?limit=100&${p}`) || []);
      setSelected([]);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fStatus, fEvent, fUntagged]);
  useEffect(() => {
    call('/admin/sales?limit=50').then((d) => { setSales(d.data || []); setTotals(d.totals || null); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // candidate classes for the active event (powers the class dropdown + suggestions)
  async function loadClasses(eventId, taken) {
    if (!eventId) { setClasses([]); return; }
    try {
      const r = await fetch(`${API}/admin/media/suggest-tags`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, taken_at: taken || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setClasses(j.data || []);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => { setBulkClass(''); loadClasses(fEvent || upEvent, sgTaken); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fEvent, upEvent]);

  async function upload() {
    if (!files.length) { setMsg('Pick files first.'); return; }
    setBusy(true); setMsg('');
    try {
      const fd = new FormData();
      if (upEvent) fd.append('event_id', upEvent);
      for (const f of files) fd.append('files', f);
      const res = await fetch(`${API}/admin/media/upload`, { method: 'POST', credentials: 'include', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      const ok = (j.data || []).filter((x) => x.ok).length;
      setMsg(`Step 1 done — uploaded ${ok}/${(j.data || []).length}. Now select photos below and tag them (step 2).`);
      setFiles([]);
      if (upEvent) setFEvent(upEvent);
      setFStatus('draft'); setFUntagged(true);
      load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allIds = rows.map((r) => r.id);
  const allSel = rows.length > 0 && selected.length === rows.length;

  async function applyTags() {
    if (!selected.length) { setMsg('Select at least one photo first.'); return; }
    if (!bulkHorse && !bulkRider && !bulkClass && !bulkPrice && !bulkMoment && !bulkStatus) {
      setMsg('Pick a horse, rider, class, price, moment or status to apply.'); return;
    }
    setApplying(true); setMsg('');
    const body = {};
    if (bulkHorse) body.horse_id = bulkHorse.id;
    if (bulkRider) body.rider_id = bulkRider.id;
    if (bulkClass) body.class_id = bulkClass;
    if (bulkPrice !== '') body.price_cents = bulkPrice === '' ? undefined : bulkPrice;
    if (bulkMoment) body.moment = bulkMoment;
    if (bulkStatus) body.status = bulkStatus;
    let ok = 0, fail = 0;
    for (const id of selected) {
      try {
        await call(`/admin/media/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        ok += 1;
      } catch { fail += 1; }
    }
    setMsg(`Tagged ${ok}/${selected.length}${fail ? ` (${fail} failed)` : ''} — ${bulkHorse?.name || '?'} × ${bulkRider?.name || '?'}.`);
    setBulkHorse(null); setBulkRider(null); setBulkClass(''); setBulkPrice(''); setBulkMoment('');
    load();
    setApplying(false);
  }

  function useCandidate(cls, pair) {
    setBulkHorse({ id: pair.horse_id, name: pair.horse });
    setBulkRider({ id: pair.rider_id, name: pair.rider });
    setBulkClass(cls.class_id);
    setMsg(`Picked ${pair.horse} × ${pair.rider} (${cls.name}) — now select photos and press "Apply to selected".`);
  }

  async function createPackage() {
    try {
      if (!bulkHorse && !bulkRider) { setMsg('Pick a horse or rider in step 2 first, then create the package.'); return; }
      const evId = fEvent || upEvent;
      if (!evId) { setMsg('Pick the event (filter above) first.'); return; }
      const body = { event_id: evId };
      if (bulkHorse) body.horse_id = bulkHorse.id; else body.rider_id = bulkRider.id;
      const pk = await call('/admin/packages', { method: 'POST', body: JSON.stringify(body) });
      setMsg(`Package created: ${pk.title} (${pk.items} photos).`);
    } catch (e) { setMsg(e.message); }
  }

  const nzd = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
  const tagLabel = (r) => [r.horse, r.rider].filter(Boolean).join(' × ') || 'Untagged';

  return (
    <>
      {!!sales.length && (
        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-2">Recent sales</h2>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="border-b border-line px-2 py-2 font-semibold">When</th>
              <th className="border-b border-line px-2 py-2 font-semibold">Buyer</th>
              <th className="border-b border-line px-2 py-2 font-semibold">Item</th>
              <th className="border-b border-line px-2 py-2 font-semibold text-right">Amount</th>
              <th className="border-b border-line px-2 py-2 font-semibold">Status</th>
            </tr></thead>
            <tbody>
              {sales.slice(0, 10).map((s) => (
                <tr key={s.id} className="border-b border-rowline last:border-0">
                  <td className="px-2 py-2 text-muted text-[12px]">{String(s.created_at).slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-2 py-2">{s.buyer_email}</td>
                  <td className="px-2 py-2 text-muted text-[12px]">{s.package_title || [s.horse, s.rider].filter(Boolean).join(' × ') || s.event_name || s.media_id?.slice(0, 8)}</td>
                  <td className="px-2 py-2 text-right">{nzd(s.amount_cents)}</td>
                  <td className="px-2 py-2">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}
      <h1 className={H1}>Media</h1>
      <p className={SUB}>Sell photos in 3 steps: <b className="text-body">1. Upload → 2. Tag horse & rider → 3. Price & publish.</b>{totals ? ` · ${totals.sales} paid · $${(totals.gross_cents / 100).toFixed(2)} gross` : ''}</p>
      {msg && <section className={CARD}><p className="text-sm text-gold">{msg}</p></section>}

      {/* STEP 1 */}
      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Step 1 — Upload</h2>
        <p className="text-[13px] text-muted mb-3">Pick the event, drop the files. Photos land as drafts below.</p>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event
            <select value={upEvent} onChange={(e) => setUpEvent(e.target.value)} className={`${INP} min-w-[220px]`}>
              <option value="">Unsorted (tag later)</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Files (≤15MB each, ≤20)
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              onChange={(e) => setFiles([...e.target.files])} className="text-sm text-muted" /></label>
          <button onClick={upload} disabled={busy || !files.length} className={BTN_PRIMARY}>
            {busy ? 'Uploading…' : `Upload ${files.length ? `(${files.length})` : ''}`}
          </button>
        </div>
      </section>

      {/* STEP 2 */}
      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Step 2 — Tag the selected photos {selected.length ? `(${selected.length})` : ''}</h2>
        <p className="text-[13px] text-muted mb-3">Tick photos below, pick the <b className="text-body">horse</b> and <b className="text-body">rider</b> by name, then Apply. Or click a candidate in step 2b.</p>
        <div className="grid gap-2.5 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Horse
            <EntityPicker kind="horse" value={bulkHorse} onPick={setBulkHorse} placeholder="Type horse name… (min 2 letters)" /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Rider
            <EntityPicker kind="rider" value={bulkRider} onPick={setBulkRider} placeholder="Type rider name… (min 2 letters)" /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Class (from this event)
            <select value={bulkClass} onChange={(e) => setBulkClass(e.target.value)} className={INP}>
              <option value="">No class / keep</option>
              {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.name} ({c.rounds} rounds)</option>)}
            </select></label>
          <div className="flex items-end gap-2.5">
            <button onClick={applyTags} disabled={applying || !selected.length} className={BTN_PRIMARY}>
              {applying ? 'Applying…' : `Apply to selected (${selected.length})`}
            </button>
            {!!selected.length && (
              <button onClick={() => setSelected([])} className="text-faint text-[13px] hover:text-white bg-none border-0 cursor-pointer pb-2">Clear</button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-2">Step 2b — pick a candidate from the start list</div>
          {!classes.length
            ? <p className="text-[13px] text-faint">Pick an event above (upload or filter) to see its classes and riders here.</p>
            : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {classes.slice(0, 10).map((c) => (
                  <div key={c.class_id} className="rounded border border-line bg-card2 p-2.5 text-[13px]">
                    <b>{c.name}</b>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(c.candidates || []).slice(0, 8).map((p) => (
                        <button key={`${p.horse_id}-${p.rider_id}`} onClick={() => useCandidate(c, p)}
                          title={`Tag selected as ${p.horse} × ${p.rider}`}
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
            )}
        </div>
      </section>

      {/* STEP 3 + review grid */}
      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Step 3 — Price, publish & review</h2>
        <p className="text-[13px] text-muted mb-3">Set a price and flip to <b className="text-body">published</b> — again via Apply, or per photo below. Unpublished photos never appear in the shop.</p>
        <div className="flex flex-wrap items-end gap-2.5 mb-3">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Price (cents)
            <input value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} placeholder="e.g. 3500" inputMode="numeric" className={`${INP} w-[130px]`} /></label>
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
          <button onClick={createPackage} className="rounded border border-line px-3.5 py-2 text-sm text-body hover:text-white">Create package</button>
          <a href={`${API}/admin/sales.csv`} className="text-sky text-[13px] hover:underline ml-auto">Sales CSV ↓</a>
        </div>
        <div className="flex flex-wrap items-end gap-2.5 mb-3">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Show
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={INP}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event
            <select value={fEvent} onChange={(e) => setFEvent(e.target.value)} className={`${INP} min-w-[200px]`}>
              <option value="">All events</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
          <label className="flex items-center gap-1.5 text-[13px] text-muted pb-2">
            <input type="checkbox" checked={fUntagged} onChange={(e) => setFUntagged(e.target.checked)} /> Untagged only
          </label>
          {!!rows.length && (
            <button onClick={() => setSelected(allIds)} className="text-sky text-[13px] hover:underline bg-none border-0 cursor-pointer pb-2">
              {allSel ? 'Deselect all' : `Select all ${rows.length}`}
            </button>
          )}
        </div>
        {!rows.length
          ? <p className="text-faint text-[13px] py-4">No photos match — upload some (step 1) or loosen the filters.</p>
          : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {rows.map((r) => {
                const sel = selected.includes(r.id);
                return (
                  <div key={r.id}
                    onClick={() => toggle(r.id)}
                    className={`relative rounded border overflow-hidden cursor-pointer transition text-left
                      ${sel ? 'border-gold shadow-[0_0_0_1px_var(--tw-shadow-color)] shadow-gold/60' : 'border-line hover:border-gold/40'}`}>
                    <div className="aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                      {r.thumb_url
                        ? <img src={r.thumb_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        : <span className="text-2xl">{r.kind === 'reel' ? '🎬' : '📷'}</span>}
                    </div>
                    <div className={`absolute top-2 left-2 w-5 h-5 rounded border flex items-center justify-center text-[12px] font-bold
                      ${sel ? 'bg-gold border-gold text-black' : 'bg-ink/70 border-line text-transparent'}`}>✓</div>
                    <div className="absolute top-2 right-2 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-bold text-faint">{r.status}</div>
                    <div className="p-2">
                      <div className={`text-[12.5px] font-bold truncate ${r.horse || r.rider ? 'text-white' : 'text-gold'}`}>
                        {tagLabel(r)}
                      </div>
                      <div className="text-[11px] text-faint truncate mt-0.5">
                        {r.event_name || 'Unsorted'}{r.price_cents != null ? ` · $${(r.price_cents / 100).toFixed(2)}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </section>
    </>
  );
}
