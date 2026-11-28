'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import StudioShell from '../../components/studio';
import s from '../../components/StudioOverview.module.css';
import { studio } from '../../lib/studio';
import { fmtDay, nzdc, payoutBreakdown, tierLabel } from '../../lib/studio-format.mjs';
import { lastDays, periodTotals, saleKind, withShare } from '../../lib/studio-overview.mjs';
import { useDocumentTitle } from '../../lib/use-document-title';

const QUEUE = ['pending', 'in_production', 'ready'];
const PERIODS = [7, 14, 30];
const DEFAULT_PERIOD = 14;
const MONTH_DAYS = 30;
const RECENT_SALES = 5;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// null while loading (skeleton), a dash when the request failed, else the value.
const pick = (data, fn) => (data === null ? null : data ? fn() : '—');

export default function StudioOverview() {
  useDocumentTitle('My studio');
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState(null);
  const [queue, setQueue] = useState(null);
  const [recent, setRecent] = useState(null);
  const [period, setPeriod] = useState(DEFAULT_PERIOD);

  useEffect(() => {
    studio.get('/admin/media/stats').then(setStats).catch(() => setStats(false));
    studio.get('/admin/sales/summary').then(setSummary).catch(() => setSummary(false));
    studio.get('/admin/reel-orders').then((r) => setQueue((r || []).filter((o) => QUEUE.includes(o.status)))).catch(() => setQueue([]));
    studio.get(`/admin/sales?status=paid&limit=${RECENT_SALES}`).then((r) => setRecent(r || [])).catch(() => setRecent([]));
  }, []);

  const k = summary?.kpis;
  const month = useMemo(() => periodTotals(lastDays(summary?.by_day, MONTH_DAYS)), [summary]);
  const payout = (summary?.settlement || []).reduce((sum, x) => sum + payoutBreakdown(x).payout, 0);
  const lastPaid = recent?.[0];
  const published = Number(stats?.published) || 0;
  const assets = Number(stats?.assets) || 0;

  // Ordered by what costs money first: buyers already paid, then lost sales.
  const attn = [];
  if (queue?.length) attn.push({ n: queue.length, tone: 'urgent', label: `${queue.length === 1 ? 'Pre-book order' : 'Pre-book orders'} to work on`, hint: 'Buyers paid and are waiting for their reel', href: '/studio/reels', cta: 'Open queue' });
  if (stats?.drafts > 0) attn.push({ n: stats.drafts, tone: 'todo', label: `${stats.drafts === 1 ? 'Draft' : 'Drafts'} not in the shop`, hint: 'Tag and publish so buyers can find them', href: '/studio/library?status=draft', cta: 'Publish' });
  if (stats?.untagged > 0) attn.push({ n: stats.untagged, tone: 'todo', label: `${stats.untagged === 1 ? 'Photo' : 'Photos'} missing rider or horse`, hint: 'Buyers search by name, so untagged photos go unseen', href: '/studio/library?untagged=1', cta: 'Tag' });
  if (k?.open_checkouts > 0) attn.push({ n: k.open_checkouts, tone: 'info', label: `${k.open_checkouts === 1 ? 'Checkout' : 'Checkouts'} in progress`, hint: `${nzdc(k.open_checkout_cents)} if they finish in the next 24 hours`, href: '/studio/sales?status=pending', cta: 'View' });
  const attnLoading = stats === null || summary === null || queue === null;

  return (
    <StudioShell active="overview" kpis={{ reels: queue?.length || 0, ...(stats ? { library: stats.drafts } : {}) }}>
      <section className={s.kpis} aria-label="Key numbers">
        <Kpi label="Your payout" tag="All time" value={pick(summary, () => nzdc(payout))}
          sub={pick(summary, () => 'After platform and card fees')} />
        <Kpi label="Gross revenue" tag="All time" value={pick(summary, () => (k ? nzdc(k.gross_cents) : '—'))}
          sub={pick(summary, () => (k ? `${plural(Number(k.paid), 'paid sale', 'paid sales')} · avg ${nzdc(k.avg_cents)}` : ''))} />
        <Kpi label="Revenue" tag="Last 30 days" value={pick(summary, () => nzdc(month.value))}
          sub={pick(summary, () => (month.sales ? `${plural(month.sales, 'sale', 'sales')}${lastPaid ? ` · last ${fmtDay(lastPaid.created_at)}` : ''}` : lastPaid ? `No sales. Last one ${fmtDay(lastPaid.created_at)}` : 'No sales yet'))} />
        <Kpi label="In the shop" tag="Library" value={pick(stats, () => String(published))}
          sub={pick(stats, () => `of ${plural(assets, 'asset', 'assets')} published`)}
          meter={stats && assets ? published / assets : null} />
      </section>

      <div className={s.layout}>
        <div className={s.column}>
          <RevenueCard summary={summary} period={period} onPeriod={setPeriod} lastPaid={lastPaid} />
          <RecentSales recent={recent} />
        </div>
        <div className={s.column}>
          <section className={s.card} data-slot="attn" aria-labelledby="ov-attn">
            <header className={s.cardHead}>
              <div>
                <h3 id="ov-attn">Needs attention</h3>
                <p>Most urgent first</p>
              </div>
              {!attnLoading && attn.length > 0 && <span className={s.headCount}>{attn.length}</span>}
            </header>
            {attnLoading ? <Placeholder rows={3} /> : attn.length ? (
              <ul className={s.tasks}>
                {attn.map((a) => (
                  <li key={a.href}>
                    <Link href={a.href} className={s.task} data-tone={a.tone}>
                      <span className={s.taskCount}>{a.n}</span>
                      <span className={s.taskText}><strong>{a.label}</strong><small>{a.hint}</small></span>
                      <span className={s.taskCta}>{a.cta}<span aria-hidden="true"> →</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={s.allClear}>
                <span aria-hidden="true">✓</span>
                <div><strong>All clear</strong><small>Nothing waiting on you. The shop is tidy.</small></div>
              </div>
            )}
          </section>
          <LicenceCard summary={summary} />
        </div>
      </div>
    </StudioShell>
  );
}

function Kpi({ label, tag, value, sub, meter = null }) {
  return (
    <div className={s.kpi}>
      <p className={s.kpiLabel}>{label}<span>{tag}</span></p>
      {value === null ? <span className={s.skel} style={{ width: '60%', height: 34 }} /> : <strong className={s.kpiValue}>{value}</strong>}
      {meter !== null && (
        <span className={s.meter} role="meter" aria-label="Share of library published" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter * 100)}>
          <span style={{ width: `${Math.round(meter * 100)}%` }} />
        </span>
      )}
      {sub === null ? <span className={s.skel} style={{ width: '80%', height: 12 }} /> : <small className={s.kpiSub}>{sub}</small>}
    </div>
  );
}

function RevenueCard({ summary, period, onPeriod, lastPaid }) {
  const days = useMemo(() => lastDays(summary?.by_day, period), [summary, period]);
  const total = periodTotals(days);
  const max = Math.max(1, ...days.map((d) => d.value));
  const mid = days[Math.floor(days.length / 2)];
  return (
    <section className={s.card} data-slot="rev" aria-labelledby="ov-rev">
      <header className={s.cardHead}>
        <div>
          <h3 id="ov-rev">Revenue</h3>
          <p>Paid sales, New Zealand time</p>
        </div>
        <div className={s.segment} role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => onPeriod(p)}>{p}d</button>
          ))}
        </div>
      </header>
      {summary === null ? <Placeholder rows={4} /> : !summary ? <p className={s.empty}>Revenue could not load. Refresh to try again.</p> : (
        <>
          <div className={s.revTotal}>
            <strong>{nzdc(total.value)}</strong>
            <span>{total.sales ? `${plural(total.sales, 'sale', 'sales')} in the last ${period} days${total.best ? ` · best day ${fmtDay(total.best.day)}` : ''}` : `No paid sales in the last ${period} days`}</span>
          </div>
          <div className={s.chart}>
            <span className={s.gridMax} aria-hidden="true">{total.value ? nzdc(max) : ''}</span>
            <ol className={s.cols} aria-label={`Paid revenue per day, last ${period} days`} data-dense={period > 14 ? 'true' : undefined}>
              {days.map((d) => (
                <li key={d.day} className={s.col} data-empty={d.value ? undefined : 'true'}>
                  <span className={s.bar} style={{ height: `${d.value ? Math.max(4, (d.value / max) * 100) : 0}%` }} />
                  <span className={s.tip} role="note">{fmtDay(d.day)}<b>{nzdc(d.value)}</b>{d.sales ? ` · ${plural(d.sales, 'sale', 'sales')}` : ''}</span>
                  <span className={s.srOnly}>{fmtDay(d.day)}: {nzdc(d.value)}</span>
                </li>
              ))}
            </ol>
            {!total.value && (
              <p className={s.chartEmpty}>
                Quiet stretch.{lastPaid ? ` Last paid sale was ${fmtDay(lastPaid.created_at)} (${nzdc(lastPaid.amount_cents)}).` : ' No paid sales yet.'}
              </p>
            )}
          </div>
          <div className={s.axis} aria-hidden="true"><span>{fmtDay(days[0].day)}</span><span>{fmtDay(mid.day)}</span><span>Today</span></div>
        </>
      )}
    </section>
  );
}

