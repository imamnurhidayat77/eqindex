'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY, EMPTY } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';

export default function AdminSeasons() {
  const call = useAdminApi();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ key: '', label: '', date_start: '', date_end: '', make_current: false });

  async function load() {
    setLoading(true); setErr('');
    try {
      const res = await fetch(`${API}/seasons`);
      const j = await res.json();
      setRows(j.data || []);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setErr(''); setNotice('');
    try {
      const saved = await call('/admin/seasons', {
        method: 'POST',
        body: JSON.stringify({
          key: form.key.trim(), label: form.label.trim() || undefined,
          date_start: form.date_start, date_end: form.date_end,
          make_current: !!form.make_current,
        }),
      });
      setNotice(`Season ${saved.key} saved${saved.is_current ? ' and set current' : ''}.`);
      setForm({ key: '', label: '', date_start: '', date_end: '', make_current: false });
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <>
      <h1 className={H1}>Seasons</h1>
      <p className={SUB}>Master list every event season must reference — new seasons must exist here before imports or classes can use them. Exactly one season is current.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      {notice && <section className={CARD}><p className="text-moss text-sm">{notice}</p></section>}
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Key</th><th className={TH}>Label</th><th className={TH}>Start</th><th className={TH}>End</th><th className={TH}>Current</th><th className={`${TH} ${NUM}`}>Events</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.key}>
                <td className={TD}><b>{s.key}</b></td>
                <td className={TD}>{s.label}</td>
                <td className={`${TD} text-muted`}>{(s.date_start || '').slice(0, 10)}</td>
                <td className={`${TD} text-muted`}>{(s.date_end || '').slice(0, 10)}</td>
                <td className={TD}>{s.is_current
                  ? <span className="inline-flex items-center rounded-full bg-greenbg px-2 py-[3px] text-[11px] font-bold text-moss">● CURRENT</span>
                  : <span className="text-faint text-[12px]">—</span>}</td>
                <td className={`${TD} ${NUM} text-muted`}>{s.events}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={6} className={EMPTY}>No seasons yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Add / update season</h2>
        <p className="text-muted text-[13px] mb-3">Key must look like <code>2027-2028</code>. NZ season runs Aug–Jul. Ticking current moves the flag off the previous season.</p>
        <div className="flex flex-wrap gap-2.5 items-end">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Key*
            <input className={INP} value={form.key} onChange={set('key')} placeholder="2027-2028" style={{ width: 130 }} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Label
            <input className={INP} value={form.label} onChange={set('label')} placeholder="2027/28" style={{ width: 110 }} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Start*
            <input className={INP} type="date" value={form.date_start} onChange={set('date_start')} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">End*
            <input className={INP} type="date" value={form.date_end} onChange={set('date_end')} /></label>
          <label className="flex items-center gap-2 text-[12px] text-muted cursor-pointer pb-2">
            <input type="checkbox" checked={form.make_current} onChange={set('make_current')} className="accent-gold w-4 h-4" />
            Set current</label>
          <button className={BTN_PRIMARY} disabled={busy || !form.key.trim() || !form.date_start || !form.date_end} onClick={save}>
            {busy ? 'Saving…' : 'Save season'}</button>
        </div>
      </section>
    </>
  );
}
