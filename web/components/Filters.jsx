'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HEIGHT_BANDS } from '../lib/heights';
import Dropdown from './Dropdown';
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
      router.replace(`/dashboard?${p.toString()}`);
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
    router.push(qs ? `/dashboard?${qs}` : '/dashboard');
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
        <Dropdown variant="bare" ariaLabel="Season" value={season}
          options={[{ value: 'all', label: 'All Seasons' },
            ...seasons.map((s) => ({ value: s, label: s.replace('-', '/') }))]}
          onSelect={(o) => go({ season: o.value })} />
      </Pill>
      <Pill label="Entity Type" active={entity !== 'combination'} onClear={() => go({ entity: '' })}>
        <Dropdown variant="bare" ariaLabel="Entity Type" value={entity}
          options={[{ value: 'combination', label: 'Combination' }, { value: 'horse', label: 'Horse' }, { value: 'rider', label: 'Rider' }]}
          onSelect={(o) => go({ entity: o.value })} />
      </Pill>
      <Pill label="Height Category" active={height !== ''} onClear={() => go({ height: '' })}>
        <Dropdown variant="bare" ariaLabel="Height Category" value={height}
          options={HEIGHT_BANDS.map((h) => ({ value: h.v, label: h.v ? h.label : 'All Heights' }))}
          onSelect={(o) => go({ height: o.value })} />
      </Pill>
      <Pill label="Region" active={!!region} onClear={() => go({ region: '' })}>
        <Dropdown variant="bare" ariaLabel="Region" value={region} placeholder="All Regions"
          options={[{ value: '', label: 'All Regions' }, ...regions.map((r) => ({ value: r, label: r }))]}
          onSelect={(o) => go({ region: o.value })} />
      </Pill>
      <Pill label="Arena Type" active={!!arena} onClear={() => go({ arena: '' })}>
        <Dropdown variant="bare" ariaLabel="Arena Type" value={arena} placeholder="All Arenas"
          options={[{ value: '', label: 'All Arenas' }, ...arenas.map((a) => ({ value: a, label: a }))]}
          onSelect={(o) => go({ arena: o.value })} />
      </Pill>
      <Pill label="Minimum Rounds" active={minRounds !== '0'} onClear={() => go({ min_rounds: '' })}>
        <Dropdown variant="bare" ariaLabel="Minimum Rounds" value={minRounds}
          options={['0', '3', '5', '10'].map((n) => ({ value: n, label: `${n}+ Rounds` }))}
          onSelect={(o) => go({ min_rounds: o.value })} />
      </Pill>
      <Pill label="Date Range" active={range !== 'all'} onClear={() => go({ range: '' })}>
        <Dropdown variant="bare" ariaLabel="Date Range" value={range}
          options={RANGES.map(([k, l]) => ({ value: k, label: l }))}
          onSelect={(o) => go({ range: o.value })} />
      </Pill>
      <span className="text-sky text-xs cursor-pointer" onClick={() => router.push('/dashboard')}>Reset Filters</span>
    </div>
  );
}
