'use client';
import { useEffect, useRef, useState } from 'react';
import { API } from '../lib/api';
import { INP } from '../lib/tokens';

// Public horse picker with searchable options (gallery filter).
// Mirrors RiderPicker: hits the public search endpoint — anonymous +
// photo-hidden horses are excluded server-side.
export default function HorsePicker({ value, onPick, placeholder }) {
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
        const r = await fetch(`${API}/api/horses/search?q=${encodeURIComponent(v.trim())}&limit=10`);
        const j = await r.json().catch(() => ({}));
        setOpts(Array.isArray(j.data) ? j.data : []);
        setOpen(true);
      } catch { setOpts([]); }
    }, 250);
  }

  return (
    <div className="relative min-w-[200px] grow">
      <input
        value={value ? value.name : q}
        onChange={(e) => { onPick(null); search(e.target.value); }}
        onFocus={() => { if (opts.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'Filter by horse…'}
        aria-label="Filter by horse"
        className={`${INP} w-full !text-[13px] ${value ? '!border-gold/60' : ''}`} />
      {value && (
        <button onClick={() => { onPick(null); setQ(''); setOpts([]); }} title="Clear horse filter"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-white bg-none border-0 cursor-pointer text-[14px]">✕</button>
      )}
      {open && !!opts.length && !value && (
        <div className="absolute left-0 right-0 top-[110%] z-30 max-h-56 overflow-y-auto rounded border border-line bg-card2 shadow-xl">
          {opts.map((o) => (
            <button key={o.id} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick({ id: o.id, name: o.name }); setOpen(false); setQ(''); }}
              className="flex w-full px-3 py-2 text-left text-[13px] text-white hover:bg-white/10 cursor-pointer bg-none border-0">
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
