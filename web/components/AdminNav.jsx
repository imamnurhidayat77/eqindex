'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { API } from '../lib/api';

const GROUPS = [
  { title: 'Manage', items: [
    ['/admin', '◈', 'Overview'],
    ['/admin/import', '⇪', 'CSV Import'],
    ['/admin/results/add', '＋', 'Add Result'],
    ['/admin/horses', '♞', 'Horses'],
    ['/admin/riders', '◉', 'Riders'],
    ['/admin/events', '▦', 'Events'],
    ['/admin/series', '🏆', 'Series'],
  ]},
  { title: 'Curate', items: [
    ['/admin/review', '🔎', 'Naming Review', 'review'],
    ['/admin/claims', '✔', 'Rider Claims', 'claims'],
    ['/admin/corrections', '✉', 'Corrections', 'corrections'],
  ]},
  { title: 'System', items: [
    ['/admin/users', '👥', 'Users'],
    ['/admin/activity', '📜', 'Audit Log'],
    ['/admin/data', '💾', 'Data Tools'],
    ['/admin/settings', '⚙', 'Settings'],
  ]},
];

export default function AdminNav({ user }) {
  const pathname = usePathname() || '/admin';
  const [counts, setCounts] = useState({});
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
  const active = (href) => href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
  return (
    <aside className="rounded border border-line bg-card lg:sticky lg:top-[76px] overflow-hidden">
      <div className="px-4 pt-3.5 pb-1 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded bg-gold text-black font-extrabold inline-flex items-center justify-center text-[15px]">E</span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-white leading-tight">Admin Console</div>
          <div className="text-[11px] text-muted truncate">{user.name} · {user.role}</div>
        </div>
      </div>
      <nav className="p-2 flex lg:flex-col gap-0.5 overflow-x-auto">
        {GROUPS.map((g) => (
          <div key={g.title} className="min-w-fit">
            <div className="hidden lg:block px-2.5 pt-3 pb-1 text-[10px] uppercase tracking-[0.8px] text-faint font-bold">{g.title}</div>
            {g.items.map(([href, icon, label, badgeKey]) => {
              const on = active(href);
              const n = badgeKey ? counts[badgeKey] : null;
              return (
                <a key={href} href={href}
                  className={`flex items-center gap-2.5 rounded px-2.5 py-2 text-[13px] no-underline whitespace-nowrap transition-colors border-l-2 ${
                    on ? 'bg-goldbg/50 border-gold text-gold font-bold' : 'border-transparent text-muted hover:bg-white/5 hover:text-white'
                  }`}>
                  <span className="w-4 text-center text-[13px]">{icon}</span>
                  {label}
                  {!!n && (
                    <span className="ml-auto bg-redbg text-blood text-[10px] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1">{n}</span>
                  )}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="p-2 border-t border-rowline">
        <a href="/" className="flex items-center gap-2.5 rounded px-2.5 py-2 text-[13px] text-faint no-underline hover:text-white">← Back to site</a>
      </div>
    </aside>
  );
}
