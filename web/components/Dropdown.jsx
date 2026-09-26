'use client';
import { useEffect, useId, useRef, useState } from 'react';

// Professional dropdown replacing native <select> across the app.
// Options: [{ value, label, ...extra }]. onSelect receives the full option.
// Server components can pass precomputed hrefs inside each option.
export default function Dropdown({
  value, options = [], onSelect,   placeholder = 'Select…', disabled = false,
  align = 'left', size = 'md', variant = 'field', searchable = false, ariaLabel,
  buttonClassName = '', menuClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
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

  const onBtnKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true); setActive(0);
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
    <div ref={rootRef} className="relative inline-flex max-w-full">
      <button
        ref={btnRef} type="button" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)} onKeyDown={onBtnKey}
        className={`flex items-center justify-between gap-2 rounded-lg font-semibold text-body hover:border-gold/50 focus:border-gold/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${btnSize} ${variant === 'bare' ? 'hover:bg-line/50' : ''} ${buttonClassName}`}
      >
        <span className="truncate">{current ? current.label : <span className="font-normal text-faint">{placeholder}</span>}</span>
        <span className={`text-[10px] text-gold transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && !disabled && (
        <div
          role="listbox" id={listId} aria-label={ariaLabel} tabIndex={-1} onKeyDown={onMenuKey}
          className={`absolute top-full z-50 mt-1.5 min-w-full overflow-hidden rounded-lg border border-line bg-card2 shadow-xl shadow-black/60 ${align === 'right' ? 'right-0' : 'left-0'} ${menuClassName}`}
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
          <ul className="max-h-60 overflow-y-auto py-1">
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
