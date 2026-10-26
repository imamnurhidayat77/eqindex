'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseISO = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtNZ = (iso) => {
  const d = parseISO(iso);
  return d ? d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
};

// Minimal dark-theme date picker. Controlled by key-remount for defaults:
// <DateField key={scope} name="date" defaultValue="2026-10-24" />
export default function DateField({ name, defaultValue = '', placeholder = 'Select date' }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const start = parseISO(defaultValue) || new Date();
  const [cursor, setCursor] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open ]);

  const cells = useMemo(() => {
    const first = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7;
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
    return Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => {
      const day = i - first + 1;
      return day > 0 && day <= days ? day : null;
    });
  }, [cursor]);

  const move = (dir) => {
    const n = new Date(cursor.y, cursor.m + dir, 1);
    setCursor({ y: n.getFullYear(), m: n.getMonth() });
  };
  const todayISO = toISO(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  return (
    <div className="ss" ref={rootRef}>
      <input type="hidden" name={name} value={value} />
      <button type="button" className="ss-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={value ? 'ss-val' : 'ss-ph'}>{value ? fmtNZ(value) : placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
      </button>
      {open && (
        <div className="ss-panel" role="dialog" aria-label="Choose date" style={{ padding: 12 }}>
          <div className="cal-head">
            <strong>{MONTHS[cursor.m]} {cursor.y}</strong>
            <div>
              <button type="button" aria-label="Previous month" onClick={() => move(-1)}>←</button>
              <button type="button" aria-label="Next month" onClick={() => move(1)}>→</button>
            </div>
          </div>
          <div className="cal-grid" aria-hidden="true">
            {WEEK.map((d) => <span key={d} className="cal-dow">{d}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map((day, i) => day === null ? <span key={i} /> : (
              <button type="button" key={i}
                className={`cal-day${toISO(cursor.y, cursor.m, day) === value ? ' sel' : ''}${toISO(cursor.y, cursor.m, day) === todayISO ? ' today' : ''}`}
                onClick={() => { setValue(toISO(cursor.y, cursor.m, day)); setOpen(false); }}>
                {day}
              </button>
            ))}
          </div>
          <div className="cal-foot">
            <button type="button" onClick={() => { const t = new Date(); setCursor({ y: t.getFullYear(), m: t.getMonth() }); }}>Today</button>
            {value && <button type="button" onClick={() => { setValue(''); setOpen(false); }}>Clear</button>}
          </div>
        </div>
      )}
    </div>
  );
}
