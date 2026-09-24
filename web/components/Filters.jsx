'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HEIGHT_BANDS } from '../lib/heights';
import { useSeason } from './global';

const RANGES = [['all', 'All time'], ['12m', 'Last 12 Months'], ['season', 'This Season']];

function Pill({ label, active, onClear, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border pl-3 pr-1.5 py-[5px] text-xs bg-card2 ${active ? 'border-gold/60' : 'border-line'}`}>
      <span className="text-faint whitespace-nowrap">{label}</span>
      {children}
      <button onClick={onClear} title="Clear filter"
        className="ml-0.5 w-[18px] h-[18px] rounded-full bg-line text-muted hover:text-white text-[11px] leading-none">×</button>
    </span>
  );
}

const sel = 'bg-transparent border-0 text-body text-xs font-semibold cursor-pointer max-w-[150px] focus:outline-none';

export default function Filters({ current, seasons, regions, arenas }) {
  const router = useRouter();
  const { season: gSeason } = useSeason();
  // adopt the navbar's global season when the URL has no explicit ?season=
  useEffect(() => {
    if (!current.season && gSeason) {
      const p = new URLSearchParams();
      p.set('season', gSeason);
      for (const [k, v] of Object.entries(current)) {
        if (v && v !== 'all' && v !== '' && k !== 'season') p.set(k, v);
      }
      router.replace(`/?${p.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gSeason]);
  const go = (patch) => {
    const p = new URLSearchParams(current);
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === 'all' || v === '') p.delete(k); else p.set(k, v);
    }
    // height uses '' for all (shared HEIGHT_BANDS vocabulary)
    if (patch.height === '') p.delete('height');
    const qs = p.toString();
    router.push(qs ? `/?${qs}` : '/');
  };
  const season = current.season || 'all';
  const entity = current.entity || 'combination';
  const height = current.height || '';
  const region = current.region || '';
  const arena = current.arena || '';
  const minRounds = current.min_rounds || '0';
  const range = current.range || 'all';
  return (
    <div className="flex flex-wrap gap-2 mb-6 items-center">
      <Pill label="Season" active={season !== 'all'} onClear={() => go({ season: '' })}>
        <select className={sel} value={season} onChange={(e) => go({ season: e.target.value })}>
          <option value="all">All Seasons</option>
          {seasons.map((s) => <option key={s} value={s}>{s.replace('-', '/')}</option>)}
        </select>
      </Pill>
      <Pill label="Entity Type" active={entity !== 'combination'} onClear={() => go({ entity: '' })}>
        <select className={sel} value={entity} onChange={(e) => go({ entity: e.target.value })}>
          <option value="combination">Combination</option>
          <option value="horse">Horse</option>
          <option value="rider">Rider</option>
        </select>
      </Pill>
      <Pill label="Height Category" active={height !== ''} onClear={() => go({ height: '' })}>
        <select className={sel} value={height} onChange={(e) => go({ height: e.target.value })}>
          {HEIGHT_BANDS.map((h) => <option key={h.v || 'all'} value={h.v}>{h.v ? h.label : 'All Heights'}</option>)}
        </select>
      </Pill>
      <Pill label="Region" active={!!region} onClear={() => go({ region: '' })}>
        <select className={sel} value={region} onChange={(e) => go({ region: e.target.value })}>
          <option value="">All Regions</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Pill>
      <Pill label="Arena Type" active={!!arena} onClear={() => go({ arena: '' })}>
        <select className={sel} value={arena} onChange={(e) => go({ arena: e.target.value })}>
          <option value="">All Arenas</option>
          {arenas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </Pill>
      <Pill label="Minimum Rounds" active={minRounds !== '0'} onClear={() => go({ min_rounds: '' })}>
        <select className={sel} value={minRounds} onChange={(e) => go({ min_rounds: e.target.value })}>
          {['0', '3', '5', '10'].map((n) => <option key={n} value={n}>{n}+ Rounds</option>)}
        </select>
      </Pill>
      <Pill label="Date Range" active={range !== 'all'} onClear={() => go({ range: '' })}>
        <select className={sel} value={range} onChange={(e) => go({ range: e.target.value })}>
          {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Pill>
      <span className="text-sky text-xs cursor-pointer" onClick={() => router.push('/')}>Reset Filters</span>
    </div>
  );
}
