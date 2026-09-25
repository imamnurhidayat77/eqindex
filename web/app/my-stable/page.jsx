'use client';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { useAuth } from '../../components/auth';
import { eqScore } from '../../lib/eq';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, EMPTY, INP, BTN_PRIMARY, BTN_DANGER, LINK, LIVE, badge, BADGE } from '../../lib/tokens';

async function authed(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));

function trendOf(clearPct, history) {
  const last5 = (history || []).slice(0, 5);
  if (!last5.length) return ['Stable', 'text-muted', '→'];
  const c = 100 * last5.filter((r) => r.clear_round).length / last5.length;
  const diff = c - num(clearPct);
  if (diff > 5) return ['Improving', 'text-moss', '↑'];
  if (diff < -5) return ['Declining', 'text-blood', '↓'];
  return ['Stable', 'text-muted', '→'];
}

export default function MyStable() {
  const { user, loading: authLoading } = useAuth();
  const [roster, setRoster] = useState([]);
  const [detail, setDetail] = useState({});
  const [candidates, setCandidates] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr('');
    try {
      const j = await authed('/coach/athletes');
      const rows = j.data || [];
      setRoster(rows);
      const det = {};
      await Promise.all(rows.map(async (r) => {
        try { det[r.id] = await (await fetch(`${API}/riders/${r.id}`)).json(); } catch { /* skip */ }
      }));
      setDetail(det);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { if (user && (user.role === 'COACH' || user.role === 'ADMIN')) load(); else setLoading(false); }, [user]);
  useEffect(() => {
    fetch(`${API}/rankings/riders?limit=100`).then((r) => r.json()).then((j) => setCandidates(j.data || [])).catch(() => {});
  }, []);

  async function add(riderId) {
    if (!riderId) return;
    setBusy(true); setErr('');
    try { await authed('/coach/athletes', { method: 'POST', body: JSON.stringify({ rider_id: riderId }) }); setQ(''); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function remove(riderId) {
    setBusy(true);
    try { await authed(`/coach/athletes/${riderId}`, { method: 'DELETE' }); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const athletes = useMemo(() => roster.map((r) => {
    const d = detail[r.id] || {};
    const st = d.stats || {};
    const clear = num(st.clear_pct), avg = num(st.avg_faults), starts = num(st.starts);
    const hist = d.history || [];
    const [trend, tCls, arrow] = trendOf(clear, hist);
    const best = (d.partnerships || [])[0] || null;
    const last = hist[0] || null;
    return {
      ...r, eq: eqScore(clear, avg, starts), clear, avg, starts,
      wins: num(st.wins), trend, tCls, arrow, best, last,
      horses: num(st.horses_ridden ?? new Set(hist.map((x) => x.horse_id)).size),
    };
  }).sort((a, b) => b.eq - a.eq), [roster, detail]);

  const sugg = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const have = new Set(roster.map((r) => r.id));
    return candidates.filter((c) => !have.has(c.rider_id) && (c.rider || '').toLowerCase().includes(s)).slice(0, 6);
  }, [q, candidates, roster]);

  if (authLoading) return <section className={CARD}><p className={EMPTY}>Loading stable…</p></section>;
  if (!user) {
    return (<>
      <h1 className={H1}>My Stable</h1>
      <p className={SUB}>Coach workspace for monitoring athlete performance.</p>
      <section className={CARD}><p className={EMPTY}>Log in as a coach to manage your roster. <a className={LINK} href="/login?next=/my-stable">Log in →</a></p></section>
    </>);
  }
  if (user.role !== 'COACH' && user.role !== 'ADMIN') {
    return (<>
      <h1 className={H1}>My Stable</h1>
      <p className={SUB}>Coach workspace for monitoring athlete performance.</p>
      <section className={CARD}><p className={EMPTY}>My Stable is a coach workspace — your account is registered as {user.role}. <a className={LINK} href="/watchlist">Track athletes via Watchlist →</a></p></section>
    </>);
  }

  const avgEq = athletes.length ? Math.round(athletes.reduce((s, a) => s + a.eq, 0) / athletes.length) : 0;
  const totalWins = athletes.reduce((s, a) => s + a.wins, 0);
  const attention = athletes.filter((a) => a.trend === 'Declining');

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div>
          <h1 className={H1}>My Stable</h1>
          <p className={SUB}>{user.name} · monitoring {athletes.length} athlete{athletes.length === 1 ? '' : 's'}.</p>
        </div>
        <span className={LIVE}>● COACH WORKSPACE</span>
      </div>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}

      {/* aggregates */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          ['Athletes', String(athletes.length)],
          ['Avg EQ', String(avgEq)],
          ['Combined Wins', String(totalWins)],
          ['Needs Attention', String(attention.length)],
        ].map(([l, v]) => (
          <div key={l} className="bg-card border border-line rounded p-4">
            <div className="text-[11px] text-muted tracking-[0.4px] uppercase">{l}</div>
            <div className={`text-[26px] font-extrabold mt-1 ${l === 'Needs Attention' && attention.length ? 'text-blood' : ''}`}>{v}</div>
          </div>
        ))}
      </div>

      {/* add athlete */}
      <div className="mb-4 rounded border border-line bg-card p-4">
        <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-2">Add athlete to roster</div>
        <div className="relative flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type rider name… (min 2 chars)"
            className={`${INP} flex-1 min-w-[200px]`} />
          {!!sugg.length && (
            <div className="absolute top-full left-0 mt-1 w-full max-w-[420px] z-10 rounded border border-line bg-card2 shadow-xl overflow-hidden">
              {sugg.map((c) => (
                <button key={c.rider_id} disabled={busy} onClick={() => add(c.rider_id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-white/5 disabled:opacity-50">
                  <span className="font-semibold">{c.rider}</span>
                  <span className="text-[12px] text-muted">{c.starts} rounds</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* roster table */}
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Athlete</th><th className={`${TH} ${NUM}`}>EQ</th>
            <th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg</th>
            <th className={`${TH} ${NUM}`}>Rounds</th><th className={`${TH} ${NUM}`}>Wins</th>
            <th className={TH}>Trend</th><th className={TH}>Best Horse</th><th className={TH}>Last Round</th><th className={TH}></th>
          </tr></thead>
          <tbody>
            {athletes.map((a) => (
              <tr key={a.id}>
                <td className={TD}><a href={`/riders/${a.id}`} className="text-white font-semibold no-underline hover:text-gold">{a.name || a.rider}</a></td>
                <td className={`${TD} ${NUM}`}><b className="text-gold">{a.eq}</b></td>
                <td className={`${TD} ${NUM} text-muted`}>{a.clear.toFixed(0)}%</td>
                <td className={`${TD} ${NUM} text-muted`}>{a.avg.toFixed(2)}</td>
                <td className={`${TD} ${NUM} text-muted`}>{a.starts}</td>
                <td className={`${TD} ${NUM} text-muted`}>{a.wins}</td>
                <td className={`${TD} font-semibold text-[13px] ${a.tCls}`}>{a.arrow} {a.trend}</td>
                <td className={TD}>{a.best ? <span className="text-muted text-[13px]">{a.best.horse} ({Number(a.best.clear_pct).toFixed(0)}%)</span> : <span className="text-faint">—</span>}</td>
                <td className={TD}>
                  {a.last ? <span className="text-muted text-[13px]">{a.last.event_name} · {a.last.finish_place ? `#${a.last.finish_place}` : `${Number(a.last.total_faults).toFixed(0)} flt`}</span> : <span className="text-faint">—</span>}
                </td>
                <td className={TD}><button className={BTN_DANGER} disabled={busy} onClick={() => remove(a.id)}>Remove</button></td>
              </tr>
            ))}
            {!athletes.length && !loading && <tr><td colSpan={10} className={EMPTY}>Roster empty — add your first athlete above.</td></tr>}
            {loading && <tr><td colSpan={10} className={EMPTY}>Loading roster…</td></tr>}
          </tbody>
        </table>
        </div>
      </section>

      {/* attention */}
      {!!attention.length && (
        <>
          <h2 className="text-[17px] font-bold mb-0.5">Needs Attention</h2>
          <p className={SUB}>Athletes whose last-5 clear rate trails their career average by 5+ points.</p>
          <div className="grid gap-3 md:grid-cols-3 mb-6">
            {attention.map((a) => (
              <div key={a.id} className="rounded border border-blood/40 bg-card p-4">
                <div className="flex justify-between items-center">
                  <b>{a.name || a.rider}</b>
                  <span className={badge(BADGE.red)}>↓ Declining</span>
                </div>
                <p className="text-muted text-[13px] mt-1.5">Recent form {a.arrow} — review last rounds with <a className={LINK} href={`/riders/${a.id}`}>full history →</a></p>
                <div className="mt-2">
                  <a className={`${BTN_PRIMARY} no-underline inline-block`} href={`/riders/${a.id}`}>Open athlete profile →</a>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
