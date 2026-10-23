'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { nzdc, studio, useStudioUser } from '../lib/studio';
import { Icon } from './figma';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
const DialogCtx = createContext({ confirm: async () => false, prompt: async () => null });
export const useDialog = () => useContext(DialogCtx);

const TABS = [
  ['/studio', 'Overview', 'overview'],
  ['/studio/library', 'Library', 'library'],
  ['/studio/upload', 'Upload', 'upload'],
  ['/studio/reels', 'Pre-book orders', 'reels'],
  ['/studio/sales', 'Sales', 'sales'],
  ['/studio/pricing', 'Pricing', 'pricing'],
  ['/studio/admin', 'Admin', 'admin', true], // adminOnly
];

export default function StudioShell({ active, kpis, children }) {
  const { user, state } = useStudioUser();
  const pathname = usePathname();
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  const notify = useCallback((msg, err = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    setDialog({ kind: 'confirm', input: '', ...opts, resolve });
  }), []);

  const prompt = useCallback((opts) => new Promise((resolve) => {
    setDialog({ kind: 'prompt', input: opts.initial ?? '', ...opts, resolve });
  }), []);

  const closeDialog = useCallback((value) => {
    setDialog((d) => { if (d) d.resolve(value); return null; });
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeDialog(dialog.kind === 'confirm' ? false : null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, closeDialog]);

  if (state === 'loading') {
    return (
      <div className="studio-page">
        <main className="section-gutter st-hero"><p className="eyebrow">Boss Studio</p><p style={{ color: '#777' }}>Loading…</p></main>
      </div>
    );
  }
  if (state === 'login') {
    return (
      <div className="studio-page">
        <main className="section-gutter st-hero">
          <p className="eyebrow">Boss Studio · Photographer</p>
          <h1>My studio.</h1>
          <p>Sign in with a photographer account to open the console.</p>
          <p style={{ marginTop: 20 }}><Link href="/login?next=/studio" className="st-btn">Sign in</Link></p>
        </main>
      </div>
    );
  }
  if (state === 'denied') {
    return (
      <div className="studio-page">
        <main className="section-gutter st-hero">
          <p className="eyebrow">Boss Studio · Photographer</p>
          <h1>Not your studio.</h1>
          <p>Signed in as {user?.email} — this console needs a photographer account.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="studio-page">
      <header className="header">
        <Link href="/" className="wordmark" aria-label="Boss Media home">BOSS<span>MEDIA</span></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link href="/events">Event galleries</Link>
          <Link href="/pre-book">Pre-book</Link>
          <Link href="/reels">Reels</Link>
        </nav>
        <div className="header-actions">
          <Link href="/media" className="signin" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#fff', color: '#101010', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>
              {(user?.name || user?.email || 'P').slice(0, 1).toUpperCase()}
            </span>
            {user?.name?.split(' ')[0] || 'Studio'}
          </Link>
          <Link href="/cart" className="icon-button cart" aria-label="View cart"><Icon name="cart" /><CartCount /></Link>
        </div>
      </header>
      <main className="section-gutter">
        <div className="st-hero">
          <div className="st-hero-row">
            <div>
              <p className="eyebrow">Boss Studio · Photographer</p>
              <h1>My studio.</h1>
              <p>Kia ora, {user?.name?.split(' ')[0] || 'photographer'} — shoot, tag, publish, get paid.</p>
            </div>
            <div className="st-hero-actions">
              <Link href="/studio/upload">Upload batch <Icon name="arrow" size={14} /></Link>
              <Link href="/events">View shop</Link>
            </div>
          </div>
          <nav className="st-tabs" aria-label="Studio sections">
            {TABS.filter(([, , , adminOnly]) => !adminOnly || user?.role === 'ADMIN').map(([href, label, key]) => {
              const on = active ? active === key : pathname === href;
              const badge = kpis?.[key];
              return (
                <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={on ? 'active' : undefined}>
                  {label}
                  {badge > 0 && <span className="st-badge">{badge}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
        <ToastCtx.Provider value={notify}>
          <DialogCtx.Provider value={{ confirm, prompt }}>
            <div style={{ paddingBottom: 90 }}>{children}</div>
          </DialogCtx.Provider>
        </ToastCtx.Provider>
      </main>
      <footer className="footer section-gutter" style={{ borderTop: '1px solid #242424' }}>
        <div className="footer-bottom" style={{ borderTop: 0, marginTop: 0 }}>
          <p>© 2026 Boss Media Limited</p>
          <p>Photographed in Aotearoa New Zealand</p>
        </div>
      </footer>
      <div className="st-toast-wrap" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={t.err ? 'st-toast err' : 'st-toast'}>{t.msg}</div>)}
      </div>
      {dialog && (
        <div className="st-modal" role="dialog" aria-modal="true" aria-label={dialog.title}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeDialog(dialog.kind === 'confirm' ? false : null); }}>
          <div className="st-modal-card" role="document">
            <p className="eyebrow">{dialog.eyebrow || (dialog.kind === 'confirm' ? 'Confirm' : 'Input')}</p>
            <h3>{dialog.title}</h3>
            {dialog.message && <p>{dialog.message}</p>}
            {dialog.kind === 'prompt' && (
              <input autoFocus value={dialog.input} placeholder={dialog.placeholder || ''}
                onChange={(e) => setDialog((d) => ({ ...d, input: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') closeDialog(dialog.input); }}
                inputMode={dialog.numeric ? 'decimal' : undefined} />
            )}
            <div className="st-modal-actions">
              <button className="st-btn-ghost" onClick={() => closeDialog(dialog.kind === 'confirm' ? false : null)}>
                {dialog.cancelLabel || 'Cancel'}
              </button>
              <button className={dialog.danger ? 'st-btn st-btn-danger-fill' : 'st-btn'}
                onClick={() => closeDialog(dialog.kind === 'confirm' ? true : dialog.input)}>
                {dialog.confirmLabel || (dialog.kind === 'confirm' ? 'Confirm' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CartCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let items = [];
    try { items = JSON.parse(localStorage.getItem('bossmedia:cart') || '[]'); } catch {}
    setN(items.length);
  }, []);
  return <span>{n}</span>;
}

export function Stat({ label, value, sub }) {
  return (
    <div className="st-card">
      <p className="st-klabel">{label}</p>
      <strong className="st-kval">{value}</strong>
      {sub && <small className="st-ksub">{sub}</small>}
    </div>
  );
}

export function Bars({ rows, format }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      {rows.map((r, i) => (
        <div className="st-bar-row" key={i}>
          <span>{r.label}</span>
          <div className="st-bar-track"><div className="st-bar-fill" style={{ width: `${Math.round((r.value / max) * 100)}%` }} /></div>
          <span>{format ? format(r) : r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Chip({ status }) {
  const s = String(status || '').toLowerCase();
  const cls = ['paid', 'published', 'ready', 'delivered'].includes(s) ? 'green'
    : ['pending', 'awaiting_payment', 'in_production', 'draft'].includes(s) ? 'amber'
    : ['cancelled', 'refunded', 'archived', 'failed'].includes(s) ? 'red' : '';
  return <span className={`st-chip ${cls}`}>{status}</span>;
}

export function Pager({ total, limit, offset, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const cur = Math.floor(offset / limit);
  if (pages <= 1) return null;
  const nums = [];
  for (let n = 0; n < pages; n++) {
    if (n === 0 || n === pages - 1 || Math.abs(n - cur) <= 2) nums.push(n);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <div className="st-pager">
      <span>Page {cur + 1} of {pages} · {total} rows</span>
      <button disabled={cur <= 0} onClick={() => onPage(Math.max(0, offset - limit))} aria-label="Previous page">‹</button>
      {nums.map((n, i) => n === '…'
        ? <span key={`e${i}`} aria-hidden="true">…</span>
        : <button key={n} className={n === cur ? 'on' : ''} aria-current={n === cur ? 'page' : undefined} onClick={() => onPage(n * limit)}>{n + 1}</button>)}
      <button disabled={cur >= pages - 1} onClick={() => onPage(offset + limit)} aria-label="Next page">›</button>
    </div>
  );
}
