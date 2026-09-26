'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { API } from '../lib/api';
import { useSeason } from './global';
import Dropdown from './Dropdown';
import { useAuth } from './auth';

// Minimal header for logged-out visitors everywhere: logo + Join stay,
// app nav/search/season only render once a session is known.
// NB: intentionally ignore `loading` — render nothing until session is known,
// so logged-out visitors never see the menu flash before it hides.
const MINIMAL_PATHS = ['/', '/login', '/register'];
function useLandingHidden() {
  const pathname = usePathname() || '/';
  const { user } = useAuth();
  if (MINIMAL_PATHS.includes(pathname)) return !user;
  return !user;
}

export const NAV = [
  { href: '/dashboard', label: 'Dashboard', match: (p) => p.startsWith('/dashboard') },
]; // NOTE: Analytics hidden for now — route still live at /analytics

export const NAV_GROUPS = [
  { label: 'Explore', items: [
    { href: '/horses', label: 'Horses', match: (p) => p.startsWith('/horses') },
    { href: '/riders', label: 'Riders', match: (p) => p.startsWith('/riders') },
    { href: '/events', label: 'Events', match: (p) => p.startsWith('/events') },
    { href: '/series', label: 'Series', match: (p) => p.startsWith('/series') },
  ]},
  { label: 'Intelligence', items: [
    { href: '/rankings', label: 'Rankings', match: (p) => p.startsWith('/rankings') },
    { href: '/comparison', label: 'Compare', match: (p) => p.startsWith('/comparison') },
  ]},
  { label: 'Workspace', items: [
    { href: '/watchlist', label: 'Watchlist', match: (p) => p.startsWith('/watchlist') },
    { href: '/my-stable', label: 'My Stable', match: (p) => p.startsWith('/my-stable') },
  ]},
];

export default function Navbar() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const hidden = useLandingHidden();
  const [open, setOpen] = useState(false);
  const [drop, setDrop] = useState(null); // open desktop dropdown label
  if (hidden) return null;
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
        {NAV_GROUPS.map((g) => {
          const active = g.items.some((i) => i.match(pathname));
          return (
            <span key={g.label} className="relative" onMouseLeave={() => setDrop(null)}>
              <button onClick={() => setDrop((d) => (d === g.label ? null : g.label))}
                onMouseEnter={() => setDrop(g.label)}
                className={`bg-none cursor-pointer flex items-center gap-1 no-underline text-sm px-0.5 pt-5 pb-[18px] transition-colors hover:text-white border-0 border-b-2 ${active ? 'text-white border-gold' : 'text-muted border-transparent'}`}>
                {g.label} <span className="text-[10px]">▾</span>
              </button>
              {drop === g.label && (
                <span className="absolute left-0 top-full pt-1 z-30 block">
                  <span className="block min-w-[160px] rounded border border-line bg-card2 py-1 shadow-xl">
                    {g.items.map((item) => (
                      <a key={item.href} href={item.href} onClick={() => setDrop(null)}
                        className={`block px-3.5 py-2 text-[13px] no-underline hover:bg-white/5 ${item.match(pathname) ? 'text-gold font-bold' : 'text-muted hover:text-white'}`}>
                        {item.label}
                      </a>
                    ))}
                  </span>
                </span>
              )}
            </span>
          );
        })}
      </nav>
      <button
        className="md:hidden bg-card border border-line rounded text-body w-8 h-8"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
      >
        ☰
      </button>
      {open && (
        <div className="absolute top-[60px] left-0 right-0 md:hidden bg-navbg border-b border-line px-7 py-2 flex flex-col max-h-[70vh] overflow-y-auto">
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
          {NAV_GROUPS.map((g) => (
            <span key={g.label}>
              <span className="block text-[10px] uppercase tracking-wide text-faint font-bold pt-3 pb-1">{g.label}</span>
              {g.items.map((item) => {
                const active = item.match(pathname);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`block no-underline text-sm py-2.5 border-b border-line/50 last:border-0 pl-3 ${
                      active ? 'text-gold font-bold' : 'text-muted'
                    }`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

export function NavSearch() {
  const router = useRouter();
  const hidden = useLandingHidden();
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
    hidden ? null :
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
  const hidden = useLandingHidden();
  if (hidden) return null;
  return (
    <span title="Season filter — applies to Horses, Riders & Events lists" className="hidden sm:block">
      <Dropdown ariaLabel="Season filter" value={season} placeholder="Season: All"
        options={[{ value: '', label: 'Season: All' },
          ...seasons.map((s) => ({ value: s, label: `Season ${s.replace('-', '/')}` }))]}
        onSelect={(o) => setSeason(o.value)}
        buttonClassName="bg-card max-w-[170px]" menuClassName="min-w-[170px]" />
    </span>
  );
}
