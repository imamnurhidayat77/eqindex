'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import StudioShell, { Bars, Stat } from '../../components/studio';
import styles from '../../components/StudioOverview.module.css';
import { studio } from '../../lib/studio';
import { fmtDay, isoDayNZ, nzdc, payoutBreakdown, tierLabel } from '../../lib/studio-format.mjs';
import { useDocumentTitle } from '../../lib/use-document-title';

const QUEUE = ['pending', 'in_production', 'ready'];
const CHART_DAYS = 14;
const MONTH_DAYS = 30;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Last N studio-time days, oldest first, with zero-filled gaps.
function lastDays(byDay, n) {
  const map = Object.fromEntries((byDay || []).map((d) => [d.day, Number(d.gross_cents) || 0]));
  return Array.from({ length: n }, (_, i) => {
    const day = isoDayNZ(Date.now() - (n - 1 - i) * 86400000);
    return { day, value: map[day] || 0 };
  });
}

export default function StudioOverview() {
  useDocumentTitle('My studio');
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState(null);
  const [queue, setQueue] = useState([]);
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    studio.get('/admin/media/stats').then(setStats).catch(() => {});
    studio.get('/admin/sales/summary').then(setSummary).catch(() => {});
    studio.get('/admin/reel-orders').then((r) => setQueue((r || []).filter((o) => QUEUE.includes(o.status)))).catch(() => {});
    studio.get('/admin/sales?status=paid&limit=5').then((r) => setRecent(r || [])).catch(() => setRecent([]));
  }, []);

  const k = summary?.kpis;
  const days = useMemo(() => lastDays(summary?.by_day, CHART_DAYS), [summary]);
  const chartTotal = days.reduce((s, d) => s + d.value, 0);
  const monthTotal = useMemo(() => lastDays(summary?.by_day, MONTH_DAYS).reduce((s, d) => s + d.value, 0), [summary]);
  const payout = (summary?.settlement || []).reduce((s, x) => s + payoutBreakdown(x).payout, 0);
  const lastPaid = recent?.[0];

  const attn = [];
  if (queue.length) attn.push({ label: `${plural(queue.length, 'pre-book order', 'pre-book orders')} to work on`, hint: 'Buyers paid and are waiting', href: '/studio/reels' });
  if (stats?.drafts > 0) attn.push({ label: `${plural(stats.drafts, 'draft', 'drafts')} not in the shop`, hint: 'Tag and publish to start earning', href: '/studio/library?status=draft' });
  if (stats?.untagged > 0) attn.push({ label: `${plural(stats.untagged, 'photo', 'photos')} missing rider or horse`, hint: 'Buyers find photos by searching names', href: '/studio/library?untagged=1' });
  if (k?.open_checkouts > 0) attn.push({ label: `${plural(k.open_checkouts, 'checkout', 'checkouts')} in progress`, hint: `${nzdc(k.open_checkout_cents)} if they complete in the next 24 hours`, href: '/studio/sales?status=pending' });

  return (
    <StudioShell active="overview" kpis={{ reels: queue.length, ...(stats ? { library: stats.drafts } : {}) }}>
      <div className="st-kpis">
        <Stat label="Gross revenue · all time" value={k ? nzdc(k.gross_cents) : '—'} sub={k ? `${plural(k.paid, 'paid sale', 'paid sales')} · avg ${nzdc(k.avg_cents)}` : 'paid sales'} />
        <Stat label="Your payout · all time" value={summary ? nzdc(payout) : '—'} sub="after platform and card fees" />
        <Stat label="Last 30 days" value={summary ? nzdc(monthTotal) : '—'} sub={lastPaid ? `last paid sale ${fmtDay(lastPaid.created_at)}` : 'no paid sales yet'} />
        <Stat label="In the shop" value={stats ? stats.published : '—'} sub={stats ? `of ${plural(Number(stats.assets), 'asset', 'assets')} in your library` : 'published assets'} />
      </div>
      <div className={`st-grid-2 ${styles.top}`}>
        <div className="st-card">
          <h3>Needs attention</h3>
          <p className="st-csub">The shortest path to more revenue</p>
          {attn.length ? (
            <ul className="st-attn">
              {attn.map((a) => (
                <li key={a.href + a.label}>
                  <Link href={a.href}><span className="dot" aria-hidden="true" /><span><strong>{a.label}</strong><small>{a.hint}</small></span></Link>
                </li>
              ))}
            </ul>
          ) : <p className="empty-note">Nothing urgent. The shop is tidy.</p>}
        </div>
        <div className="st-card">
          <h3>Revenue · last {CHART_DAYS} days</h3>
          <p className="st-csub">Paid sales, New Zealand time</p>
          {!summary ? <p className="empty-note">Loading…</p> : chartTotal ? (
            <div className={styles.cols} role="img" aria-label={`Paid revenue per day, last ${CHART_DAYS} days, total ${nzdc(chartTotal)}`}>
              {days.map((d) => {
                const max = Math.max(...days.map((x) => x.value));
                return (
                  <div key={d.day} className={styles.col} title={`${fmtDay(d.day)} · ${nzdc(d.value)}`}>
                    <span className={styles.bar} style={{ height: `${Math.max(d.value ? 4 : 1, (d.value / max) * 100)}%` }} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty-note">
              No paid sales in the last {CHART_DAYS} days.
              {lastPaid ? ` The last one was ${fmtDay(lastPaid.created_at)} (${nzdc(lastPaid.amount_cents)}).` : ''}
            </p>
          )}
          {!!chartTotal && <p className={styles.chartFoot}><span>{fmtDay(days[0].day)}</span><b>{nzdc(chartTotal)}</b><span>Today</span></p>}
        </div>
      </div>
      <div className={`st-grid-2 ${styles.top}`}>
        <div className="st-card">
          <h3>Latest sales</h3>
          <p className="st-csub">Paid, newest first</p>
          {recent === null ? <p className="empty-note">Loading…</p> : recent.length ? (
            <ul className="st-attn">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link href="/studio/sales?status=paid">
                    <span><strong>{nzdc(s.amount_cents)}</strong>
                    <small>{[s.horse, s.rider].filter(Boolean).join(' · ') || s.package_title || s.event_name || 'Direct sale'} · {fmtDay(s.created_at)}</small></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="empty-note">No paid sales yet.</p>}
        </div>
        <div className="st-card">
          <h3>Revenue by licence</h3>
          <p className="st-csub">Where the money comes from, all time</p>
          {(summary?.by_tier || []).length ? (
            <Bars rows={summary.by_tier.map((t) => ({ label: tierLabel(t.tier), value: Number(t.gross_cents), sales: Number(t.sales) || 0 }))} format={(r) => `${nzdc(r.value)} · ${plural(r.sales, 'sale', 'sales')}`} />
          ) : <p className="empty-note">No paid sales yet.</p>}
        </div>
      </div>
    </StudioShell>
  );
}
