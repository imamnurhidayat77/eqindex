'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API } from '../../lib/api';
import { H1, SUB } from '../../lib/tokens';
import { TableEmpty } from '../../components/EmptyState';

const TABS = [['', 'All'], ['photo', 'Photos'], ['reel', 'Reels']];

export default function Photos() {
  return (
    <Suspense>
      <PhotosInner />
    </Suspense>
  );
}

function PhotosInner() {
  const [rows, setRows] = useState([]);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const sp = useSearchParams();
  const fHorse = sp.get('horse') || '';
  const fRider = sp.get('rider') || '';
  const fEvent = sp.get('event') || '';
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '96' });
    if (kind) p.set('kind', kind);
    if (fHorse) p.set('horse_id', fHorse);
    if (fRider) p.set('rider_id', fRider);
    if (fEvent) p.set('event_id', fEvent);
    fetch(`${API}/photos?${p}`)
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [kind, fHorse, fRider, fEvent]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((x) =>
      [x.horse, x.rider, x.event_name].filter(Boolean).some((v) => v.toLowerCase().includes(s)));
  }, [rows, q]);

  return (
    <>
      <h1 className={H1}>Photos</h1>
      <p className={SUB}>Event photos and reels, tagged to horse and rider. <Link href="/photos/library" className="text-sky hover:underline">My photos →</Link></p>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 bg-card2 border border-line rounded p-1 overflow-x-auto w-fit">
          {TABS.map(([k, lbl]) => (
            <button key={k} onClick={() => setKind(k)}
              className={`px-3.5 py-[7px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${kind === k ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Horse, rider, event…"
          className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-white placeholder:text-faint focus:border-gold/60 focus:outline-none" style={{ width: 220 }} />
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <span key={i} className="sk h-40 w-full rounded" />)}
        </div>
      ) : filtered.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {filtered.map((x) => (
            <Link key={x.id} href={`/photos/${x.id}`} className="group block rounded border border-line bg-card overflow-hidden no-underline hover:border-gold/50">
              <div className="aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                {x.thumb_url || x.preview_url
                  ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition" />
                  : <span className="text-2xl">{x.kind === 'reel' ? '🎬' : '📷'}</span>}
              </div>
              <div className="p-2.5">
                <div className="text-[13px] font-bold text-white truncate">
                  {[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Untagged'}
                </div>
                <div className="text-[11px] text-faint truncate mt-0.5">{x.event_name || ''}</div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <TableEmpty icon="📷" title="No photos yet" hint="Published photos will appear here." />
      )}
    </>
  );
}
