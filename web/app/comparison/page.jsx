'use client';
import { useEffect, useState } from 'react';
import { API, DEMO_USER } from '../../lib/api';
import { eqScore } from '../../lib/eq';
import { matchupEdge } from '../../lib/forecast';
import { statusBadge } from '../../lib/tokens';
import { ScoreRing } from '../../components/charts';
import Dropdown from '../../components/Dropdown';

const MODES = [['horse', 'Horse vs Horse'], ['rider', 'Rider vs Rider'], ['combination', 'Combination'], ['event', 'Event vs Event']];

const idOf = (t, x) => (t === 'event' ? x.id : t === 'combination' ? `${x.horse_id}:${x.rider_id}` : t === 'horse' ? x.horse_id : x.rider_id);
const nameOf = (t, x) => (t === 'event' ? `${x.name} · ${(x.season || '').replace('-', '/')}` : t === 'combination' ? `${x.horse} + ${x.rider}` : t === 'horse' ? x.horse : x.rider);
const startsOf = (t, x) => Number(t === 'event' ? (x.rounds ?? x.round_count) : t === 'combination' ? x.rounds_together : x.starts);
const eqOf = (t, x) => (t === 'event' ? null : eqScore(x.clear_pct, x.avg_faults, startsOf(t, x)));

function tier(eq) {
  if (eq >= 75) return ['ELITE', 'border border-gold text-gold'];
  if (eq >= 60) return ['STRONG', 'border border-sky text-sky'];
  return ['DEVELOPING', 'bg-line text-muted'];
}

