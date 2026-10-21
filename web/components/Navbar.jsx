'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { API } from '../lib/api';
import { useSeason } from './global';
import Dropdown from './Dropdown';
import { useAuth } from './auth';
import { useDismiss } from './useDismiss';

// Minimal header for logged-out visitors everywhere: logo + Join stay,
// app nav/search/season only render once a session is known.
// NB: intentionally ignore `loading` — render nothing until session is known,
// so logged-out visitors never see the menu flash before it hides.
function useLandingHidden() {
  const { user } = useAuth();
  return !user;
}

// Flat interest-group tabs. Rankings / Compare / Analytics / My Stable are
// hidden from the nav — routes still live and linkable.
export const NAV = [
  { href: '/', label: 'Home', match: (p) => p === '/' },
  { href: '/events', label: 'Events', match: (p) => p.startsWith('/events') },
  { href: '/series', label: 'Series', match: (p) => p.startsWith('/series') },
  { href: '/standings', label: 'Standings', match: (p) => p.startsWith('/standings') },
  { href: '/riders', label: 'Riders', match: (p) => p.startsWith('/riders') },
  { href: '/horses', label: 'Horses', match: (p) => p.startsWith('/horses') },
  { href: '/stallions', label: 'Stallions', match: (p) => p.startsWith('/stallions') },
  { href: '/breeders', label: 'Breeders', match: (p) => p.startsWith('/breeders') },
  // Watchlists — the old /dashboard URL redirects here.
  { href: '/watchlist', label: 'Watchlist', match: (p) => p.startsWith('/watchlist') || p.startsWith('/dashboard') },
  { href: '/reels/order', label: 'Reels', match: (p) => p.startsWith('/reels') },
  { href: '/photos', label: 'Photos', match: (p) => p.startsWith('/photos') },
];

export default function Navbar() {
  const pathname = usePathname() || '/';
  const hidden = useLandingHidden();
  const [open, setOpen] = useState(false);
  const menuRef = useDismiss(open, () => setOpen(false));
  if (hidden) return null;
  const linkCls = (active) =>
    `no-underline text-sm px-0.5 pt-5 pb-[18px] transition-colors hover:text-white ${
      active ? 'text-white border-b-2 border-gold' : 'text-muted'
    }`;
  return (
    <span ref={menuRef} className="contents">
      <nav className="hidden xl:flex gap-[18px]">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={linkCls(item.match(pathname))}>
            {item.label}
          </Link>
        ))}
      </nav>
      <button
        className="xl:hidden bg-card border border-line rounded text-body w-8 h-8"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
      >
        ☰
      </button>
      {open && (
        <div className="absolute top-[60px] left-0 right-0 xl:hidden bg-navbg border-b border-line px-7 py-2 flex flex-col max-h-[70vh] overflow-y-auto">
          <div className="py-2 border-b border-line/50">
            <NavSearch mobile onGo={() => setOpen(false)} />
          </div>
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`no-underline text-sm py-2.5 border-b border-line/50 last:border-0 ${
                  active ? 'text-gold font-bold' : 'text-muted'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </span>
  );
}

export function NavSearch({ mobile = false, onGo = null }) {
  const router = useRouter();
  const hidden = useLandingHidden();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [hits, setHits] = useState([]);
  const timer = useRef(null);
  const seq = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onType(v) {
    setQ(v); setHi(0);
    clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const my = ++seq.current;
      const s = v.trim();
      try {
        const [hj, rj, ej] = await Promise.all([
          (await fetch(`${API}/api/horses/search?q=${encodeURIComponent(s)}&limit=4`)).json().catch(() => ({})),
          (await fetch(`${API}/api/riders/search?q=${encodeURIComponent(s)}&limit=4`)).json().catch(() => ({})),
          (await fetch(`${API}/api/events/search?q=${encodeURIComponent(s)}&limit=4`)).json().catch(() => ({})),
        ]);
        if (seq.current !== my) return; // stale response
        const h = (Array.isArray(hj.data) ? hj.data : [])
          .map((x) => ({ id: x.id, name: x.name, kind: 'horse' }));
        const r = (Array.isArray(rj.data) ? rj.data : [])
          .map((x) => ({ id: x.id, name: x.name, kind: 'rider' }));
        const e = (Array.isArray(ej.data) ? ej.data : [])
          .map((x) => ({ id: x.id, name: x.name, sub: x.venue, kind: 'event' }));
        setHits([...h, ...r, ...e]);
        setOpen(true);
      } catch {
        if (seq.current === my) { setHits([]); setOpen(true); }
      }
    }, 250);
  }

  function go(i) {
    const t = hits[i];
    if (!t) return;
    setOpen(false); setQ(''); setHits([]); clearTimeout(timer.current);
    const base = t.kind === 'horse' ? 'horses' : t.kind === 'rider' ? 'riders' : 'events';
    if (onGo) onGo();
    router.push(`/${base}/${t.id}`);
  }

  return (
    hidden ? null :
    <div className={`relative ${mobile ? 'block xl:hidden' : 'hidden xl:block'}`} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
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
        placeholder="⌕  Search..."
        aria-label="Search horses, riders and events"
        className={`bg-card border border-line rounded text-body px-3 py-[7px] text-[13px] placeholder:text-muted focus:border-gold/60 focus:outline-none ${mobile ? 'w-full' : 'w-[180px]'}`}
      />
      {open && !!hits.length && (
        <div className={`absolute z-20 mt-1 overflow-hidden rounded border border-line bg-card2 shadow-xl ${mobile ? 'left-0 right-0' : 'right-0 w-[260px]'}`}>
          {hits.map((t, i) => (
            <button key={`${t.kind}-${t.id}`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(i)}
              onMouseEnter={() => setHi(i)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] ${i === hi ? 'bg-white/10' : ''}`}>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-white">{t.name}</span>
                {t.sub ? <span className="block truncate text-[11px] text-muted">{t.sub}</span> : null}
              </span>
              <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${t.kind === 'horse' ? 'bg-goldbg text-gold' : t.kind === 'rider' ? 'bg-bluebg text-sky' : 'bg-green-500/15 text-green-400'}`}>
                {t.kind === 'horse' ? 'HORSE' : t.kind === 'rider' ? 'RIDER' : 'EVENT'}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && q.trim().length >= 2 && !hits.length && (
        <div className={`absolute z-20 mt-1 rounded border border-line bg-card2 px-3 py-2 text-[12px] text-muted ${mobile ? 'left-0 right-0' : 'right-0 w-[260px]'}`}>
          No horses, riders or events found.
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
