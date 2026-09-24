'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';

const INTENSITY_STYLE = {
  High: 'bg-danger/15 text-danger border border-danger/30',
  Medium: 'bg-gold/15 text-gold border border-gold/30',
  Low: 'bg-mint/15 text-mint border border-mint/30',
};

export default function TrainingPanel({ horseId, riders = [], compact = false }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: '', type: 'Flatwork', intensity: 'Medium', rider_id: '', notes: '' });
  async function load() {
    try {
      const r = await (await fetch(`${API}/horses/${horseId}/training`)).json();
      setItems(r.data || []);
    } catch { /* offline */ }
  }
  useEffect(() => { load(); }, []);
  async function add(e) {
    e.preventDefault();
    const res = await fetch(`${API}/horses/${horseId}/training`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, rider_id: form.rider_id || null }),
    });
    if (res.ok) { setForm({ date: '', type: 'Flatwork', intensity: 'Medium', rider_id: '', notes: '' }); setOpen(false); load(); }
  }
  async function remove(id) {
    await fetch(`${API}/training/${id}`, { method: 'DELETE' });
    load();
  }
  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-line bg-card">
      {!compact && <h2 className="px-5 pt-4 text-[15px] font-bold">Training</h2>}
      <div className="flex justify-end px-4 pt-3">
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg border border-line bg-card2 px-3 py-1.5 text-[12px] font-semibold text-muted hover:text-white">
          {open ? '− Close' : '+ Log session'}
        </button>
      </div>
      {open && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-3 px-5 pb-4 pt-2">
          <label className="text-[12px] text-muted">Date<br /><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 rounded-lg border border-line bg-ink px-2.5 py-2 text-slate-100" /></label>
          <label className="text-[12px] text-muted">Type<br />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1 rounded-lg border border-line bg-ink px-2.5 py-2 text-slate-100">
              {['Flatwork', 'Jumping gridwork', 'Course practice', 'Pole work', 'Hacking', 'Lunging', 'Gymnastics'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-[12px] text-muted">Intensity<br />
            <select value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value })} className="mt-1 rounded-lg border border-line bg-ink px-2.5 py-2 text-slate-100">
              {['Low', 'Medium', 'High'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          {!!riders.length && (
            <label className="text-[12px] text-muted">Rider<br />
              <select value={form.rider_id} onChange={(e) => setForm({ ...form, rider_id: e.target.value })} className="mt-1 rounded-lg border border-line bg-ink px-2.5 py-2 text-slate-100">
                <option value="">—</option>
                {riders.map((r) => <option key={r.rider_id} value={r.rider_id}>{r.rider}</option>)}
              </select>
            </label>
          )}
          <label className="min-w-[220px] flex-1 text-[12px] text-muted">Notes / Objective<br /><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Focus, distances, response..." className="mt-1 w-full rounded-lg border border-line bg-ink px-2.5 py-2 text-slate-100" /></label>
          <button className="rounded-lg bg-gold px-4 py-2 text-[13px] font-bold text-black">Add</button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="border-b border-line px-4 py-2.5 font-semibold">Date</th>
              <th className="border-b border-line px-4 py-2.5 font-semibold">Training Type</th>
              <th className="border-b border-line px-4 py-2.5 font-semibold">Intensity</th>
              <th className="border-b border-line px-4 py-2.5 font-semibold">Rider</th>
              <th className="border-b border-line px-4 py-2.5 font-semibold">Notes / Objective</th>
              <th className="border-b border-line px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">{(t.date || '').slice(0, 10)}</td>
                <td className="px-4 py-2.5 font-medium">{t.type}</td>
                <td className="px-4 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${INTENSITY_STYLE[t.intensity] || 'bg-card2 text-muted border border-line'}`}>{t.intensity}</span></td>
                <td className="whitespace-nowrap px-4 py-2.5">{t.rider || '-'}</td>
                <td className="px-4 py-2.5 text-muted">{t.notes || '—'}</td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => remove(t.id)} className="text-[12px] text-faint hover:text-danger">Delete</button></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">No training sessions logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
