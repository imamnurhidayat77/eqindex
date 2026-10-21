'use client';
import { useState } from 'react';
import { INP } from '../lib/tokens';

// Event search over a local event list (no API call per keystroke).
// value: { value: id, label: name, slug } | null. Typing clears the pick
// and filters the list; picking sets it. Mirrors the Horse/RiderPicker UX.
export default function EventSearch({ events = [], value, onPick, placeholder }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const s = q.trim().toLowerCase();
  const shown = s
    ? events.filter((e) => (e.name || '').toLowerCase().includes(s)).slice(0, 8)
    : [];

  return (
    <div className="relative w-full">
      <input
        value={value ? value.label : q}
        onChange={(e) => { onPick(null); setQ(e.target.value); setOpen(true); }}
        onFocus={() => { if (shown.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'Search event…'}
        aria-label="Search event"
        className={`${INP} w-full !text-[13px] ${value ? '!border-gold/60' : ''}`} />
      {value && (
        <button onClick={() => { onPick(null); setQ(''); setOpen(false); }} title="Clear event filter"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-white bg-none border-0 cursor-pointer text-[14px]">✕</button>
      )}
      {open && !value && !!shown.length && (
        <div className="absolute left-0 right-0 top-[110%] z-30 max-h-56 overflow-y-auto rounded border border-line bg-card2 shadow-xl">
          {shown.map((e) => (
            <button key={e.id} onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => { onPick({ value: e.id, label: e.name, slug: e.slug || null }); setQ(''); setOpen(false); }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] text-white hover:bg-white/10 cursor-pointer bg-none border-0">
              <span className="truncate">{e.name}</span>
              <span className="text-[11px] text-faint shrink-0 ml-2">{(e.date_start || '').slice(0, 10)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
