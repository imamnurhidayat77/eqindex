'use client';

import { HEIGHT_BANDS, heightParams } from '../lib/heights';
import Dropdown from './Dropdown';

export { HEIGHT_BANDS, heightParams };

export const SERIES_CATS = ['Junior', 'Young Rider', 'Under 25', 'Amateur', 'Pony', 'Open'];

export function FilterBar({ f, set, seasons, regions, arenas, showHeight = true, showMinStarts = true, showCategory = false }) {
  const upd = (k) => (e) => set({ ...f, [k]: e.target.value });
  const pick = (k) => (o) => set({ ...f, [k]: o.value });
  const clear = () => set({ q: '', season: '', region: '', arena: '', height: '', minStarts: '1', category: '' });
  const active = [f.q, f.season, f.region, f.arena, f.height, f.category].some(Boolean) || f.minStarts !== '1';
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2.5 rounded border border-line bg-card p-4">
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
        Search
        <input value={f.q} onChange={upd('q')} placeholder="Name…"
          className="w-[170px] rounded border border-line bg-ink px-2.5 py-2 text-[13px] normal-case text-white placeholder:text-faint focus:border-gold/60 focus:outline-none" />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
        Season
        <Dropdown ariaLabel="Season" value={f.season} placeholder="All seasons"
          options={[{ value: '', label: 'All seasons' },
            ...seasons.map((s) => ({ value: s, label: s.replace('-', '/') }))]}
          onSelect={pick('season')} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
        Region
        <Dropdown ariaLabel="Region" value={f.region} placeholder="All regions"
          options={[{ value: '', label: 'All regions' }, ...regions.map((r) => ({ value: r, label: r }))]}
          onSelect={pick('region')} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
        Arena
        <Dropdown ariaLabel="Arena" value={f.arena} placeholder="All arenas"
          options={[{ value: '', label: 'All arenas' }, ...arenas.map((a) => ({ value: a, label: a }))]}
          onSelect={pick('arena')} />
      </label>
      {showHeight && (
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
          Height
          <Dropdown ariaLabel="Height" value={f.height}
            options={HEIGHT_BANDS.map((h) => ({ value: h.v, label: h.label }))}
            onSelect={pick('height')} />
        </label>
      )}
      {showCategory && (
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
          Category
          <Dropdown ariaLabel="Category" value={f.category || ''} placeholder="All categories"
            options={[{ value: '', label: 'All categories' }, ...SERIES_CATS.map((c) => ({ value: c, label: c }))]}
            onSelect={pick('category')} />
        </label>
      )}
      {showMinStarts && (
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
          Min starts
          <Dropdown ariaLabel="Min starts" value={f.minStarts}
            options={['1', '3', '5', '10'].map((n) => ({ value: n, label: `${n}+` }))}
            onSelect={pick('minStarts')} />
        </label>
      )}
      {active && (
        <button onClick={clear} className="rounded px-2 py-2 text-[13px] text-sky hover:underline">
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
    `min-w-[32px] rounded border px-2 py-1.5 text-[13px] font-semibold ${
      active ? 'border-gold/60 bg-goldbg text-gold' : 'border-line bg-card2 text-muted hover:text-white'
    }`;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="text-[12.5px] text-muted">
        {total} result{total === 1 ? '' : 's'} · Page {page} of {pages}
      </div>
      <div className="flex items-center gap-1.5">
        <Dropdown ariaLabel="Rows per page" value={String(perPage)}
          options={[10, 25, 50].map((n) => ({ value: String(n), label: `${n} / page` }))}
          onSelect={(o) => { setPerPage(Number(o.value)); setPage(1); }} />
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={btn(false) + ' disabled:opacity-40'}>‹</button>
        {nums.map((n) => (
          <button key={n} onClick={() => setPage(n)} className={btn(n === page)}>{n}</button>
        ))}
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} className={btn(false) + ' disabled:opacity-40'}>›</button>
      </div>
    </div>
  );
}
