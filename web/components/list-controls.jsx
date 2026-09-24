'use client';

import { HEIGHT_BANDS, heightParams } from '../lib/heights';

export { HEIGHT_BANDS, heightParams };

const selCls = 'bg-ink border border-line text-body rounded-lg px-2.5 py-2 text-[13px] max-w-[160px]';

export function FilterBar({ f, set, seasons, regions, arenas, showHeight = true, showMinStarts = true }) {
  const upd = (k) => (e) => set({ ...f, [k]: e.target.value });
  const clear = () => set({ q: '', season: '', region: '', arena: '', height: '', minStarts: '1' });
  const active = [f.q, f.season, f.region, f.arena, f.height].some(Boolean) || f.minStarts !== '1';
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2.5 rounded-xl border border-line bg-card p-4">
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
        Search
        <input value={f.q} onChange={upd('q')} placeholder="Name…"
          className="w-[170px] rounded-lg border border-line bg-ink px-2.5 py-2 text-[13px] normal-case text-white placeholder:text-faint focus:border-gold/60 focus:outline-none" />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
        Season
        <select value={f.season} onChange={upd('season')} className={selCls}>
          <option value="">All seasons</option>
          {seasons.map((s) => <option key={s} value={s}>{s.replace('-', '/')}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
        Region
        <select value={f.region} onChange={upd('region')} className={selCls}>
          <option value="">All regions</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
        Arena
        <select value={f.arena} onChange={upd('arena')} className={selCls}>
          <option value="">All arenas</option>
          {arenas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      {showHeight && (
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
          Height
          <select value={f.height} onChange={upd('height')} className={selCls}>
            {HEIGHT_BANDS.map((h) => <option key={h.v} value={h.v}>{h.label}</option>)}
          </select>
        </label>
      )}
      {showMinStarts && (
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
          Min starts
          <select value={f.minStarts} onChange={upd('minStarts')} className={selCls}>
            {['1', '3', '5', '10'].map((n) => <option key={n} value={n}>{n}+</option>)}
          </select>
        </label>
      )}
      {active && (
        <button onClick={clear} className="rounded-lg px-2 py-2 text-[13px] text-sky hover:underline">
          Reset
        </button>
      )}
    </div>
  );
}

export function Pagination({ page, pages, setPage, perPage, setPerPage, total }) {
  if (!total) return null;
  const nums = [];
  const lo = Math.max(1, Math.min(page - 2, pages - 4));
  const hi = Math.min(pages, lo + 4);
  for (let i = lo; i <= hi; i++) nums.push(i);
  const btn = (active) =>
    `min-w-[32px] rounded-lg border px-2 py-1.5 text-[13px] font-semibold ${
      active ? 'border-gold/60 bg-goldbg text-gold' : 'border-line bg-card2 text-muted hover:text-white'
    }`;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="text-[12.5px] text-muted">
        {total} result{total === 1 ? '' : 's'} · Page {page} of {pages}
      </div>
      <div className="flex items-center gap-1.5">
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          className="mr-1 rounded-lg border border-line bg-ink px-2 py-1.5 text-[13px] text-body">
          {[10, 20, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={btn(false) + ' disabled:opacity-40'}>‹</button>
        {nums.map((n) => (
          <button key={n} onClick={() => setPage(n)} className={btn(n === page)}>{n}</button>
        ))}
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} className={btn(false) + ' disabled:opacity-40'}>›</button>
      </div>
    </div>
  );
}
