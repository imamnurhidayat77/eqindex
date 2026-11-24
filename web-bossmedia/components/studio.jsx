'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { studio, useStudioUser } from '../lib/studio';
import { statusLabel } from '../lib/studio-format.mjs';
import { SiteFooter, SiteHeader } from './figma';
import styles from './Studio.module.css';

const TABS = [
  ['/studio', 'Overview', 'overview'],
  ['/studio/library', 'Library', 'library'],
  ['/studio/upload', 'Upload', 'upload'],
  ['/studio/reels', 'Pre-book orders', 'reels'],
  ['/studio/sales', 'Sales', 'sales'],
  ['/studio/pricing', 'Pricing', 'pricing'],
];
// Platform-operator tools, not studio work: shown to admins after a divider.
// Pre-book reel orders are Boss Media only, other photographers sell photos.
const ADMIN_ONLY_KEYS = ['reels'];
const ADMIN_TABS = [
  ['/studio/moments', 'Moments', 'moments'],
  ['/studio/admin', 'Admin', 'admin'],
];
const QUEUE = ['pending', 'in_production', 'ready'];

// Tab badges come from one place so they read the same on every tab.
function useTabCounts(enabled) {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    if (!enabled) return;
    studio.get('/admin/media/stats').then((s) => setCounts((c) => ({ ...c, library: Number(s?.drafts) || 0 }))).catch(() => {});
    studio.get('/admin/reel-orders').then((r) => setCounts((c) => ({ ...c, reels: (r || []).filter((o) => QUEUE.includes(o.status)).length }))).catch(() => {});
  }, [enabled]);
  return counts;
}

export default function StudioShell({ active, kpis, children }) {
  const { user, state } = useStudioUser();
  const pathname = usePathname();
  const counts = useTabCounts(state === 'ok');
  const badges = { ...counts, ...kpis };
  const isAdmin = user?.role === 'ADMIN';
  const allTabs = [...TABS.filter(([, , key]) => isAdmin || !ADMIN_ONLY_KEYS.includes(key)), ...(isAdmin ? ADMIN_TABS : [])];
  const current = allTabs.find(([href, , key]) => (active ? active === key : pathname === href));
  const isOverview = !current || current[2] === 'overview';
  const isPlatform = ADMIN_TABS.some(([, , key]) => key === current?.[2]);
  const eyebrow = isPlatform ? 'Boss Media · Platform admin' : `Boss Studio · ${isAdmin ? 'Admin' : 'Photographer'}`;
  // Phones scroll the tab strip sideways: bring the current tab into view.
  const tabsRef = useRef(null);
  useEffect(() => {
    tabsRef.current?.querySelector('a.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname, state]);

  if (state === 'loading') {
    return (
      <div className={`studio-page ${styles.page}`}>
        <main className="section-gutter st-hero"><p className="eyebrow">Boss Studio</p><p style={{ color: '#999' }}>Loading…</p></main>
      </div>
    );
  }
  if (state === 'login') {
    return (
      <div className={`studio-page ${styles.page}`}>
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
      <div className={`studio-page ${styles.page}`}>
        <main className="section-gutter st-hero">
          <p className="eyebrow">Boss Studio · Photographer</p>
          <h1>Not your studio.</h1>
          <p>Signed in as {user?.email} — this console needs a photographer account.</p>
        </main>
      </div>
    );
  }

  const tabLink = ([href, label, key]) => {
    const on = current?.[2] === key;
    const badge = badges[key];
    return (
      <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={on ? 'active' : undefined}>
        {label}
        {badge > 0 && <span className="st-badge" aria-label={`${badge} need attention`}>{badge}</span>}
      </Link>
    );
  };

  return (
    <div className={`studio-page ${styles.page}`}>
      <SiteHeader />
      <main className="section-gutter">
        <div className={`st-hero ${isOverview ? '' : styles.compact}`}>
          <div className="st-hero-row">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              {isOverview ? (
                <>
                  <h1>My studio.</h1>
                  <p>Kia ora, {user?.name?.split(' ')[0] || 'photographer'} — shoot, tag, publish, get paid.</p>
                </>
              ) : <h1>{current[1]}</h1>}
            </div>
            {!isPlatform && (
              <div className={styles.actions}>
                <Link href="/events" className={styles.secondaryAction}>View shop</Link>
                {current?.[2] !== 'upload' && <Link href="/studio/upload" className={styles.primaryAction}>Upload photos</Link>}
              </div>
            )}
          </div>
          <div className={styles.tabsWrap}>
          <nav className="st-tabs" aria-label="Studio sections" ref={tabsRef}>
            {TABS.filter(([, , key]) => isAdmin || !ADMIN_ONLY_KEYS.includes(key)).map(tabLink)}
            {isAdmin && (
              <>
                <span className={styles.tabDivider} aria-hidden="true" />
                <span className={styles.tabGroup} aria-hidden="true">Platform</span>
                {ADMIN_TABS.map(tabLink)}
              </>
            )}
          </nav>
          </div>
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
  return <span className={`st-chip ${cls}`}>{statusLabel(status)}</span>;
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