function RecentSales({ recent }) {
  return (
    <section className={s.card} data-slot="sales" aria-labelledby="ov-sales">
      <header className={s.cardHead}>
        <div>
          <h3 id="ov-sales">Latest sales</h3>
          <p>Paid, newest first</p>
        </div>
        <Link href="/studio/sales?status=paid" className={s.headLink}>All sales<span aria-hidden="true"> →</span></Link>
      </header>
      {recent === null ? <Placeholder rows={4} /> : recent.length ? (
        <ul className={s.sales}>
          {recent.map((x) => (
            <li key={x.id} className={s.sale}>
              <span className={s.kind}>{saleKind(x.kind)}</span>
              <span className={s.saleText}>
                <strong>{[x.horse, x.rider].filter(Boolean).join(' · ') || x.package_title || 'Direct sale'}</strong>
                <small>{x.event_name || 'No event'}</small>
              </span>
              <span className={s.saleMeta}><b>{nzdc(x.amount_cents)}</b><small>{fmtDay(x.created_at)}</small></span>
            </li>
          ))}
        </ul>
      ) : <p className={s.empty}>No paid sales yet. They show up here the moment a buyer pays.</p>}
    </section>
  );
}

function LicenceCard({ summary }) {
  const rows = withShare((summary?.by_tier || []).map((t) => ({ label: tierLabel(t.tier), value: Number(t.gross_cents) || 0, sales: Number(t.sales) || 0 })));
  return (
    <section className={s.card} data-slot="tier" aria-labelledby="ov-tier">
      <header className={s.cardHead}>
        <div>
          <h3 id="ov-tier">Revenue by licence</h3>
          <p>Where the money comes from, all time</p>
        </div>
      </header>
      {summary === null ? <Placeholder rows={3} /> : rows.length ? (
        <ul className={s.tiers}>
          {rows.map((r) => (
            <li key={r.label}>
              <div className={s.tierRow}><span>{r.label}</span><span><b>{nzdc(r.value)}</b> · {r.share}%</span></div>
              <span className={s.tierTrack}><span style={{ width: `${r.share}%` }} /></span>
              <small>{plural(r.sales, 'sale', 'sales')}</small>
            </li>
          ))}
        </ul>
      ) : <p className={s.empty}>No paid sales yet.</p>}
    </section>
  );
}

function Placeholder({ rows }) {
  return (
    <div className={s.placeholder} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <span key={i} className={s.skel} style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}
