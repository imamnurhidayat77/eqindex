'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY, BTN_DANGER, LINK } from '../lib/tokens';
import Dropdown from './Dropdown';

// Generic admin CRUD table. Config: { title, sub, base ('horses'|'riders'|'events'),
// profile: (row) => href|null, columns: [{k,label,num?}], fields: [{k,label,type?,options?}] }
export default function ManageTable({ title, sub, base, profile, columns, fields }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function call(path, opts = {}) {
    const res = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
    return j.data;
  }
  async function load(query = '') {
    setLoading(true); setErr('');
    try { setRows(await call(`/admin/${base}${query ? `?q=${encodeURIComponent(query)}` : ''}`)); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  function startEdit(row) {
    const f = {};
    for (const fld of fields) f[fld.k] = row[fld.k] ?? '';
    setForm(f); setEditing(row); setErr('');
  }
  async function save() {
    setBusy(true); setErr('');
    try {
      await call(`/admin/${base}/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      setEditing(null); await load(q.trim());
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function remove(row) {
    const extra = row.starts !== undefined ? ` (${row.starts} rounds)` : row.round_count !== undefined ? ` (${row.class_count} classes, ${row.round_count} rounds)` : '';
    if (!window.confirm(`Delete "${row.name}"${extra}? This cannot be undone.`)) return;
    setBusy(true); setErr('');
    try { await call(`/admin/${base}/${row.id}`, { method: 'DELETE' }); await load(q.trim()); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const inputFor = (fld) => {
    if (fld.options) {
      return (
        <Dropdown ariaLabel={fld.label} value={form[fld.k] ?? ''} placeholder="—"
          options={[{ value: '', label: '—' }, ...fld.options.map((o) => ({ value: o, label: o }))]}
          onSelect={(o) => setForm({ ...form, [fld.k]: o.value })} />
      );
    }
    return (
      <input className={INP} value={form[fld.k] ?? ''} onChange={(e) => setForm({ ...form, [fld.k]: e.target.value })}
        placeholder={fld.label} maxLength={200} />
    );
  };

  return (
    <>
      <h1 className={H1}>{title}</h1>
      <p className={SUB}>{sub}</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <div className="mb-4">
        <input className={INP} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" style={{ maxWidth: 320, width: '100%' }} />
      </div>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            {columns.map((c) => <th key={c.k} className={`${TH} ${c.num ? NUM : ''}`}>{c.label}</th>)}
            <th className={TH}></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td key={c.k} className={`${TD} ${c.num ? `${NUM} text-muted` : ''}`}>
                    {c.k === 'name' && profile && profile(r)
                      ? <a className={LINK} href={profile(r)}><b>{r.name}</b></a>
                      : c.k === 'name' ? <b>{r.name}</b> : String(r[c.k] ?? '–')}
                  </td>
                ))}
                <td className={`${TD} whitespace-nowrap`}>
                  <button className="text-sky bg-none border-0 p-0 text-[12px] cursor-pointer mr-3" onClick={() => startEdit(r)}>Edit</button>
                  <button className="text-blood bg-none border-0 p-0 text-[12px] cursor-pointer" disabled={busy} onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td colSpan={columns.length + 1} className={EMPTY}>No records found.</td></tr>}
            {loading && <tr><td colSpan={columns.length + 1} className={EMPTY}>Loading…</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
      {editing && (
        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-2">Edit — {editing.name}</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {fields.map((fld) => (
              <label key={fld.k} className="text-xs text-muted flex flex-col gap-1">{fld.label}{inputFor(fld)}</label>
            ))}
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
