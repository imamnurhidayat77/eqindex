'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStudioUser } from '../lib/studio';
import { Icon, SiteFooter, SiteHeader } from './figma';

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
      <SiteHeader />
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
        <div style={{ paddingBottom: 90 }}>{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
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
    <nav className="st-pager" aria-label={`Pagination, page ${cur + 1} of ${pages}`}>
      <span role="status">Page {cur + 1} of {pages} · {total} rows</span>
      <button type="button" disabled={cur <= 0} onClick={() => onPage(Math.max(0, offset - limit))} aria-label={`Previous page, page ${cur + 1} of ${pages}`}>‹</button>
      {nums.map((n, i) => n === '…'
        ? <span key={`e${i}`} aria-hidden="true">…</span>
        : <button key={n} type="button" className={n === cur ? 'on' : ''} aria-label={`Page ${n + 1}`} aria-current={n === cur ? 'page' : undefined} onClick={() => onPage(n * limit)}>{n + 1}</button>)}
      <button type="button" disabled={cur >= pages - 1} onClick={() => onPage(offset + limit)} aria-label={`Next page, page ${cur + 1} of ${pages}`}>›</button>
    </nav>
  );
}
