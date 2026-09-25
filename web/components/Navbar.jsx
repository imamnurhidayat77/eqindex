'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { API } from '../lib/api';
import { useSeason } from './global';

export const NAV = [
  { href: '/dashboard', label: 'Dashboard', match: (p) => p.startsWith('/dashboard') },
  { href: '/horses', label: 'Horses', match: (p) => p.startsWith('/horses') },
  { href: '/riders', label: 'Riders', match: (p) => p.startsWith('/riders') },
  { href: '/events', label: 'Events', match: (p) => p.startsWith('/events') },
  { href: '/rankings', label: 'Rankings', match: (p) => p.startsWith('/rankings') },
  { href: '/watchlist', label: 'Watchlist', match: (p) => p.startsWith('/watchlist') },
  { href: '/comparison', label: 'Compare', match: (p) => p.startsWith('/comparison') },
  { href: '/series', label: 'Series', match: (p) => p.startsWith('/series') },
]; // NOTE: Analytics hidden for now — route still live at /analytics

export default function Navbar() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const linkCls = (active) =>
    `no-underline text-sm px-0.5 pt-5 pb-[18px] transition-colors hover:text-white ${
      active ? 'text-white border-b-2 border-gold' : 'text-muted'
    }`;
  return (
    <>
      <nav className="hidden md:flex gap-[18px]">
        {NAV.map((item) => (
          <a key={item.href} href={item.href} className={linkCls(item.match(pathname))}>
            {item.label}
          </a>
        ))}
      </nav>
      <button
        className="md:hidden bg-card border border-line rounded text-body w-8 h-8"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
      >
        ☰
      </button>
      {open && (
        <div className="absolute top-[60px] left-0 right-0 md:hidden bg-navbg border-b border-line px-7 py-2 flex flex-col">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`no-underline text-sm py-2.5 border-b border-line/50 last:border-0 ${
                  active ? 'text-gold font-bold' : 'text-muted'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

export function NavSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const cache = useRef(null);

  async function ensure() {
    if (cache.current) return cache.current;
    try {
      const [h, r] = await Promise.all([
        (await fetch(`${API}/rankings/horses?limit=100`)).json(),
        (await fetch(`${API}/rankings/riders?limit=100`)).json(),
      ]);
      cache.current = {
        horses: (h.data || []).map((x) => ({ id: x.horse_id, name: x.horse })),
        riders: (r.data || []).map((x) => ({ id: x.rider_id, name: x.rider })),
      };
    } catch {
      cache.current = { horses: [], riders: [] };
    }
    return cache.current;
  }

  const [hits, setHits] = useState([]);
  async function onType(v) {
    setQ(v); setHi(0);
    if (v.trim().length < 2) { setHits([]); setOpen(false); return; }
    const c = await ensure();
    const s = v.trim().toLowerCase();
    const h = c.horses.filter((x) => (x.name || '').toLowerCase().includes(s)).slice(0, 5)
      .map((x) => ({ ...x, kind: 'horse' }));
    const r = c.riders.filter((x) => (x.name || '').toLowerCase().includes(s)).slice(0, 4)
      .map((x) => ({ ...x, kind: 'rider' }));
    setHits([...h, ...r]);
    setOpen(true);
  }

  function go(i) {
    const t = hits[i];
    if (!t) return;
    setOpen(false); setQ('');
    router.push(`/${t.kind === 'horse' ? 'horses' : 'riders'}/${t.id}`);
  }

  return (
    <div className="relative hidden sm:block" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <input
        value={q}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => { if (hits.length) setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') go(hi);
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="⌕  Search Intelligence..."
        className="bg-card border border-line rounded text-body px-3 py-[7px] w-[180px] text-[13px] placeholder:text-muted focus:border-gold/60 focus:outline-none"
      />
      {open && !!hits.length && (
        <div className="absolute right-0 z-20 mt-1 w-[260px] overflow-hidden rounded border border-line bg-card2 shadow-xl">
          {hits.map((t, i) => (
            <button key={`${t.kind}-${t.id}`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(i)}
              onMouseEnter={() => setHi(i)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] ${i === hi ? 'bg-white/10' : ''}`}>
              <span className="truncate font-semibold text-white">{t.name}</span>
              <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${t.kind === 'horse' ? 'bg-goldbg text-gold' : 'bg-bluebg text-sky'}`}>
                {t.kind === 'horse' ? 'HORSE' : 'RIDER'}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && q.trim().length >= 2 && !hits.length && (
        <div className="absolute right-0 z-20 mt-1 w-[260px] rounded border border-line bg-card2 px-3 py-2 text-[12px] text-muted">
          No horses or riders found.
        </div>
      )}
    </div>
  );
}

export function NavSeason() {
  const { season, seasons, setSeason } = useSeason();
  return (
    <select
      value={season}
      onChange={(e) => setSeason(e.target.value)}
      title="Season filter — applies to Horses, Riders & Events lists"
      className="hidden sm:block bg-card border border-line rounded text-body px-2 py-[7px] text-[13px] max-w-[150px] cursor-pointer focus:border-gold/60 focus:outline-none"
    >
      <option value="">Season: All ▾</option>
      {seasons.map((s) => (
        <option key={s} value={s}>Season {s.replace('-', '/')}</option>
      ))}
    </select>
  );
}
