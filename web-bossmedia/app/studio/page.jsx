'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import StudioShell, { Bars, Chip, Stat } from '../../components/studio';
import { nzdc, studio } from '../../lib/studio';
import { useDocumentTitle } from '../../lib/use-document-title';

const fmtDay = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
};

const QUEUE = ['pending', 'in_production', 'ready'];

export default function StudioOverview() {
  useDocumentTitle('My studio');
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState(null);
  const [queue, setQueue] = useState([]);
  const [drafts, setDrafts] = useState(0);
  const [untagged, setUntagged] = useState(0);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    studio.get('/admin/media/stats').then(setStats).catch(() => {});
    studio.get('/admin/sales/summary').then(setSummary).catch(() => {});
    studio.get('/admin/reel-orders').then((r) => setQueue((r || []).filter((o) => QUEUE.includes(o.status)))).catch(() => {});
    studio.get('/admin/media?status=draft&limit=200').then((r) => setDrafts((r || []).length)).catch(() => {});
    studio.get('/admin/media?untagged=1&limit=200').then((r) => setUntagged((r || []).length)).catch(() => {});
    studioFetchRecent();
    function studioFetchRecent() {
      studio.get('/admin/sales?limit=5').then((j) => setRecent(j?.data || j || [])).catch(() => {});
    }
  }, []);

  const k = summary?.kpis;
  // Honest 14-day window: fill missing days with zero so gaps show.
  const days = useMemo(() => {
    const map = {};
    for (const d of summary?.by_day || []) map[d.day] = Number(d.gross_cents) || 0;
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ label: iso.slice(5), value: map[iso] || 0 });
    }
    return out;
  }, [summary]);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const attn = [];
  if (queue.length) attn.push({ label: plural(queue.length, 'pre-book order', 'pre-book orders') + ' queued', hint: 'Start work on them', href: '/studio/reels' });
  if (k?.pending > 0) attn.push({ label: plural(k.pending, 'sale', 'sales') + ' pending payment', hint: `${nzdc(k.pending_cents)} held at checkout`, href: '/studio/sales?status=pending' });
  if (drafts > 0) attn.push({ label: plural(drafts, 'draft', 'drafts') + ' unpublished', hint: 'Tag and publish to start earning', href: '/studio/library?status=draft' });
  if (untagged > 0) attn.push({ label: plural(untagged, 'photo', 'photos') + ' untagged', hint: 'Rider and horse tags unlock search sales', href: '/studio/library?untagged=1' });

  return (
    <StudioShell active="overview" kpis={{ library: drafts, reels: queue.length }}>
      <div className="st-kpis">
        <Stat label="Gross revenue" value={k ? nzdc(k.gross_cents) : '—'} sub={k ? `${plural(k.paid, 'paid sale', 'paid sales')} · avg ${nzdc(k.avg_cents)}` : 'paid sales'} />
        <Stat label="Published" value={stats ? stats.published : '—'} sub={stats ? `${plural(Number(stats.assets), 'asset', 'assets')} in library` : 'assets in library'} />
        <Stat label="Views" value={stats ? Number(stats.views).toLocaleString('en-NZ') : '—'} sub={stats ? `${plural(Number(stats.purchases), 'purchase', 'purchases')} tracked` : 'gallery views'} />
        <Stat label="Reel queue" value={queue.length} sub={queue.length ? 'needs your hands' : 'all clear'} />
      </div>
      <div className="st-grid-2">
        <div className="st-card">
          <h3>Revenue — last 14 days</h3>
          <p className="st-csub">Paid sales only, in New Zealand dollars</p>
          {days.length ? (
            <Bars rows={days} format={(r) => (r.value ? nzdc(r.value) : '—')} />
          ) : <p className="empty-note">No paid sales in this window yet.</p>}
        </div>
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
          ) : <p className="empty-note">Nothing urgent — the shop is tidy.</p>}
          <p className="foot">{stats ? `${Number(stats.assets).toLocaleString('en-NZ')} assets on record` : ''}</p>
        </div>
      </div>
      <div className="st-grid-2" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(300px, .6fr)' }}>
        <div className="st-card">
          <h3>Revenue by tier</h3>
          <p className="st-csub">Where the money comes from</p>
          {(summary?.by_tier || []).length ? (
            <Bars rows={summary.by_tier.map((t) => ({ label: t.tier, value: Number(t.gross_cents), sales: Number(t.sales) || 0 }))} format={(r) => `${nzdc(r.value)} · ${plural(r.sales, 'sale', 'sales')}`} />
          ) : <p className="empty-note">No tier sales yet.</p>}
        </div>
        <div className="st-card">
          <h3>Latest sales</h3>
          <p className="st-csub">Fresh money in</p>
          {recent.length ? (
            <ul className="st-attn">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link href="/studio/sales">
                    <span><strong>{nzdc(s.amount_cents)} <Chip status={s.status} /></strong>
                    <small>{[s.horse, s.rider].filter(Boolean).join(' · ') || s.package_title || s.event_name || 'Direct sale'} · {fmtDay(s.created_at)}</small></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="empty-note">No sales yet.</p>}
        </div>
      </div>
    </StudioShell>
  );
}
