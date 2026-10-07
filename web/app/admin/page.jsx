import Link from 'next/link';
import { cookies } from 'next/headers';
import { API } from '../../lib/api';
import { CARD, EMPTY, H1, SUB, LINK } from '../../lib/tokens';
import AdminCharts from '../../components/AdminCharts';

export const dynamic = 'force-dynamic';

// KPI cards link to the admin manage pages (not the public site).
const KPIS = [
  ['Horses', 'horses', '/admin/horses', 'text-gold'],
  ['Riders', 'riders', '/admin/riders', 'text-sky'],
  ['Events', 'events', '/admin/events', 'text-moss'],
  ['Rounds', 'rounds', '/admin/classes', 'text-body'],
];

const GROUPS = [
  ['Manage', [
    ['⇪', 'Import CSV results', 'Organiser upload with preview', '/admin/import', false],
    ['＋', 'Add single result', 'Manual entry, live points preview', '/admin/results/add', false],
    ['♞', 'Horses', 'Profiles, pedigrees & visibility', '/admin/horses', false],
    ['◉', 'Riders', 'Regions, categories & visibility', '/admin/riders', false],
    ['▦', 'Events', 'Details & on/off switch', '/admin/events', false],
    ['◫', 'Classes', 'Per-class tracking switches', '/admin/classes', false],
  ]],
  ['Curate', [
    ['★', 'Series', 'Qual rules & official labelling', '/admin/series', false],
    ['⛉', 'Categories', 'Rider category titles & matching', '/admin/categories', false],
    ['✦', 'Scoring', 'Rules versions, preview & activate', '/admin/scoring', false],
    ['◎', 'Rating', 'Model B weights per version', '/admin/rating', false],
    ['◐', 'Naming review', 'Ambiguous names awaiting decision', '/admin/review', 'pendingReview'],
    ['✔', 'Rider claims', 'Ownership claims awaiting approval', '/admin/claims', 'pendingClaims'],
    ['✉', 'Corrections inbox', 'Public reports awaiting triage', '/admin/corrections', false],
  ]],
  ['System', [
    ['●', 'Users', 'Roles and session control', '/admin/users', 'users'],
    ['▣', 'Data tools', 'Backup export & danger-zone wipe', '/admin/data', false],
    ['☰', 'Audit log', 'Every change, who and when', '/admin/activity', false],
    ['⚙', 'Settings', 'Password, sessions & workspace', '/admin/settings', false],
  ]],
];

