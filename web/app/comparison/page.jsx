'use client';
import { useEffect, useState } from 'react';
import { API, DEMO_USER } from '../../lib/api';
import { eqScore } from '../../lib/eq';
import { matchupEdge } from '../../lib/forecast';
import { statusBadge } from '../../lib/tokens';
import { ScoreRing } from '../../components/charts';

const MODES = [['horse', 'Horse vs Horse'], ['rider', 'Rider vs Rider'], ['combination', 'Combination']];

const idOf = (t, x) => (t === 'combination' ? `${x.horse_id}:${x.rider_id}` : t === 'horse' ? x.horse_id : x.rider_id);
const nameOf = (t, x) => (t === 'combination' ? `${x.horse} + ${x.rider}` : t === 'horse' ? x.horse : x.rider);
const startsOf = (t, x) => Number(t === 'combination' ? x.rounds_together : x.starts);

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
    const ep = type === 'combination' ? '/partnerships?limit=100'
      : type === 'horse' ? '/rankings/horses?limit=100' : '/rankings/riders?limit=100';
    fetch(`${API}${ep}`).then((r) => r.json()).then((j) => {
      setList(j.data);
      if (j.data.length > 1) {
        setAId(idOf(type, j.data[0]));
        setBId(idOf(type, j.data[1]));
      }
    }).catch(() => setErr('API unreachable'));
  }, [type]);

  const byId = Object.fromEntries(list.map((x) => [idOf(type, x), x]));

  const Picker = ({ side, id, setId }) => {
    const cur = byId[id];
    return (
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted mb-2">
          Entity {side} ({type === 'horse' ? 'Stallion / Mare' : type === 'rider' ? 'Athlete' : 'Pair'})
        </div>
        <select value={id} onChange={(e) => setId(e.target.value)}
          className="w-full bg-ink border border-line text-body rounded px-3 py-2.5 text-sm mb-3">
          {list.map((x) => (
            <option key={idOf(type, x)} value={idOf(type, x)}>
              {nameOf(type, x)} — EQ {eqScore(x.clear_pct, x.avg_faults, startsOf(type, x))}
            </option>
          ))}
        </select>
        {cur && (
          <div className="bg-card2 border border-line rounded px-4 py-3 flex justify-between items-center">
            <b>{nameOf(type, cur)}</b>
            <span className="text-gold text-sm">EQ {eqScore(cur.clear_pct, cur.avg_faults, startsOf(type, cur))}</span>
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

  const R = result ? {
    a: { ...result.a, eq: eqScore(result.a.clear_pct, result.a.avg_faults, startsOf(type, result.a)), label: nameOf(type, result.a) },
    b: { ...result.b, eq: eqScore(result.b.clear_pct, result.b.avg_faults, startsOf(type, result.b)), label: nameOf(type, result.b) },
  } : null;
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
            {R && <button onClick={save} className="rounded border border-line bg-card2 px-4 py-2 text-xs text-muted">Save to Elite</button>}
          </div>
          <Picker side="B" id={bId} setId={setBId} />
        </div>
        {err && <p className="text-muted text-sm mt-3">{err}</p>}
      </section>

      {R && (
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
