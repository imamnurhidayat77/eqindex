'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY, BTN_DANGER, badge, BADGE } from '../../../lib/tokens';

export default function AdminSeries() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  async function call(path, opts = {}) {
    const res = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
    return j.data;
  }
  async function load() {
    setLoading(true); setErr('');
    try { setRows(await call('/admin/series')); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  function startEdit(r) {
    setForm({ display_name: r.display_name || '', description: r.description || '', qual_rules: r.qual_rules || '', is_official: !!r.is_official, official_source: r.official_source || '' });
    setEditing(r); setErr('');
  }
  async function save() {
    setBusy(true); setErr('');
    try {
      await call(`/admin/series/${editing.series_key}`, { method: 'PATCH', body: JSON.stringify(form) });
      setEditing(null); await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function remove(r) {
    if (!window.confirm(`Delete series "${r.series_name}" and ALL ${r.entries} standing rows?`)) return;
    setErr('');
    try { await call(`/admin/series/${r.series_key}`, { method: 'DELETE' }); await load(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <>
      <h1 className={H1}>Series management</h1>
      <p className={SUB}>Qualification rules and official vs independent labelling per series.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Series</th><th className={TH}>Season</th><th className={`${TH} ${NUM}`}>Entries</th><th className={TH}>Status</th><th className={TH}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.series_key}>
                <td className={TD}><b>{r.display_name || r.series_name}</b><div className="text-faint text-[11px]">{r.series_key}</div></td>
                <td className={TD}>{(r.season || '').replace('-', '/')}</td>
                <td className={`${TD} ${NUM}`}>{r.entries}</td>
                <td className={TD}>{r.is_official ? <span className={badge(BADGE.green)}>Official{r.official_source ? ` · ${r.official_source}` : ''}</span> : <span className={badge(BADGE.goldfill)}>Independent</span>}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  <button className="text-sky bg-none border-0 p-0 text-[12px] cursor-pointer mr-3" onClick={() => startEdit(r)}>Edit</button>
                  <button className="text-blood bg-none border-0 p-0 text-[12px] cursor-pointer" onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td colSpan={5} className={EMPTY}>No series in database.</td></tr>}
            {loading && <tr><td colSpan={5} className={EMPTY}>Loading…</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
      {editing && (
        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-2">Edit — {editing.series_name}</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-xs text-muted flex flex-col gap-1">Display name
              <input className={INP} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
            <label className="text-xs text-muted flex flex-col gap-1">Official source
              <input className={INP} value={form.official_source} onChange={(e) => setForm({ ...form, official_source: e.target.value })} placeholder="e.g. ESNZ" /></label>
            <label className="text-xs text-muted flex flex-col gap-1 md:col-span-2">Description
              <input className={INP} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label className="text-xs text-muted flex flex-col gap-1 md:col-span-2">Qualification rules
              <textarea className={INP} rows={3} value={form.qual_rules} onChange={(e) => setForm({ ...form, qual_rules: e.target.value })}
                placeholder="How points qualify, dropped scores, finals…" /></label>
            <label className="text-xs text-muted flex items-center gap-2">
              <input type="checkbox" checked={!!form.is_official} onChange={(e) => setForm({ ...form, is_official: e.target.checked })} className="w-4 h-4 accent-gold" />
              Official (organiser-published) — unchecked means EQIndex-calculated independent
            </label>
          </div>
          <div className="flex gap-2 mt-3">
            <button className={BTN_PRIMARY} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
            <button className="text-muted text-sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </section>
      )}
    </>
  );
}
