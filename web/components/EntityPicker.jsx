'use client';
import { useEffect, useRef, useState } from 'react';
import { INP } from '../lib/tokens';
import { useAdminApi } from './useAdminApi';

// Searchable horse/rider picker by NAME — the user never sees UUIDs/slugs.
// kind: 'horse' | 'rider'. value: {id, name} | null.
export default function EntityPicker({ kind, value, onPick, placeholder, width }) {
  const call = useAdminApi();
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
        const d = await call(`/admin/${kind === 'horse' ? 'horses' : 'riders'}?q=${encodeURIComponent(v.trim())}`);
        setOpts((d || []).slice(0, 8));
        setOpen(true);
      } catch { setOpts([]); }
    }, 250);
  }

  return (
    <div className="relative" style={width ? { width } : undefined}>
      <div className="flex items-center gap-1.5">
        <input
          value={value ? value.name : q}
          onChange={(e) => { onPick(null); search(e.target.value); }}
          onFocus={() => { if (opts.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder || `Type ${kind} name…`}
          className={`${INP} w-full !text-[13px] ${value ? '!border-moss/60' : ''}`}
        />
        {value && (
          <button onClick={() => { onPick(null); setQ(''); }} title="Clear"
            className="text-faint hover:text-white bg-none border-0 cursor-pointer text-[14px] shrink-0">✕</button>
        )}
      </div>
      {open && !!opts.length && !value && (
        <div className="absolute z-20 mt-1 w-full max-h-[220px] overflow-y-auto rounded border border-line bg-card2 shadow-xl">
          {opts.map((o) => (
            <button key={o.id} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick({ id: o.id, name: o.name }); setOpen(false); setQ(''); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-white/5">
              <span className="truncate font-semibold text-white">{o.name}</span>
              <span className="text-[11px] text-faint shrink-0 ml-2">{o.starts ?? ''} rounds</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
