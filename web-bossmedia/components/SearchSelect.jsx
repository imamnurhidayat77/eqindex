'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './figma';

// Panel height estimate for flip decisions (list caps at 60 rows + search).
const PANEL_H = 320;

// Searchable select in Figma voice. Props:
// options: [{ id, label, sub }], value: id|null, onChange(id),
// placeholder, onRequestCustom(query), disabled.
// loadOptions(query): remote search — when given, the list comes from the
// loader (debounced) instead of local filtering.
export default function SearchSelect({ options, value, onChange, placeholder = 'Select…', onRequestCustom, disabled = false, loadOptions = null, selectedOption = null, clearable = true, emptyHint = null }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [remote, setRemote] = useState(null);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const listId = useId();
  const seq = useRef(0);

  const selected = (remote || options).find((o) => String(o.id) === String(value))
    || options.find((o) => String(o.id) === String(value))
    || (value != null && selectedOption && String(selectedOption.id) === String(value) ? selectedOption : null);

  const filtered = useMemo(() => {
    if (loadOptions) return (remote || []).slice(0, 60);
    const s = q.trim().toLowerCase();
    const list = s
      ? options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(s))
      : options;
    return list.slice(0, 60);
  }, [options, q, remote, loadOptions]);

  useEffect(() => { setHi(0); }, [q, remote]);
  useEffect(() => {
    if (!loadOptions) return undefined;
    setLoading(true);
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const list = await loadOptions(q.trim());
        if (seq.current === my) { setRemote(Array.isArray(list) ? list : []); }
      } catch { if (seq.current === my) setRemote([]); }
      if (seq.current === my) setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, loadOptions]);
  // Panel lives in a body portal (fixed position) so no overflow container
  // — modal cards included — can clip it. Flips above when room is short.
  const measure = (btn) => {
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const fitsBelow = r.bottom + PANEL_H <= window.innerHeight - 12;
    return {
      left: Math.max(8, Math.min(r.left, window.innerWidth - 8)),
      width: Math.min(r.width, window.innerWidth - 16),
      ...(fitsBelow || r.top < PANEL_H
        ? { top: r.bottom + 6, bottom: undefined }
        : { top: undefined, bottom: window.innerHeight - r.top + 6 }),
    };
  };
  const place = () => {
    const m = measure(rootRef.current?.querySelector('.ss-btn'));
    if (m) setPos(m);
  };
  useEffect(() => {
    if (!open) return;
    place();
    const close = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open ]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open ]);

  const pick = (opt) => { onChange(opt ? opt.id : null, opt || null); setOpen(false); setQ(''); };

  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[hi]) pick(filtered[hi]);
        else if (onRequestCustom && q.trim()) { onRequestCustom(q.trim()); setOpen(false); setQ(''); }
        return;
      }
    if (!open) setOpen(true);
  };

  return (
    <div className="ss" ref={rootRef}>
      <button type="button" className="ss-btn" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          const willOpen = !open;
          if (willOpen) {
            setQ('');
            const m = measure(rootRef.current?.querySelector('.ss-btn'));
            if (m) setPos(m);
          }
          setOpen(willOpen);
        }}>
        <span className={selected ? 'ss-val' : 'ss-ph'}>
          {selected ? selected.label : placeholder}
        </span>
        {clearable && selected && !disabled && (
          <span className="ss-clear" role="button" aria-label="Clear selection" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(null, null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(null, null); } }}>
            <Icon name="close" size={14} />
          </span>
        )}
        <Icon name="chevron" size={16} />
      </button>
      {open && !disabled && pos && createPortal(
        <div ref={panelRef} className="ss-panel" role="listbox" id={listId} aria-label={placeholder}
          style={{ position: 'fixed', zIndex: 90, left: pos.left ?? undefined, width: pos.width, top: pos.top, bottom: pos.bottom }}>
          <div className="ss-search">
            <Icon name="search" size={15} />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
              placeholder="Type to search…" aria-label="Search options" />
          </div>
          <div className="ss-list">
            {loading && <div className="ss-empty">Searching…</div>}
            {!loading && (filtered.length ? filtered.map((o, i) => (
              <button type="button" key={o.id} role="option" aria-selected={String(value) === String(o.id)}
                className={`ss-opt${i === hi ? ' hi' : ''}${String(value) === String(o.id) ? ' sel' : ''}`}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(o)}>
                <span className="ss-opt-label">{o.label}</span>
                {o.sub && <span className="ss-opt-sub">{o.sub}</span>}
              </button>
            )) : (
              <div className="ss-empty">{emptyHint && !q.trim() ? emptyHint : <>No matches{q.trim() ? ` for “${q.trim()}”` : ''}.</>}</div>
            ))}
            {onRequestCustom && q.trim() && (
              <button type="button" className="ss-add" onClick={() => { onRequestCustom(q.trim()); setOpen(false); setQ(''); }}>
                + Add “{q.trim()}” manually
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