export default async function AdminOverview() {
  const token = cookies().get('eq_session')?.value;
  let d = null;
  let daily = null;
  try {
    const res = await fetch(`${API}/admin/overview`, {
      headers: { cookie: `eq_session=${token}` }, cache: 'no-store',
    });
    if (res.ok) d = (await res.json()).data;
  } catch { /* gate in layout handles denial */ }
  try {
    const sres = await fetch(`${API}/admin/stats/daily?days=90`, {
      headers: { cookie: `eq_session=${token}` }, cache: 'no-store',
    });
    if (sres.ok) daily = await sres.json();
  } catch { /* charts optional */ }
  if (!d) {
    return <section className={CARD}><p className={EMPTY}>Overview unavailable.</p></section>;
  }
  const c = d.counts;
  const queueTotal = (c.pendingReview || 0) + (c.pendingClaims || 0);
  const imp = d.lastImport;
  const impFailed = imp && Number(imp.rows_failed) > 0;
  const queueBadge = (key) => {
    const n = c[key];
    if (!n) return <span className="text-[11px] text-faint">0</span>;
    return <span className="bg-redbg text-blood text-[10px] font-bold rounded-full min-w-[20px] h-5 inline-flex items-center justify-center px-1.5">{n}</span>;
  };
  return (
    <>
      <h1 className={H1}>Admin overview</h1>
      <p className={SUB}>System health, queues and recent activity at a glance.</p>

      {queueTotal > 0 && (
        <section className="rounded border border-gold/50 bg-goldbg/20 px-5 py-3.5 mb-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-gold text-sm font-bold whitespace-nowrap">● {queueTotal} item{queueTotal === 1 ? '' : 's'} need{queueTotal === 1 ? 's' : ''} a decision</span>
          {!!c.pendingReview && <Link href="/admin/review" className={LINK} style={{ fontSize: 13 }}>Naming review ({c.pendingReview}) →</Link>}
          {!!c.pendingClaims && <Link href="/admin/claims" className={LINK} style={{ fontSize: 13 }}>Rider claims ({c.pendingClaims}) →</Link>}
        </section>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {KPIS.map(([l, k, href, cls]) => (
          <Link key={l} href={href} className="bg-card border border-line rounded p-4 no-underline hover:border-faint transition-colors block">
            <div className="text-[11px] text-muted tracking-[0.4px] uppercase">{l}</div>
            <div className={`text-[28px] font-extrabold mt-1 tabular-nums ${cls || ''}`}>{(c[k] ?? 0).toLocaleString()}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr] items-start mb-5">
        <div className="min-w-0">
          {daily ? <AdminCharts rows={daily.data} summary={daily.summary} /> : null}
        </div>
        <section className={CARD} style={{ marginBottom: 0 }}>
          <h2 className="text-[15px] font-bold mb-3">Needs attention</h2>
          <div className="flex flex-col">
            {[
              ['Naming review', c.pendingReview, '/admin/review', 'Ambiguous names'],
              ['Rider claims', c.pendingClaims, '/admin/claims', 'Ownership approvals'],
            ].map(([t, n, href, sub]) => (
              <Link key={href} href={href} className="flex items-center gap-3 py-2.5 border-b border-rowline no-underline group">
                <span className={`w-2 h-2 rounded-full shrink-0 ${n ? 'bg-blood' : 'bg-moss'}`} />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-bold text-white group-hover:text-gold">{t}</span>
                  <span className="block text-[12px] text-muted">{sub}</span>
                </span>
                <span className="ml-auto">{queueBadge(t === 'Naming review' ? 'pendingReview' : 'pendingClaims')}</span>
              </Link>
            ))}
            <div className="flex items-center gap-3 py-2.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${!imp ? 'bg-barbg' : impFailed ? 'bg-blood' : 'bg-moss'}`} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-bold text-white">Last import</span>
                <span className={`block text-[12px] ${impFailed ? 'text-blood font-semibold' : 'text-muted'}`}>
                  {!imp ? 'No imports yet'
                    : `${(imp.created_at || '').slice(0, 16).replace('T', ' ')} · ${imp.rows_ok} ok${impFailed ? ` · ${imp.rows_failed} failed` : ''}`}
                </span>
              </span>
              <Link href="/admin/import" className={`${LINK} ml-auto shrink-0`} style={{ fontSize: 12 }}>Open →</Link>
            </div>
          </div>
        </section>
      </div>

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Console</h2>
        <div className="grid md:grid-cols-3 gap-x-8">
          {GROUPS.map(([g, items]) => (
            <div key={g}>
              <div className="pt-2 pb-1 text-[10px] uppercase tracking-[0.8px] text-faint font-bold">{g}</div>
              {items.map(([icon, t, s, href, countKey]) => (
                <Link key={href} href={href} className="flex items-center gap-3 py-2 border-b border-rowline/60 last:border-0 no-underline group">
                  <span className="w-4 text-center text-[13px] text-faint group-hover:text-gold shrink-0">{icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-bold text-white group-hover:text-gold leading-tight">{t}</span>
                    <span className="block text-[12px] text-muted leading-snug">{s}</span>
                  </span>
                  {countKey && <span className="ml-auto shrink-0">{countKey === 'users' ? <span className="text-[11px] text-faint tabular-nums">{c.users}</span> : queueBadge(countKey)}</span>}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-2">Recent activity</h2>
        {d.recent.length ? d.recent.map((r, i) => (
          <div key={i} className="flex gap-2.5 text-[13px] py-[7px] border-b border-rowline last:border-0">
            <span className="text-faint shrink-0">{(r.created_at || '').slice(5, 16).replace('T', ' ')}</span>
            <span><b>{r.action}</b> <span className="text-muted">by {r.actor} · {r.entity_type}</span></span>
          </div>
        )) : <p className={EMPTY}>No activity recorded yet.</p>}
        <Link href="/admin/activity" className={LINK} style={{ fontSize: 12 }}>Full audit log →</Link>
      </section>
    </>
  );
}
