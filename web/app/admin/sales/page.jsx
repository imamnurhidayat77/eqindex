'use client';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY, BTN, badge, BADGE, EMPTY } from '../../../lib/tokens';
import Dropdown from '../../../components/Dropdown';

const nzd = (c) => (c === null || c === undefined ? '—' : `NZ$${(Number(c) / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtDT = (d) => {
  try {
    return new Date(d).toLocaleString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(d || '').slice(0, 16).replace('T', ' '); }
};
const todayStr = () => new Date().toLocaleDateString('en-CA');
const shiftStr = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
};

const STATUS_PILL = { paid: BADGE.green, pending: BADGE.goldfill, refunded: BADGE.red };
const PRESETS = [
  ['today', 'Today'],
  ['7d', '7D'],
  ['30d', '30D'],
  ['90d', '90D'],
  ['ytd', 'YTD'],
  ['all', 'All'],
];
const LIMIT = 50;

// Transactions — every photo & package sale with settlement-ready reporting.
// Best-practice layout: filter-aware KPI cards → filter bar → table with
// pagination → revenue report (by tier, daily trend, photographer
// settlement). CSV export always honors the active filters.
export default function AdminSales() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [events, setEvents] = useState([]);
  const [f, setF] = useState({ q: '', status: '', tier: '', kind: '', event_id: '', since: '', until: '', preset: 'all' });
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    for (const k of ['q', 'status', 'tier', 'kind', 'event_id', 'since', 'until']) {
      if (f[k]) p.set(k, f[k]);
    }
    return p;
  }, [f, offset]);

  const summaryParams = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of ['q', 'status', 'tier', 'kind', 'event_id', 'since', 'until']) {
      if (f[k]) p.set(k, f[k]);
    }
    return p;
  }, [f]);

  async function get(path) {
    const res = await fetch(`${API}${path}`, { credentials: 'include' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
    return j;
  }

  useEffect(() => {
    get('/admin/license-tiers').then((j) => setTiers(j.data || [])).catch(() => {});
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr('');
    const t = setTimeout(async () => {
      try {
        const [table, sum] = await Promise.all([
          get(`/admin/sales?${params}`),
          get(`/admin/sales/summary?${summaryParams}`),
        ]);
        if (!live) return;
        setRows(table.data || []);
        setTotal(table.pagination?.total ?? (table.data || []).length);
        setSummary(sum.data || null);
      } catch (e) {
        if (!live) return;
        if (/401|403/.test(e.message)) setErr('Admin login required.');
        else setErr(e.message);
        setRows([]);
      }
      if (live) setLoading(false);
    }, f.q ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString(), summaryParams.toString()]);

  const set = (k) => (v) => {
    setOffset(0);
    const val = typeof v === 'object' && v?.value !== undefined ? v.value : v;
    // Manual date edits drop the preset highlight into a "custom" state.
    setF((p) => ({ ...p, [k]: val, preset: k === 'since' || k === 'until' ? 'custom' : p.preset }));
  };

  const pickPreset = (name) => {
    setOffset(0);
    const t = todayStr();
    if (name === 'all') setF((p) => ({ ...p, since: '', until: '', preset: 'all' }));
    else if (name === 'today') setF((p) => ({ ...p, since: t, until: t, preset: name }));
    else if (name === 'ytd') setF((p) => ({ ...p, since: `${t.slice(0, 4)}-01-01`, until: t, preset: name }));
    else {
      const days = { '7d': 6, '30d': 29, '90d': 89 }[name] ?? 29;
      setF((p) => ({ ...p, since: shiftStr(-days), until: t, preset: name }));
    }
  };

  const reset = () => {
    setOffset(0);
    setF({ q: '', status: '', tier: '', kind: '', event_id: '', since: '', until: '', preset: 'all' });
  };
  const dirty = ['q', 'status', 'tier', 'kind', 'event_id', 'since', 'until'].some((k) => f[k]);

  async function exportCSV() {
    setExporting(true);
    try {
      const res = await fetch(`${API}/admin/sales.csv?${summaryParams}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = m?.[1] || `eqindex-sales-${todayStr()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
    setExporting(false);
  }

  const tierLabel = (id) => (id === 'bundle' ? 'Package bundle' : id === 'reel' ? 'Reel service' : id === 'credit' ? 'Photo credits' : tiers.find((t) => t.id === id)?.label || id || '—');
  const k = summary?.kpis;
  const maxDay = Math.max(1, ...(summary?.by_day || []).map((d) => Number(d.gross_cents) || 0));
  const maxTier = Math.max(1, ...(summary?.by_tier || []).map((t) => Number(t.gross_cents) || 0));
  const from = offset + 1;
  const to = Math.min(offset + LIMIT, total);
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const page = Math.floor(offset / LIMIT) + 1;

  const itemOf = (r) => {
    if (r.kind === 'photo') {
      return { title: [r.horse, r.rider].filter(Boolean).join(' × ') || r.event_name || 'Photo', sub: r.event_name || '' };
    }
    if (r.kind === 'reel') {
      return { title: 'Reel order', sub: r.event_name ? `${r.event_name} · service` : 'Service' };
    }
    if (r.kind === 'credit') {
      return { title: 'Photo credits', sub: r.event_name ? `${r.event_name} · credits` : 'Credits' };
    }
    return { title: r.package_title || 'Package', sub: r.event_name ? `${r.event_name} · bundle` : 'Bundle' };
  };

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={H1}>Transactions</h1>
        {!loading && !err && (
          <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-bold text-muted">
            {total.toLocaleString()} transaction{total === 1 ? '' : 's'}
          </span>
        )}
        <span className="flex-1" />
        <button onClick={exportCSV} disabled={exporting || loading} className={BTN_PRIMARY}>
          {exporting ? 'Exporting…' : '⭳ Export CSV'}
        </button>
      </div>
      <p className={SUB}>Every photo &amp; package sale. KPIs, table and export all follow the active filters.</p>
      {err && <section className={CARD} role="alert"><p className="text-blood text-sm">{err}</p></section>}

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {[
          ['Gross revenue', k ? nzd(k.gross_cents) : '…', `${k?.paid ?? '—'} paid order${k?.paid === 1 ? '' : 's'}`, 'text-gold'],
          ['Average order', k ? nzd(k.avg_cents) : '…', 'paid orders only', 'text-white'],
          ['Pending', k ? nzd(k.pending_cents) : '…', `${k?.pending ?? '—'} awaiting payment`, 'text-muted'],
          ['Refunded', k ? String(k.refunded ?? '—') : '…', 'orders refunded', 'text-blood'],
        ].map(([label, value, sub, cls]) => (
          <div key={label} className="bg-card border border-line rounded p-4">
            <div className="text-[11px] text-muted tracking-[0.4px] uppercase">{label}</div>
            <div className={`text-[24px] font-extrabold mt-1 tabular-nums ${cls}`}>{value}</div>
            <div className="text-[12px] text-faint mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="mb-4 rounded border border-line bg-card p-4">
        <div className="flex gap-1 bg-card2 border border-line rounded p-1 w-fit mb-3" role="tablist" aria-label="Date range">
          {PRESETS.map(([v, lbl]) => (
            <button key={v} role="tab" aria-selected={f.preset === v} onClick={() => pickPreset(v)}
              className={`px-3 py-[6px] rounded-md text-[12.5px] whitespace-nowrap cursor-pointer border-0 ${f.preset === v ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2.5 items-end">
          <label className="text-xs text-muted flex flex-col gap-1.5">Search
            <input className={INP} value={f.q} onChange={(e) => set('q')(e.target.value)} placeholder="Buyer email, horse, rider, event…" style={{ width: 230 }} /></label>
          <label className="text-xs text-muted flex flex-col gap-1.5">Status
            <Dropdown ariaLabel="Status filter" value={f.status} placeholder="All statuses"
              options={[{ value: '', label: 'All statuses' }, ['paid', 'Paid'], ['pending', 'Pending'], ['refunded', 'Refunded']]}
              onSelect={(o) => set('status')(o.value)} buttonClassName="min-w-[140px]" /></label>
          <label className="text-xs text-muted flex flex-col gap-1.5">License
            <Dropdown ariaLabel="License filter" value={f.tier} placeholder="All licenses" searchable
              options={[{ value: '', label: 'All licenses' }, { value: 'bundle', label: 'Package bundle' }, ...tiers.map((t) => ({ value: t.id, label: t.label || t.id }))]}
              onSelect={(o) => set('tier')(o.value)} buttonClassName="min-w-[150px]" menuClassName="min-w-[180px]" /></label>
          <label className="text-xs text-muted flex flex-col gap-1.5">Type
            <Dropdown ariaLabel="Type filter" value={f.kind} placeholder="All types"
              options={[{ value: '', label: 'All types' }, ['photo', 'Photos'], ['package', 'Packages'], ['reel', 'Reels'], ['credit', 'Credits']]}
              onSelect={(o) => set('kind')(o.value)} buttonClassName="min-w-[150px]" /></label>
          <label className="text-xs text-muted flex flex-col gap-1.5">Event
            <Dropdown ariaLabel="Event filter" value={f.event_id} placeholder="All events" searchable
              options={[{ value: '', label: 'All events' }, ...events.map((e) => ({ value: e.id, label: e.name }))]}
              onSelect={(o) => set('event_id')(o.value)} buttonClassName="min-w-[170px]" menuClassName="min-w-[220px]" /></label>
          <label className="text-xs text-muted flex flex-col gap-1.5">Since
            <input className={`${INP} py-[7px]`} type="date" value={f.since} onChange={(e) => set('since')(e.target.value)} /></label>
          <label className="text-xs text-muted flex flex-col gap-1.5">Until
            <input className={`${INP} py-[7px]`} type="date" value={f.until} onChange={(e) => set('until')(e.target.value)} /></label>
          {dirty && (
            <button onClick={reset} className="text-sky text-[13px] bg-none border-0 cursor-pointer hover:text-white pb-2">Reset ✕</button>
          )}
        </div>
      </div>

      {/* Table */}
      <section className={CARD}>
        <div className={TABLEWRAP}>
          <table className={TABLE}>
            <thead><tr>
              <th className={TH}><span className="sr-only">Expand</span></th>
              <th className={TH}>Date</th><th className={TH}>Buyer</th><th className={TH}>Item</th>
              <th className={TH}>Type</th><th className={TH}>License</th>
              <th className={`${TH} ${NUM}`}>Amount</th><th className={TH}>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const item = itemOf(r);
                const open = expanded === r.id;
                return ([
                  <tr key={r.id} onClick={() => setExpanded(open ? null : r.id)}
                    className="border-b border-rowline last:border-0 cursor-pointer hover:bg-white/[0.02]">
                    <td className={`${TD} text-faint text-[11px] w-6`}>{open ? '▾' : '▸'}</td>
                    <td className={`${TD} text-muted whitespace-nowrap`}>{fmtDT(r.created_at)}</td>
                    <td className={`${TD} max-w-[190px] truncate`} title={r.buyer_email}>{r.buyer_email}</td>
                    <td className={TD}>
                      <span className="block text-[13.5px] font-bold text-white truncate max-w-[260px]">{item.title}</span>
                      {!!item.sub && <span className="block text-[11.5px] text-faint truncate max-w-[260px]">{item.sub}</span>}
                    </td>
                    <td className={`${TD} text-muted capitalize`}>{r.kind}</td>
                    <td className={TD}>{r.kind === 'package' ? <span className="text-muted">Bundle</span> : r.kind === 'reel' ? <span className="text-muted">Reel service</span> : r.kind === 'credit' ? <span className="text-muted">Credits</span> : tierLabel(r.license_tier)}</td>
                    <td className={`${TD} ${NUM} font-bold tabular-nums`}>{nzd(r.amount_cents)}</td>
                    <td className={TD}><span className={badge(STATUS_PILL[r.status] || BADGE.gray)}>{r.status}</span></td>
                  </tr>,
                  open && (
                    <tr key={`${r.id}-detail`} className="border-b border-rowline bg-card2/40">
                      <td className={TD} />
                      <td colSpan={7} className={TD}>
                        <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3 py-1 text-[12.5px]">
                          {[
                            ['Purchase ID', <code key="v" className="font-mono text-[11.5px]">{r.id}</code>],
                            ['Buyer user', r.buyer_user_id ? <code key="v" className="font-mono text-[11.5px]">{String(r.buyer_user_id).slice(0, 8)}…</code> : 'guest checkout'],
                            ['Photographer', r.photographer || '—'],
                            ['Event', r.event_name || '—'],
                            ['Amount', nzd(r.amount_cents)],
                            ['Stripe fee (est.)', nzd(r.stripe_fee_est_cents)],
                            ['Stripe session', r.stripe_session_id ? <code key="v" className="font-mono text-[11.5px]">{r.stripe_session_id}</code> : '—'],
                            ['Currency', r.currency || 'NZD'],
                          ].map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-3">
                              <span className="text-faint">{k}</span>
                              <span className="text-right text-muted">{v}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ),
                ]);
              })}
              {!rows.length && !loading && !err && <tr><td colSpan={8} className={EMPTY}>No transactions match these filters.</td></tr>}
              {loading && <tr><td colSpan={8} className={EMPTY}>Loading…</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-3">
          <span className="text-[12px] text-faint">
            {total ? `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}` : 'No results'}
            {' · '}page {page} of {pages}
          </span>
          <span className="flex-1" />
          <button disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - LIMIT))} className={BTN}>← Prev</button>
          <button disabled={offset + LIMIT >= total || loading} onClick={() => setOffset(offset + LIMIT)} className={BTN}>Next →</button>
        </div>
      </section>

      {/* Report */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <section className={CARD} style={{ marginBottom: 0 }}>
          <h2 className="text-[15px] font-bold mb-1">Revenue by license</h2>
          <p className="text-[12px] text-muted mb-3">Paid orders in the current filter.</p>
          {(summary?.by_tier || []).map((t) => (
            <div key={t.tier} className="py-2 border-b border-rowline last:border-0">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="font-bold text-white">{tierLabel(t.tier)}</span>
                <span className="tabular-nums"><b className="text-gold">{nzd(t.gross_cents)}</b> <span className="text-faint">· {t.sales} order{t.sales === 1 ? '' : 's'}</span></span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-line overflow-hidden">
                <div className="h-full rounded-full bg-gold" style={{ width: `${Math.round((Number(t.gross_cents) / maxTier) * 100)}%` }} />
              </div>
            </div>
          ))}
          {!(summary?.by_tier || []).length && !loading && <p className="text-[13px] text-faint">No paid revenue in this range.</p>}
        </section>

        <section className={CARD} style={{ marginBottom: 0 }}>
          <h2 className="text-[15px] font-bold mb-1">Daily revenue</h2>
          <p className="text-[12px] text-muted mb-3">Paid gross per day{(summary?.by_day || []).length >= 31 ? ' (last 31 days)' : ''}.</p>
          {(summary?.by_day || []).length ? (
            <div className="flex items-end gap-[3px] h-28" role="img" aria-label="Daily revenue chart">
              {(summary.by_day || []).map((d) => (
                <div key={d.day} title={`${d.day} · ${nzd(d.gross_cents)} · ${d.sales} orders`}
                  className="flex-1 rounded-t bg-gold/70 hover:bg-gold min-w-[4px] transition-colors"
                  style={{ height: `${Math.max(4, Math.round((Number(d.gross_cents) / maxDay) * 100))}%` }} />
              ))}
            </div>
          ) : !loading && <p className="text-[13px] text-faint">No paid revenue in this range.</p>}
          {!!(summary?.by_day || []).length && (
            <div className="flex justify-between text-[11px] text-faint mt-1.5 tabular-nums">
              <span>{summary.by_day[0].day.slice(5)}</span>
              <span>{summary.by_day[summary.by_day.length - 1].day.slice(5)}</span>
            </div>
          )}
        </section>
      </div>

      <section className={CARD}>
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h2 className="text-[15px] font-bold">Photographer settlement</h2>
          <span className="flex-1" />
          <button onClick={exportCSV} disabled={exporting || loading} className={BTN}>⭳ Settlement CSV</button>
        </div>
        <p className="text-[12px] text-muted mb-3">Payout = gross − platform fee − Stripe fee (est. 1.75% + 30¢). Family operation: platform fee is 0 — Stripe is the only real cost. Settle monthly; the CSV is the GST record.</p>
        <div className={TABLEWRAP}>
          <table className={TABLE}>
            <thead><tr>
              <th className={TH}>Photographer</th>
              <th className={`${TH} ${NUM}`}>Sales</th><th className={`${TH} ${NUM}`}>Gross</th>
              <th className={`${TH} ${NUM}`}>Platform fee</th><th className={`${TH} ${NUM}`}>Stripe fee (est.)</th><th className={`${TH} ${NUM}`}>Payout</th>
            </tr></thead>
            <tbody>
              {(summary?.settlement || []).map((s) => (
                <tr key={s.photographer_id || s.photographer} className="border-b border-rowline last:border-0">
                  <td className={`${TD} font-bold`}>{s.photographer}</td>
                  <td className={`${TD} ${NUM}`}>{s.sales}</td>
                  <td className={`${TD} ${NUM} tabular-nums`}>{nzd(s.gross_cents)}</td>
                  <td className={`${TD} ${NUM} tabular-nums text-muted`}>{nzd(s.fee_cents)} <span className="text-faint">({Math.round(Number(s.commission_rate) * 100)}%)</span></td>
                  <td className={`${TD} ${NUM} tabular-nums text-muted`}>{nzd(s.stripe_fee_cents)}</td>
                  <td className={`${TD} ${NUM} tabular-nums font-bold text-gold`}>{nzd(s.payout_cents)}</td>
                </tr>
              ))}
              {!(summary?.settlement || []).length && !loading && <tr><td colSpan={6} className={EMPTY}>No paid sales to settle in this range.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
