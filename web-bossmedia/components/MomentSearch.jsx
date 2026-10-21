'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { API } from '../lib/api';
import { IconSearch } from './icons';

// "Find your moment": rider/horse text search with live suggestions
// (public endpoints). Discipline chips deferred — needs a discipline field
// on events/media first (no fake filters).
export default function MomentSearch() {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState([]);
  const [open, setOpen] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);

  function search(v) {
    setQ(v);
    clearTimeout(t.current);
    if (v.trim().length < 2) { setOpts([]); setOpen(false); return; }
    t.current = setTimeout(async () => {
      try {
        const [r, h] = await Promise.all([
          fetch(`${API}/api/riders/search?q=${encodeURIComponent(v.trim())}&limit=5`).then((x) => x.json()).catch(() => ({ data: [] })),
          fetch(`${API}/api/horses/search?q=${encodeURIComponent(v.trim())}&limit=5`).then((x) => x.json()).catch(() => ({})),
        ]);
        const list = [
          ...(Array.isArray(r.data) ? r.data.map((x) => ({ ...x, kind: 'rider' })) : []),
          ...(Array.isArray(h.data) ? h.data.map((x) => ({ ...x, kind: 'horse' })) : []),
        ];
        setOpts(list);
        setOpen(true);
      } catch { setOpts([]); }
    }, 250);
  }

  const hrefFor = (o) => `/photos?${o.kind === 'rider' ? 'rider' : 'horse'}=${o.id}`;

  return (
    <div style={{ position: 'relative', maxWidth: 620 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8a8a93', display: 'inline-flex' }}>
          <IconSearch />
        </span>
        <input value={q} onChange={(e) => search(e.target.value)} onFocus={() => { if (opts.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Find your moment — rider, horse, or event…"
          aria-label="Find your moment"
          style={{ width: '100%', padding: '13px 14px 13px 40px', fontSize: 16, borderRadius: 8, border: '1px solid #E7E2D8', background: '#fff', color: '#1C1C1A' }} />
        {open && !!opts.length && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', background: '#fff', border: '1px solid #E7E2D8', borderRadius: 12, overflow: 'hidden', zIndex: 30, boxShadow: '0 12px 32px rgba(28,28,26,.12)' }}>
            {opts.map((o) => (
              <Link key={`${o.kind}-${o.id}`} href={hrefFor(o)} onMouseDown={(e) => e.preventDefault()}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', fontSize: 14, textDecoration: 'none', color: '#1C1C1A' }}>
                <span><b>{o.name}</b> <span style={{ color: '#5E5B55' }}>· {o.kind === 'rider' ? 'Rider' : 'Horse'}</span></span>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        )}
        {open && q.trim().length >= 2 && !opts.length && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', background: '#fff', border: '1px solid #E7E2D8', borderRadius: 12, zIndex: 30, padding: '12px 14px', fontSize: 14, color: '#5E5B55' }}>
            No riders or horses found — try the <Link href="/events" style={{ color: '#1F3D2E', fontWeight: 700 }}>events list</Link>.
          </div>
        )}
      </div>
    </div>
  );
}
