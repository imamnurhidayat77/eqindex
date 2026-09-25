import { cookies } from 'next/headers';
import { API } from '../../lib/api';
import { CARD, EMPTY, H1, SUB, LINK, badge, BADGE } from '../../lib/tokens';

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const token = cookies().get('eq_session')?.value;
  let d = null;
  try {
    const res = await fetch(`${API}/admin/overview`, {
      headers: { cookie: `eq_session=${token}` }, cache: 'no-store',
    });
    if (res.ok) d = (await res.json()).data;
  } catch { /* gate in layout handles denial */ }
  if (!d) {
    return <section className={CARD}><p className={EMPTY}>Overview unavailable.</p></section>;
  }
  const c = d.counts;
  const stats = [
    ['Horses', c.horses, '/horses', 'text-gold'],
    ['Riders', c.riders, '/riders', 'text-sky'],
    ['Events', c.events, '/events', 'text-moss'],
    ['Rounds', c.rounds, '/analytics', 'text-muted'],
    ['Users', c.users, null, 'text-muted'],
    ['Review pending', c.pendingReview, '/admin/review', c.pendingReview ? 'text-blood' : 'text-moss'],
    ['Claims pending', c.pendingClaims, '/admin/claims', c.pendingClaims ? 'text-blood' : 'text-moss'],
  ];
  const actions = [
    ['Import CSV results', 'Weekly organiser upload with preview', '/admin/import', 'gold'],
    ['Add single result', 'Manual entry with live points preview', '/admin/results/add', null],
    ['Naming review', `${c.pendingReview} ambiguous names awaiting decision`, '/admin/review', null],
    ['Rider claims', `${c.pendingClaims} ownership claims awaiting approval`, '/admin/claims', null],
    ['Audit log', 'Every material change, who and when', '/admin/activity', null],
    ['Settings', 'Password, sessions and workspace', '/admin/settings', null],
  ];
  return (
    <>
      <h1 className={H1}>Admin overview</h1>
      <p className={SUB}>System health, queues and recent activity at a glance.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {stats.map(([l, v, href, cls]) => (
          <div key={l} className="bg-card border border-line rounded p-4">
            <div className="text-[11px] text-muted tracking-[0.4px] uppercase">{l}</div>
            <div className={`text-[28px] font-extrabold mt-1 ${cls || ''}`}>{v}</div>
            {href && <a href={href} className={LINK} style={{ fontSize: 12 }}>Open →</a>}
          </div>
        ))}
      </div>
      {d.lastImport && (
        <section className={CARD}>
          <span className={badge(BADGE.green)}>Last import</span>
          <span className="ml-2 text-sm text-muted">
            {(d.lastImport.created_at || '').slice(0, 16).replace('T', ' ')} · {d.lastImport.rows_ok} ok · {d.lastImport.rows_failed} failed
          </span>
        </section>
      )}
      <div className="grid md:grid-cols-2 gap-5">
        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-2">Quick actions</h2>
          <div className="flex flex-col gap-2">
            {actions.map(([t, s, href, hot]) => (
              <a key={href} href={href}
                className={`rounded border p-3 no-underline transition-colors ${hot ? 'border-gold/60 hover:bg-goldbg/40' : 'border-line hover:border-faint'}`}>
                <div className={`text-[13.5px] font-bold ${hot ? 'text-gold' : 'text-white'}`}>{t} →</div>
                <div className="text-[12px] text-muted mt-0.5">{s}</div>
              </a>
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
          <a href="/admin/activity" className={LINK} style={{ fontSize: 12 }}>Full audit log →</a>
        </section>
      </div>
    </>
  );
}
