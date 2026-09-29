'use client';
import { useEffect, useId, useRef, useState } from 'react';

// Professional dropdown replacing native <select> across the app.
// Options: [{ value, label, ...extra }]. onSelect receives the full option.
// Server components can pass precomputed hrefs inside each option.
export default function Dropdown({
  value, options = [], onSelect,   placeholder = 'Select…', disabled = false,
  align = 'left', size = 'md', variant = 'field', searchable = false, ariaLabel,
  buttonClassName = '', menuClassName = '', block = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  // Fixed-position menu: escapes overflow clipping (modals, table scroll
  // containers) and flips upward when there is no room below the button.
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const listId = useId();

  const norm = (o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o);
  const list = options.map(norm);
  const shown = query
    ? list.filter((o) => String(o.label).toLowerCase().includes(query.toLowerCase()))
    : list;
  const current = list.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false); setQuery(''); setActive(-1);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); setQuery(''); setActive(-1); btnRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  const pick = (o) => {
    setOpen(false); setQuery(''); setActive(-1);
    onSelect?.(o);
  };

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const ROW = 33, PAD = 10, SEARCH_H = 52, GAP = 6, EDGE = 8;
      const need = Math.min(list.length * ROW + (searchable ? SEARCH_H : 0) + PAD, 320);
      const width = Math.max(r.width, 168);
      const below = window.innerHeight - r.bottom - EDGE;
      const above = r.top - EDGE;
      let top, maxH;
      if (below >= need || below >= above) {
        top = r.bottom + GAP;
        maxH = Math.max(80, Math.min(need, below - GAP));
      } else {
        maxH = Math.max(80, Math.min(need, above - GAP));
        top = r.top - GAP - maxH;
      }
      let left = align === 'right' ? r.right - width : r.left;
      left = Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE));
      setPos({ top, left, width, maxH, listMax: Math.max(60, maxH - (searchable ? SEARCH_H : PAD)) });
    }
    setOpen(true); setActive(0);
  };

  // Detached fixed menu must close when the page/modal behind it scrolls.
  useEffect(() => {
    if (!open) return;
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    const onResize = () => setOpen(false);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open ]);

  const onBtnKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) setOpen(false); else openMenu();
    }
  };
  const onMenuKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && shown[active]) { e.preventDefault(); pick(shown[active]); }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1); }
  };

  const btnSize = variant === 'bare'
    ? 'px-1 py-[2px] text-xs bg-transparent border-0'
    : size === 'sm'
      ? 'px-2 py-[3px] text-xs bg-ink border border-line'
      : 'px-2.5 py-2 text-[13px] bg-ink border border-line';

  return (
    <div ref={rootRef} className={`relative max-w-full ${block ? 'flex w-full' : 'inline-flex'}`}>
      <button
        ref={btnRef} type="button" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())} onKeyDown={onBtnKey}
        className={`flex items-center justify-between gap-2 rounded-lg font-semibold text-body hover:border-gold/50 focus:border-gold/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${btnSize} ${variant === 'bare' ? 'hover:bg-line/50' : ''} ${block ? 'w-full' : ''} ${buttonClassName}`}
      >
        <span className="truncate">{current ? current.label : <span className="font-normal text-faint">{placeholder}</span>}</span>
        <span className={`text-[10px] text-gold transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && !disabled && (
        <div
          ref={menuRef} role="listbox" id={listId} aria-label={ariaLabel} tabIndex={-1} onKeyDown={onMenuKey}
          style={pos ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH, zIndex: 70 } : undefined}
          className={`overflow-hidden rounded-lg border border-line bg-card2 shadow-xl shadow-black/60 ${menuClassName}`}
        >
          {searchable && (
            <div className="border-b border-line p-1.5">
              <input
                ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                placeholder="Type to filter…" onKeyDown={onMenuKey}
                className="w-full rounded-md border border-line bg-ink px-2.5 py-1.5 text-xs text-white placeholder:text-faint focus:border-gold/60 focus:outline-none"
              />
            </div>
          )}
          <ul className="overflow-y-auto py-1" style={pos ? { maxHeight: pos.listMax } : { maxHeight: 240 }}>
            {!shown.length && <li className="px-3 py-2 text-xs text-faint">No matches</li>}
            {shown.map((o, i) => {
              const sel = String(o.value) === String(value);
              return (
                <li key={`${o.value}-${i}`} role="option" aria-selected={sel}>
                  <button
                    type="button" onClick={() => pick(o)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs ${
                      i === active ? 'bg-line/70 text-white' : sel ? 'text-gold' : 'text-muted'
                    } hover:bg-line/70 hover:text-white`}
                  >
                    <span className={`truncate ${sel ? 'font-semibold text-gold' : ''}`}>{o.label}</span>
                    {sel && <span className="text-[11px] text-gold">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
