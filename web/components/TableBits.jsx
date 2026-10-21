'use client';
import { badge, BADGE } from '../lib/tokens';

// Shared table bits — one visual language for every datatable (admin +
// public): row actions, status pills, filter selects, counts. Replaces the
// ad-hoc text buttons (`bg-none border-0 … `), bare status strings and
// unstyled native selects scattered across pages.

// Small row action button. Tones: sky (default go-to action), gold
// (primary/buy-ish), danger, muted.
const TONES = {
  sky: 'border-sky/40 text-sky hover:bg-sky/10',
  gold: 'border-gold/50 text-gold hover:bg-goldbg/30',
  danger: 'border-line text-faint hover:text-blood hover:border-blood/50',
  muted: 'border-line text-muted hover:text-white',
};
export function RowBtn({ children, onClick, disabled, title, tone = 'sky', className = '' }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center gap-1 rounded-md border bg-none px-2.5 py-1 text-[12.5px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-wait ${TONES[tone] || TONES.sky} ${className}`}>
      {children}
    </button>
  );
}

// Status pill: `pending_payment` → "Pending Payment". Unknown values fall
// back to gray so new statuses never render as naked text.
const PILL = {
  paid: 'green', delivered: 'green', published: 'green', active: 'green',
  ready: 'green', live: 'green', current: 'green', resolved: 'green',
  approved: 'green', merged: 'green', success: 'green',
  pending: 'goldfill', awaiting_payment: 'goldfill', in_production: 'goldfill',
  draft: 'goldfill', in_review: 'goldfill', open: 'goldfill',
  processing: 'goldfill', queued: 'goldfill',
  cancelled: 'red', failed: 'red', refunded: 'red', rejected: 'red',
  archived: 'red', expired: 'red', anonymous: 'red',
  private: 'gray', showcase: 'gold', hidden: 'gray',
};
export function StatusPill({ value, className = '' }) {
  const raw = String(value ?? '').trim();
  if (!raw) return <span className="text-faint">—</span>;
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_');
  const tone = PILL[key] || 'gray';
  const label = raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={`${badge(BADGE[tone] || BADGE.gray)} ${className}`}>{label}</span>;
}

// Styled native select for table filter bars (searchable needs are covered
// by Dropdown). Options: [{ value, label }] or [[value, label]] pairs.
export function FilterSelect({ value, onChange, options = [], ariaLabel, className = '', style }) {
  const norm = (o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o);
  const list = options.map(norm);
  return (
    <span className={`relative inline-flex items-center ${className}`} style={style}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}
        className="appearance-none bg-ink border border-line text-body rounded-md pl-2.5 pr-8 py-2 text-[13px] focus:border-gold/60 focus:outline-none cursor-pointer">
        {list.map((o) => (
          <option key={String(o.value)} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-2.5 text-[10px] text-gold">▾</span>
    </span>
  );
}

// "1 order" / "5 orders" — kills the "1 orders" bug class everywhere.
export function Count({ n, one, many, className = '' }) {
  const v = Number(n) || 0;
  return <span className={className}>{v} {v === 1 ? one : (many || `${one}s`)}</span>;
}
