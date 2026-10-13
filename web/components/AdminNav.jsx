'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { API } from '../lib/api';
import CommandPalette, { useCommandPalette } from './CommandPalette';

// Top-level entry, always visible.
const MANAGE_TOP = [
  ['/admin', '◈', 'Overview'],
];

// Long MANAGE list, grouped into collapsibles so the sidebar stays tidy.
const MANAGE_GROUPS = [
  { title: 'Import', items: [
    ['/admin/import', '⇪', 'CSV Import'],
    ['/admin/assistant', '✨', 'Import Assistant'],
    ['/admin/results/add', '＋', 'Add Result'],
  ]},
  { title: 'Records', items: [
    ['/admin/horses', '♞', 'Horses'],
    ['/admin/riders', '◉', 'Riders'],
    ['/admin/events', '▦', 'Events'],
    ['/admin/classes', '◫', 'Classes'],
  ]},
  { title: 'Setup', items: [
    ['/admin/seasons', '◑', 'Seasons'],
    ['/admin/series', '★', 'Series'],
    ['/admin/categories', '⛉', 'Categories'],
    ['/admin/scoring', '✦', 'Scoring'],
    ['/admin/rating', '◎', 'Rating'],
    ['/admin/pricing', '◆', 'Pricing'],
  ]},
  { title: 'Media', items: [
    ['/admin/media', '◍', 'Media Library'],
    ['/admin/media/upload', '⇪', 'Media Upload'],
  ]},
];

// Short sections stay flat — no need to collapse.
const FLAT_GROUPS = [
  { title: 'Curate', items: [
    ['/admin/review', '◐', 'Naming Review', 'review'],
    ['/admin/claims', '✔', 'Rider Claims', 'claims'],
    ['/admin/corrections', '✉', 'Corrections', 'corrections'],
  ]},
  { title: 'System', items: [
    ['/admin/users', '●', 'Users'],
    ['/admin/activity', '☰', 'Audit Log'],
    ['/admin/data', '▣', 'Data Tools'],
    ['/admin/settings', '⚙', 'Settings'],
  ]},
];

const STORE_KEY = 'eqindex-adminnav-open-v1';

const startsWithPath = (pathname, href) =>
  href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

// All nav hrefs, for longest-prefix-wins active state (so /admin/media
// doesn't also light up on /admin/media/upload).
const ALL_HREFS = [
  ...MANAGE_TOP.map(([href]) => href),
  ...MANAGE_GROUPS.flatMap((g) => g.items.map(([href]) => href)),
  ...FLAT_GROUPS.flatMap((g) => g.items.map(([href]) => href)),
];

const groupOf = (pathname) =>
  MANAGE_GROUPS.find((g) => g.items.some(([href]) => startsWithPath(pathname, href)))?.title;

