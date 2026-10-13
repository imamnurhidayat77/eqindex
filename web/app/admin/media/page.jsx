'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';

export default function AdminMedia() {
  const call = useAdminApi();
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [upEvent, setUpEvent] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fUntagged, setFUntagged] = useState(false);
  const [edits, setEdits] = useState({});
  const [sgEvent, setSgEvent] = useState('');
  const [sgTaken, setSgTaken] = useState('');
  const [suggest, setSuggest] = useState(null);
  const [sales, setSales] = useState([]);
  const [totals, setTotals] = useState(null);

  async function load() {
    try {
      const p = new URLSearchParams();
      if (fStatus) p.set('status', fStatus);
      if (fUntagged) p.set('untagged', '1');
      setRows(await call(`/admin/media?${p}`) || []);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fStatus, fUntagged]);
  useEffect(() => {
    call('/admin/sales?limit=50').then((d) => { setSales(d.data || []); setTotals(d.totals || null); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setMsg(`Uploaded ${ok}/${(j.data || []).length}. ${(j.data || []).filter((x) => !x.ok).map((x) => `${x.file}: ${x.error}`).join('; ')}`);
      setFiles([]);
      load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  async function createPackage() {
    try {
      const horseId = prompt('Horse id/slug (blank for rider):');
      const riderId = !horseId ? prompt('Rider id/slug:') : null;
      const evId = prompt('Event id:');
      if ((!horseId && !riderId) || !evId) { setMsg('Need event + horse or rider.'); return; }
      const body = { event_id: evId };
      if (horseId) body.horse_id = horseId; else body.rider_id = riderId;
      const pk = await call('/admin/packages', { method: 'POST', body: JSON.stringify(body) });
      setMsg(`Package created: ${pk.title} (${pk.items} photos).`);
    } catch (e) { setMsg(e.message); }
  }

  async function suggestMoment(id) {
    try {
      const r = await fetch(`${API}/admin/media/${id}/suggest-moment`, { method: 'POST', credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setMsg(`Suggested: ${j.data.suggested || 'none'}${j.data.reasons?.length ? ` (${j.data.reasons.join(', ')})` : ''}. Apply via the moment dropdown + Save.`);
    } catch (e) { setMsg(e.message); }
  }

  async function save(id) {
    const e = edits[id] || {};
    try {
      await call(`/admin/media/${id}`, { method: 'PATCH', body: JSON.stringify(e) });
      setMsg('Saved.');
      setEdits((p) => ({ ...p, [id]: {} }));
      load();
    } catch (err) { setMsg(err.message); }
  }

  async function runSuggest() {
    if (!sgEvent) { setMsg('Pick an event for suggestions.'); return; }
    try {
      const r = await fetch(`${API}/admin/media/suggest-tags`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: sgEvent, taken_at: sgTaken || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setSuggest(j.data || []);
    } catch (e) { setMsg(e.message); }
  }

  const setE = (id, k, v) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));

  const nzd = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;

  return (
    <>
      {!!sales.length && (
        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-2">Recent sales</h2>
          <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead><tr><th className={TH}>When</th><th className={TH}>Buyer</th><th className={TH}>Item</th><th className={`${TH} ${NUM}`}>Amount</th><th className={TH}>Status</th></tr></thead>
            <tbody>
              {sales.slice(0, 10).map((s) => (
                <tr key={s.id}>
                  <td className={`${TD} text-muted text-[12px]`}>{String(s.created_at).slice(0, 16).replace('T', ' ')}</td>
                  <td className={TD}>{s.buyer_email}</td>
                  <td className={`${TD} text-muted text-[12px]`}>{s.package_title || [s.horse, s.rider].filter(Boolean).join(' × ') || s.event_name || s.media_id?.slice(0, 8)}</td>
                  <td className={`${TD} ${NUM}`}>{nzd(s.amount_cents)}</td>
                  <td className={TD}>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}
      <h1 className={H1}>Media</h1>
      <p className={SUB}>Photo/reel upload, tagging review, publish. Single photographer v1.{totals ? ` · ${totals.sales} paid · $${(totals.gross_cents / 100).toFixed(2)} gross` : ''}</p>
      {msg && <section className={CARD}><p className="text-sm text-gold">{msg}</p></section>}

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-2">Upload batch</h2>
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

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-2">Tag suggestions</h2>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event
            <select value={sgEvent} onChange={(e) => setSgEvent(e.target.value)} className={`${INP} min-w-[220px]`}>
              <option value="">Pick event…</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Taken at (optional)
            <input type="datetime-local" value={sgTaken} onChange={(e) => setSgTaken(e.target.value)} className={INP} /></label>
          <button onClick={runSuggest} className={BTN_PRIMARY}>Suggest</button>
          <button onClick={createPackage} className="rounded border border-line px-3.5 py-2 text-sm text-body hover:text-white">Create package</button>
          <a href={`${API}/admin/sales.csv`} className="text-sky text-[13px] hover:underline ml-auto">Sales CSV ↓</a>
        </div>
        {!!suggest?.length && (
          <div className="mt-3 space-y-2">
            {suggest.slice(0, 8).map((c) => (
              <div key={c.class_id} className="rounded border border-line bg-card2 p-2.5 text-[13px]">
                <b>{c.name}</b> <span className="text-faint">(score {c.score})</span>
                <div className="text-muted text-[12.5px] mt-1">
                  {(c.candidates || []).slice(0, 6).map((p) => `${p.horse} × ${p.rider}`).join(' · ') || 'No candidates yet — results not imported.'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={CARD}>
        <div className="flex flex-wrap items-end gap-2.5 mb-3">
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
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Asset</th><th className={TH}>Event</th><th className={TH}>Tags</th>
            <th className={`${TH} ${NUM}`}>Price ¢</th><th className={TH}>Status</th><th className={TH}></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const e = edits[r.id] || {};
              return (
                <tr key={r.id}>
                  <td className={TD}>
                    {r.thumb_url
                      ? <img src={r.thumb_url} alt="" className="h-12 w-auto rounded border border-line" />
                      : <span className="text-faint text-xs">{r.kind} · no preview yet</span>}
                    <div className="text-[11px] text-faint mt-0.5">{r.kind} · {r.width || '?'}×{r.height || '?'}</div>
                  </td>
                  <td className={`${TD} text-muted text-[13px]`}>{r.event_name || '—'}</td>
                  <td className={TD}>
                    <div className="text-[12px] text-muted mb-1">{r.horse || '—'} × {r.rider || '—'}</div>
                    <div className="flex flex-wrap gap-1">
                      <input placeholder="horse id/slug" defaultValue="" onChange={(ev) => setE(r.id, 'horse_id', ev.target.value)} className={`${INP} w-[130px] !py-1 !text-[12px]`} />
                      <input placeholder="rider id/slug" defaultValue="" onChange={(ev) => setE(r.id, 'rider_id', ev.target.value)} className={`${INP} w-[130px] !py-1 !text-[12px]`} />
                      <select defaultValue={r.moment || ''} onChange={(ev) => setE(r.id, 'moment', ev.target.value || null)} className={`${INP} !py-1 !text-[12px]`}>
                        <option value="">moment…</option>
                        <option value="win">win</option>
                        <option value="clear">clear</option>
                        <option value="debut">debut</option>
                        <option value="pb">pb</option>
                      </select>
                      <button onClick={() => suggestMoment(r.id)} className="text-[12px] text-sky hover:underline bg-none border-0 cursor-pointer">suggest</button>
                      <input placeholder="price ¢" defaultValue={r.price_cents ?? ''} onChange={(ev) => setE(r.id, 'price_cents', ev.target.value)} className={`${INP} w-[90px] !py-1 !text-[12px]`} />
                      <select value={e.status ?? r.status} onChange={(ev) => setE(r.id, 'status', ev.target.value)} className={`${INP} !py-1 !text-[12px]`}>
                        <option value="draft">draft</option>
                        <option value="published">published</option>
                        <option value="archived">archived</option>
                      </select>
                    </div>
                  </td>
                  <td className={`${TD} ${NUM}`}>{r.price_cents ?? '—'}</td>
                  <td className={TD}>{r.status}</td>
                  <td className={TD}><button onClick={() => save(r.id)} className="text-sky text-[13px] hover:underline bg-none border-0 cursor-pointer">Save</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
