'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API } from '../lib/api';

// Admin command palette (Ctrl/⌘+K): jump to pages + fuzzy-find
// horses, riders, events and classes via /admin/lookup.
const COMMANDS = [
  ['Overview', '/admin', '◈', 'Console home'],
  ['CSV Import', '/admin/import', '⇪', 'Upload organiser results'],
  ['Add Result', '/admin/results/add', '＋', 'Manual single entry'],
  ['Manage Horses', '/admin/horses', '♞', 'Profiles & visibility'],
  ['Manage Riders', '/admin/riders', '◉', 'Regions & visibility'],
  ['Manage Events', '/admin/events', '▦', 'Details & on/off'],
  ['Classes', '/admin/classes', '◫', 'Per-class tracking switches'],
  ['Series', '/admin/series', '★', 'Qual rules & labelling'],
  ['Categories', '/admin/categories', '⛉', 'Rider category titles & matching'],
  ['Scoring', '/admin/scoring', '✦', 'Rules versions & preview'],
  ['Naming Review', '/admin/review', '◐', 'Resolve ambiguous names'],
  ['Rider Claims', '/admin/claims', '✔', 'Approve ownership'],
  ['Corrections', '/admin/corrections', '✉', 'Triage public reports'],
  ['Users', '/admin/users', '●', 'Roles & sessions'],
  ['Audit Log', '/admin/activity', '☰', 'Every change'],
  ['Data Tools', '/admin/data', '▣', 'Backup & wipe'],
  ['Settings', '/admin/settings', '⚙', 'Workspace'],
];

const LOOKUPS = [
  ['horse', 'Horses', '/horses'],
  ['rider', 'Riders', '/riders'],
  ['event', 'Events', '/events'],
  ['class', 'Classes', null],
];

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return [open, setOpen];
}

export default function CommandPalette({ open, onClose }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ(''); setHits([]); setHi(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setHits([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const out = await Promise.all(LOOKUPS.map(async ([type, group, base]) => {
          const res = await fetch(`${API}/admin/lookup?type=${type}&q=${encodeURIComponent(query)}`, { credentials: 'include' });
          if (!res.ok) return [];
          const j = await res.json();
          return (j.data || []).slice(0, 4).map((r) => ({
            key: `${type}-${r.id}`, group,
            label: r.name, sub: type === 'class' ? `${r.class_date || ''}`.slice(0, 10) : null,
            href: base ? `${base}/${r.id}` : null,
          }));
        }));
        setHits(out.flat());
      } catch { setHits([]); }
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const cmds = COMMANDS
    .filter(([label]) => label.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 7)
    .map(([label, href, icon, sub]) => ({ key: `cmd-${href}`, group: 'Go to', label, sub, href, icon }));
  const items = [...cmds, ...hits.filter((h) => h.href)];

  const go = useCallback((it) => {
    if (!it || !it.href) return;
    onClose();
    router.push(it.href);
  }, [onClose, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
      else if (e.key === 'Enter') go(items[hi]);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => { setHi(0); }, [q, hits.length]);

  if (!open) return null;
  let lastGroup = null;
  return (
    <div className="fixed inset-0 z-[80] isolate" role="dialog" aria-modal="true" aria-label="Admin command palette">
      <div aria-hidden="true" onClick={onClose} className="modal-fade absolute inset-0 bg-black/80 backdrop-blur-[3px]" />
      <div className="modal-pop relative mx-auto mt-[12vh] w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded border border-line shadow-2xl"
        style={{ backgroundColor: '#1E1E1E' }}>
        <div className="h-[3px] bg-gold" aria-hidden="true" />
        <div className="flex items-center gap-2 border-b border-line px-4">
          <span className="text-faint text-[15px]" aria-hidden="true">⌘</span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(items[hi]); } }}
            placeholder="Jump to a page, horse, rider or event… (min 2 chars for search)"
            className="w-full bg-transparent py-3.5 text-[14px] text-white placeholder:text-faint focus:outline-none" />
          {searching && <span className="spinner spinner-gold" aria-hidden="true" />}
        </div>
        <div className="max-h-[46vh] overflow-y-auto p-1.5">
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {head && <div className="px-2.5 pt-2 pb-1 text-[10px] uppercase tracking-[0.8px] text-faint font-bold">{head}</div>}
                <button onClick={() => go(it)} onMouseEnter={() => setHi(i)}
                  className={`flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] cursor-pointer border-0 ${i === hi ? 'bg-white/10' : 'bg-transparent'}`}>
                  {it.icon && <span className="w-4 text-center text-gold">{it.icon}</span>}
                  <span className="truncate font-semibold text-white">{it.label}</span>
                  {it.sub && <span className="ml-auto shrink-0 text-[11px] text-faint truncate max-w-[45%]">{it.sub}</span>}
                </button>
              </div>
            );
          })}
          {!items.length && !searching && (
            <div className="px-3 py-6 text-center text-[13px] text-muted">
              {q.trim().length >= 2 ? 'No matches — try a name or page.' : 'Type to search records, or pick a page above.'}
            </div>
          )}
        </div>
        <div className="flex gap-4 border-t border-line px-4 py-2 text-[11px] text-faint">
          <span><b className="text-muted">↑↓</b> navigate</span>
          <span><b className="text-muted">↵</b> open</span>
          <span><b className="text-muted">esc</b> close</span>
        </div>
      </div>
    </div>
  );
}
