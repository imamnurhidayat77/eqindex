'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';

const CATS = ['VET', 'TREATMENT', 'FARRIER', 'VACCINATION', 'OTHER'];
const CAT_STYLE = {
  VETERINARY: 'bg-info/15 text-info border border-info/30',
  VET: 'bg-info/15 text-info border border-info/30',
  FARRIER: 'bg-gold/15 text-gold border border-gold/30',
  VACCINATION: 'bg-mint/15 text-mint border border-mint/30',
  TREATMENT: 'bg-violet/15 text-violet border border-violet/30',
  OTHER: 'bg-card2 text-muted border border-line',
};

export default function HealthPanel({ horseId, compact = false }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: '', category: 'VET', description: '', provider: '' });
  async function load() {
    try {
      const r = await (await fetch(`${API}/horses/${horseId}/health`)).json();
      setItems(r.data || []);
    } catch { /* offline */ }
  }
  useEffect(() => { load(); }, []);
  async function add(e) {
    e.preventDefault();
    const res = await fetch(`${API}/horses/${horseId}/health`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    if (res.ok) { setForm({ date: '', category: 'VET', description: '', provider: '' }); setOpen(false); load(); }
  }
  async function remove(id) {
    await fetch(`${API}/health/${id}`, { method: 'DELETE' });
    load();
  }
  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-line bg-card">
      {!compact && <h2 className="px-5 pt-4 text-[15px] font-bold">Health &amp; care</h2>}
      <div className="flex justify-end px-4 pt-3">
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg border border-line bg-card2 px-3 py-1.5 text-[12px] font-semibold text-muted hover:text-white">
          {open ? '− Close' : '+ Log record'}
        </button>
      </div>
      {open && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-3 px-5 pb-4 pt-2">
          <label className="text-[12px] text-muted">Date<br /><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 rounded-lg border border-line bg-ink px-2.5 py-2 text-slate-100" /></label>
          <label className="text-[12px] text-muted">Category<br />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 rounded-lg border border-line bg-ink px-2.5 py-2 text-slate-100">
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="min-w-[220px] flex-1 text-[12px] text-muted">Description<br /><input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Check-up, shoeing, booster..." className="mt-1 w-full rounded-lg border border-line bg-ink px-2.5 py-2 text-slate-100" /></label>
          <label className="text-[12px] text-muted">Provider<br /><input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="Clinic / farrier" className="mt-1 rounded-lg border border-line bg-ink px-2.5 py-2 text-slate-100" /></label>
          <button className="rounded-lg bg-gold px-4 py-2 text-[13px] font-bold text-black">Add</button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="border-b border-line px-4 py-2.5 font-semibold">Date</th>
              <th className="border-b border-line px-4 py-2.5 font-semibold">Category</th>
              <th className="border-b border-line px-4 py-2.5 font-semibold">Description</th>
              <th className="border-b border-line px-4 py-2.5 font-semibold">Provider</th>
              <th className="border-b border-line px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.map((x) => (
              <tr key={x.id} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">{(x.date || '').slice(0, 10)}</td>
                <td className="px-4 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${CAT_STYLE[x.category] || CAT_STYLE.OTHER}`}>{x.category}</span></td>
                <td className="px-4 py-2.5 text-slate-200">{x.description}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">{x.provider || '—'}</td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => remove(x.id)} className="text-[12px] text-faint hover:text-danger">Delete</button></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">No health records yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