export default function Comparison() {
  const [type, setType] = useState('horse');
  const [list, setList] = useState([]);
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setResult(null); setErr('');
    const ep = type === 'event' ? '/events?limit=100'
      : type === 'combination' ? '/partnerships?limit=100'
      : type === 'horse' ? '/rankings/horses?limit=100' : '/rankings/riders?limit=100';
    fetch(`${API}${ep}`).then((r) => r.json()).then((j) => {
      const rows = j.data || [];
      setList(rows);
      if (rows.length > 1) {
        const a = rows[0];
        // YoY default: same event name, different season when available
        const b = type === 'event'
          ? (rows.find((x) => x.name === a.name && x.season !== a.season) || rows[1])
          : rows[1];
        setAId(idOf(type, a));
        setBId(idOf(type, b));
      }
    }).catch(() => setErr('API unreachable'));
  }, [type]);

  const byId = Object.fromEntries(list.map((x) => [idOf(type, x), x]));
  const editionsOf = (id) => {
    const cur = byId[id];
    if (!cur || type !== 'event') return [];
    return list.filter((x) => x.name === cur.name && x.id !== cur.id);
  };

  const Picker = ({ side, id, setId }) => {
    const cur = byId[id];
    const eq = cur && type !== 'event' ? eqOf(type, cur) : null;
    return (
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted mb-2">
          Entity {side} ({type === 'horse' ? 'Stallion / Mare' : type === 'rider' ? 'Athlete' : type === 'event' ? 'Show edition' : 'Pair'})
        </div>
        <div className="mb-3">
          <Dropdown ariaLabel={`Entity ${side}`} value={id} searchable placeholder="Pick an entity…"
            buttonClassName="w-full" menuClassName="w-full"
            options={list.map((x) => ({
              value: idOf(type, x),
              label: type === 'event'
                ? `${nameOf(type, x)} — ${x.round_count ?? '?'} rounds`
                : `${nameOf(type, x)} — EQ ${eqOf(type, x)}`,
            }))}
            onSelect={(o) => setId(o.value)} />
        </div>
        {type === 'event' && !!editionsOf(id).length && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="text-[11px] text-faint py-1">Same event, other season:</span>
            {editionsOf(id).map((e) => (
              <button key={e.id} onClick={() => (side === 'A' ? setBId(e.id) : setAId(e.id))}
                className="text-[11px] border border-line bg-card2 rounded-full px-2.5 py-1 text-sky">
                {(e.season || '').replace('-', '/')}
              </button>
            ))}
          </div>
        )}
        {cur && (
          <div className="bg-card2 border border-line rounded px-4 py-3 flex justify-between items-center">
            <b>{nameOf(type, cur)}</b>
            {eq !== null
              ? <span className="text-gold text-sm">EQ {eq}</span>
              : <span className="text-muted text-sm">{cur.round_count ?? '?'} rounds · {cur.venue || ''}</span>}
          </div>
        )}
      </div>
    );
  };

  async function compare() {
    setErr('');
    if (!byId[aId] || !byId[bId] || aId === bId) { setErr('Pick two different entities'); return; }
    const res = await fetch(`${API}/comparison?type=${type}&a=${aId}&b=${bId}`);
    if (!res.ok) { setErr('Comparison failed'); return; }
    setResult(await res.json());
  }

  async function save() {
    if (!result) return;
    const label = prompt('Label for this comparison:') || '';
    const res = await fetch(`${API}/comparisons`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: DEMO_USER, type, a_id: aId, b_id: bId, label }),
    });
    setErr(res.ok ? 'Saved to Elite.' : 'Save failed');
  }

  const R = result ? (type === 'event' ? {
    a: { ...result.a, label: nameOf(type, result.a) },
    b: { ...result.b, label: nameOf(type, result.b) },
  } : {
    a: { ...result.a, eq: eqScore(result.a.clear_pct, result.a.avg_faults, startsOf(type, result.a)), label: nameOf(type, result.a) },
    b: { ...result.b, eq: eqScore(result.b.clear_pct, result.b.avg_faults, startsOf(type, result.b)), label: nameOf(type, result.b) },
  }) : null;
  const numDiff = (a, b, suffix = '') => {
    const d = Number(b) - Number(a);
    const v = Number.isInteger(d) ? String(d) : d.toFixed(2);
    return `${d > 0 ? '+' : ''}${v}${suffix}`;
  };
  const rows = R ? [
    ['Total Starts', startsOf(type, R.a), startsOf(type, R.b), numDiff(startsOf(type, R.a), startsOf(type, R.b))],
    ['Clear Rounds', Number(R.a.clears), Number(R.b.clears), numDiff(R.a.clears, R.b.clears)],
    ['Clear Round Percentage', `${Number(R.a.clear_pct).toFixed(0)}%`, `${Number(R.b.clear_pct).toFixed(0)}%`, numDiff(R.a.clear_pct, R.b.clear_pct, '%')],
    ['Average Faults', Number(R.a.avg_faults).toFixed(2), Number(R.b.avg_faults).toFixed(2), numDiff(R.a.avg_faults, R.b.avg_faults)],
    ['Wins', R.a.wins ?? '–', R.b.wins ?? '–', (R.a.wins != null && R.b.wins != null) ? numDiff(R.a.wins, R.b.wins) : '–'],
  ] : [];

  return (
    <>
      <section className="bg-card border border-line rounded px-5 py-[18px] mb-6">
        <div className="flex gap-2 bg-card2 rounded p-1 w-fit mb-5">
          {MODES.map(([k, l]) => (
            <button key={k} onClick={() => setType(k)}
              className={`px-4 py-2 rounded-md text-sm font-semibold ${type === k ? 'border border-gold text-gold' : 'text-muted'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
          <Picker side="A" id={aId} setId={setAId} />
          <div className="flex md:flex-col items-center justify-center gap-3 pt-7">
            <span className="w-10 h-10 rounded-full border-[1.5px] border-gold text-gold inline-flex items-center justify-center text-xs font-bold">VS</span>
            <button onClick={compare} className="rounded bg-gold px-6 py-2.5 text-sm font-bold text-black">Compare</button>
            {R && type !== 'event' && <button onClick={save} className="rounded border border-line bg-card2 px-4 py-2 text-xs text-muted">Save to Elite</button>}
          </div>
          <Picker side="B" id={bId} setId={setBId} />
        </div>
        {err && <p className="text-muted text-sm mt-3">{err}</p>}
      </section>

      {R && type === 'event' && (
        <>
          <h2 className="text-[17px] font-bold mb-0.5">Edition Matchup{R.a.event === R.b.event ? ' — Year on Year' : ''}</h2>
          <p className="text-muted text-sm mb-[18px]">{R.a.venue || ''} · {R.a.season?.replace('-', '/')} vs {R.b.season?.replace('-', '/')}</p>
          <section className="bg-card border border-line rounded px-5 py-[18px] mb-6">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
              {[['A', R.a, '#FFD700'], ['VS', null, null], ['B', R.b, '#4C9AFF']].map(([side, x, color]) => {
                if (!x) return <div key={side} className="text-center text-muted text-xs w-10 h-10 rounded-full bg-card2 inline-flex items-center justify-center mx-auto">VS</div>;
                return (
                  <div key={side} className="text-center">
                    <div className="font-bold">{x.label}</div>
                    <div className="text-muted text-xs mt-0.5">{x.classes} classes · {(x.date_start || '').slice(0, 10)} → {(x.date_end || '').slice(0, 10)}</div>
                    <div className="mt-2 text-[34px] font-extrabold" style={{ color }}>{Number(x.clear_pct).toFixed(0)}%</div>
                    <div className="text-[11px] text-faint uppercase tracking-wide">clear rate</div>
                  </div>
                );
              })}
            </div>
          </section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              ['TOTAL ROUNDS', R.a.rounds, R.b.rounds, null, null],
              ['CLEAR ROUND %', `${Number(R.a.clear_pct).toFixed(1)}%`, `${Number(R.b.clear_pct).toFixed(1)}%`, Number(R.a.clear_pct) >= Number(R.b.clear_pct), null],
              ['AVG FAULTS', Number(R.a.avg_faults).toFixed(2), Number(R.b.avg_faults).toFixed(2), null, Number(R.a.avg_faults) <= Number(R.b.avg_faults)],
              ['WINS / BEST', `${R.a.wins} · #${R.a.best_place ?? '–'}`, `${R.b.wins} · #${R.b.best_place ?? '–'}`, null, null],
            ].map(([lbl, av, bv, aGreen, aqGreen]) => (
              <div className="bg-card border border-line rounded p-3.5 px-4" key={lbl}>
                <div className="text-[11px] text-muted tracking-[0.4px] uppercase">{lbl}</div>
                <div className="flex justify-between items-baseline mt-1">
                  <b className={`text-xl ${aGreen ? 'text-moss' : ''}`}>{av}</b>
                  <span className="text-[11px] text-faint">vs</span>
                  <b className={`text-xl ${aqGreen ? 'text-moss' : ''}`}>{bv}</b>
                </div>
              </div>
            ))}
          </div>
          {R.a.event === R.b.event && (
            <section className="bg-card border border-line rounded px-5 py-[18px] mb-6">
              <span className="text-[11px] font-bold uppercase tracking-wide text-faint">📊 Year-on-year verdict — </span>
              <span className="text-[13px] text-muted">
                {`${R.a.event} cleared ${Number(R.a.clear_pct).toFixed(1)}% in ${R.a.season?.replace('-', '/')} vs ${Number(R.b.clear_pct).toFixed(1)}% in ${R.b.season?.replace('-', '/')} `}
                {`(${numDiff(R.a.clear_pct, R.b.clear_pct, '%')} pts), averaging ${Number(R.a.avg_faults).toFixed(2)} vs ${Number(R.b.avg_faults).toFixed(2)} faults.`}
              </span>
            </section>
          )}
        </>
      )}

      {R && type !== 'event' && (
        <>
          <h2 className="text-[17px] font-bold mb-0.5">Performance Overview Matchup</h2>
          <p className="text-muted text-sm mb-[18px]">Direct scoring index contrast and high-level wins tally</p>
          <section className="bg-card border border-line rounded px-5 py-[18px] mb-6">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
              {[['A', R.a, '#FFD700'], ['VS', null, null], ['B', R.b, '#4C9AFF']].map(([side, x, color]) => {
                if (!x) return <div key={side} className="text-center text-muted text-xs w-10 h-10 rounded-full bg-card2 inline-flex items-center justify-center mx-auto">VS</div>;
                const [t, cls] = tier(x.eq);
                return (
                  <div key={side} className="text-center">
                    <div className="font-bold">{x.label} <span className={`inline-block text-[11px] font-bold rounded-md px-2 py-[3px] ${cls}`}>{t}</span></div>
                    <div className="flex justify-center mt-2"><ScoreRing score={x.eq} color={color} /></div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              ['TOTAL ROUNDS', startsOf(type, R.a), startsOf(type, R.b), null, null],
              ['CLEAR ROUND %', `${Number(R.a.clear_pct).toFixed(0)}%`, `${Number(R.b.clear_pct).toFixed(0)}%`, Number(R.a.clear_pct) >= Number(R.b.clear_pct), null],
              ['AVG FAULTS', Number(R.a.avg_faults).toFixed(2), Number(R.b.avg_faults).toFixed(2), null, Number(R.a.avg_faults) <= Number(R.b.avg_faults)],
              ['WINS TRACKED', R.a.wins ?? '–', R.b.wins ?? '–', null, null],
            ].map(([lbl, av, bv, aGreen, aqGreen]) => (
              <div className="bg-card border border-line rounded p-3.5 px-4" key={lbl}>
                <div className="text-[11px] text-muted tracking-[0.4px] uppercase">{lbl}</div>
                <div className="flex justify-between items-baseline mt-1">
                  <b className={`text-xl ${aGreen ? 'text-moss' : ''}`}>{av}</b>
                  <span className="text-[11px] text-faint">vs</span>
                  <b className={`text-xl ${aqGreen ? 'text-moss' : ''}`}>{bv}</b>
                </div>
              </div>
            ))}
          </div>

          {(() => {
            const edge = matchupEdge(R.a.eq, R.b.eq, startsOf(type, R.a), startsOf(type, R.b));
            const favName = edge.favored === 'A' ? R.a.label : edge.favored === 'B' ? R.b.label : null;
            return (
              <section className="bg-card border border-line rounded px-5 py-[18px] mb-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-faint">🔮 Matchup prediction</span>
                  <span className={statusBadge(edge.favored === 'Even' ? 'Stable' : edge.confidence === 'High' ? 'Active' : 'Improving')}>
                    {edge.line}
                  </span>
                  <span className="text-[12px] text-muted">
                    {favName ? `${favName} profiles stronger on EQ over comparable volume.` : 'Profiles grade within noise — no reliable edge.'} {edge.confidence} confidence.
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-faint">Method: EQ gap + minimum sample depth. Gaps under 3 EQ are noise, not signal.</p>
              </section>
            );
          })()}

          <h2 className="text-[17px] font-bold mb-0.5">Performance Metrics Comparison</h2>
          <p className="text-muted text-sm mb-[18px]">Comprehensive metric evaluation and raw data delta analysis</p>
          <section className="bg-card border border-line rounded px-5 py-[18px] mb-6">
            <table className="w-full border-collapse text-sm">
              <thead><tr>
                <th className="text-left text-[11px] uppercase tracking-[0.4px] text-muted font-semibold px-2 py-2.5 border-b border-line">Evaluation Metric</th>
                <th className="text-right text-[11px] uppercase tracking-[0.4px] font-semibold px-2 py-2.5 border-b border-line text-gold">{R.a.label} (A)</th>
                <th className="text-right text-[11px] uppercase tracking-[0.4px] font-semibold px-2 py-2.5 border-b border-line text-sky">{R.b.label} (B)</th>
                <th className="text-right text-[11px] uppercase tracking-[0.4px] text-muted font-semibold px-2 py-2.5 border-b border-line">Difference</th>
              </tr></thead>
              <tbody>
                {rows.map(([l, av, bv, d]) => (
                  <tr key={l}>
                    <td className="px-2 py-[11px] border-b border-rowline"><b>{l}</b></td>
                    <td className="px-2 py-[11px] border-b border-rowline text-right tabular-nums text-moss">{av}</td>
                    <td className="px-2 py-[11px] border-b border-rowline text-right tabular-nums text-moss">{bv}</td>
                    <td className="px-2 py-[11px] border-b border-rowline text-right tabular-nums text-moss">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