export default function AdminNav({ user }) {
  const pathname = usePathname() || '/admin';
  const [counts, setCounts] = useState({});
  const [palOpen, setPalOpen] = useCommandPalette();
  // Collapsed state only affects desktop (lg+); on mobile the headers are
  // hidden and every item stays visible in the horizontal scroll row.
  const [open, setOpen] = useState(() => {
    const defaults = Object.fromEntries(
      MANAGE_GROUPS.map((g) => [g.title, g.title === groupOf(pathname)]),
    );
    if (typeof window === 'undefined') return defaults;
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') return { ...defaults, ...saved };
    } catch { /* corrupted storage — fall back to defaults */ }
    return defaults;
  });
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/admin/overview`, { credentials: 'include' });
        if (!res.ok) return;
        const c = (await res.json()).data.counts;
        setCounts({ review: c.pendingReview, claims: c.pendingClaims });
        const corr = await fetch(`${API}/admin/corrections?status=open`, { credentials: 'include' });
        if (corr.ok) {
          const cj = await corr.json();
          setCounts((p) => ({ ...p, corrections: (cj.data || []).length }));
        }
      } catch { /* badges optional */ }
    })();
  }, []);
  // Deep links / palette jumps into a collapsed group force it open.
  useEffect(() => {
    const t = groupOf(pathname);
    if (!t) return;
    setOpen((p) => {
      if (p[t]) return p;
      const next = { ...p, [t]: true };
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [pathname]);
  const toggle = (title) => setOpen((p) => {
    const next = { ...p, [title]: !p[title] };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
    return next;
  });
  const active = (href) => {
    if (!startsWithPath(pathname, href)) return false;
    if (href === '/admin') return true;
    // Longest matching href wins — /admin/media/upload must not also
    // activate /admin/media.
    return ALL_HREFS.every((h) =>
      h.length <= href.length || !(pathname === h || pathname.startsWith(`${h}/`)));
  };
  const row = ([href, icon, label, badgeKey], sub = false) => {
    const on = active(href);
    const n = badgeKey ? counts[badgeKey] : null;
    return (
      <Link key={href} href={href}
        className={`flex items-center gap-2.5 rounded px-2.5 py-2 text-[13px] no-underline whitespace-nowrap transition-colors border-l-2 ${sub ? 'lg:pl-6' : ''} ${
            on ? 'bg-goldbg/50 border-gold text-gold font-bold' : 'border-transparent text-muted hover:bg-white/5 hover:text-white'
          }`}>
        <span className="w-4 text-center text-[13px]">{icon}</span>
        {label}
        {!!n && (
          <span className="ml-auto bg-redbg text-blood text-[10px] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1">{n}</span>
        )}
      </Link>
    );
  };
  return (
    <aside className="rounded border border-line bg-card lg:sticky lg:top-[76px] overflow-hidden">
      <div className="px-4 pt-3.5 pb-1 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded bg-gold text-black font-extrabold inline-flex items-center justify-center text-[15px]">E</span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-white leading-tight">Admin Console</div>
          <div className="text-[11px] text-muted truncate">{user.name} · {user.role}</div>
        </div>
      </div>
      <div className="px-4 pb-2">
        <button onClick={() => setPalOpen(true)}
          className="flex w-full items-center gap-2 rounded border border-line bg-ink px-2.5 py-[7px] text-[12px] text-faint hover:text-muted hover:border-faint cursor-pointer transition-colors">
          <span aria-hidden="true">⌕</span> Jump to…
          <kbd className="ml-auto rounded border border-line bg-card2 px-1.5 py-px text-[10px] text-muted font-sans">⌘K</kbd>
        </button>
      </div>
      <nav className="p-2 flex lg:flex-col gap-0.5 overflow-x-auto">
        <div className="min-w-fit">
          <div className="hidden lg:block px-2.5 pt-3 pb-1 text-[10px] uppercase tracking-[0.8px] text-faint font-bold">Manage</div>
          {MANAGE_TOP.map((item) => row(item))}
          {MANAGE_GROUPS.map((g) => {
            const isOpen = !!open[g.title];
            const hasActive = g.items.some(([href]) => active(href));
            return (
              <div key={g.title} className="contents lg:block">
                <button onClick={() => toggle(g.title)} aria-expanded={isOpen}
                  className={`hidden lg:flex w-full items-center gap-1.5 rounded px-2.5 pt-2.5 pb-1 text-[10px] uppercase tracking-[0.8px] font-bold cursor-pointer transition-colors ${hasActive ? 'text-gold' : 'text-faint hover:text-muted'}`}>
                  <span aria-hidden="true" className="text-[9px] w-3">{isOpen ? '▾' : '▸'}</span>
                  {g.title}
                </button>
                <div className={`contents ${isOpen ? 'lg:block' : 'lg:hidden'}`}>
                  {g.items.map((item) => row(item, true))}
                </div>
              </div>
            );
          })}
        </div>
        {FLAT_GROUPS.map((g) => (
          <div key={g.title} className="min-w-fit">
            <div className="hidden lg:block px-2.5 pt-3 pb-1 text-[10px] uppercase tracking-[0.8px] text-faint font-bold">{g.title}</div>
            {g.items.map((item) => row(item))}
          </div>
        ))}
      </nav>
      <div className="p-2 border-t border-rowline">
        <Link href="/" className="flex items-center gap-2.5 rounded px-2.5 py-2 text-[13px] text-faint no-underline hover:text-white">← Back to site</Link>
      </div>
      <CommandPalette open={palOpen} onClose={() => setPalOpen(false)} />
    </aside>
  );
}
