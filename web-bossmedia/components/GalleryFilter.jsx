'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { API } from '../lib/api';
import { IconSearch } from './icons';

// Gallery filter bar: kind tabs (links), text search (links on submit),
// rider quick-pick (public search, navigates on select).
export default function GalleryFilter({ kind, q, riderName }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [text, setText] = useState(q || '');
  const [rq, setRq] = useState('');
  const [opts, setOpts] = useState([]);
  const [open, setOpen] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);

  const go = (patch) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) p.delete(k); else p.set(k, v);
    }
    router.push(`/photos?${p.toString()}`);
  };

  function searchRider(v) {
    setRq(v);
    clearTimeout(t.current);
    if (v.trim().length < 2) { setOpts([]); setOpen(false); return; }
    t.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/riders/search?q=${encodeURIComponent(v.trim())}&limit=8`).then((x) => x.json());
        setOpts(Array.isArray(r.data) ? r.data : []);
        setOpen(true);
      } catch { setOpts([]); }
    }, 250);
  }

  const tab = (k, label) => {
    const p = new URLSearchParams(sp.toString());
    if (!k) p.delete('kind'); else p.set('kind', k);
    const on = (kind || '') === k;
    return (
      <Link key={k} href={`/photos?${p.toString()}`} aria-current={on ? 'page' : undefined}
        style={{ padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none',
          background: on ? '#1C1C1A' : 'transparent', color: on ? '#fff' : '#5E5B55' }}>
        {label}
      </Link>
    );
  };

  return (
    <div className="card" style={{ padding: 12, marginBottom: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: '#F6F6F4', borderRadius: 10, padding: 4 }}>
          {tab('', 'All')}{tab('photo', 'Photos')}{tab('reel', 'Reels')}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); go({ q: text.trim() }); }} style={{ position: 'relative', flex: '1 1 200px', display: 'flex' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8a8a93', display: 'inline-flex' }}><IconSearch /></span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Horse, rider, event…"
            aria-label="Search photos"
            style={{ width: '100%', padding: '10px 12px 10px 38px', fontSize: 16, borderRadius: 8, border: '1px solid #E7E2D8', background: '#fff' }} />
        </form>
        <div style={{ position: 'relative', flex: '1 1 180px' }}>
          <input value={rq} onChange={(e) => { setRq(e.target.value); searchRider(e.target.value); }} onFocus={() => { if (opts.length) setOpen(true); }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={riderName ? `Rider: ${riderName} (type to change)` : 'Filter by rider…'}
            aria-label="Filter by rider"
            style={{ width: '100%', padding: '10px 12px', fontSize: 16, borderRadius: 8, border: '1px solid #E7E2D8', background: '#fff' }} />
          {open && !!opts.length && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', background: '#fff', border: '1px solid #E7E2D8', borderRadius: 12, overflow: 'hidden', zIndex: 30, boxShadow: '0 12px 32px rgba(28,28,26,.12)', maxHeight: 260, overflowY: 'auto' }}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { go({ rider: '' }); setRq(''); setOpen(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 14, background: 'none', border: 0, cursor: 'pointer', color: '#1F3D2E', fontWeight: 700 }}>
                All riders ✕ clear
              </button>
              {opts.map((o) => (
                <button type="button" key={o.id} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { go({ rider: o.id }); setRq(''); setOpen(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 14, background: 'none', border: 0, cursor: 'pointer', color: '#1C1C1A' }}>
                  <b>{o.name}</b>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
