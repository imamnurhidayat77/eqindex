'use client';
import { useEffect, useState } from 'react';
import { API, DEMO_USER } from '../../../lib/api';
import { BTN, BTN_DANGER, CARD, EMPTY, H1, H2, LINK, MUT, SUB, TABLE, TABLEWRAP, TD, TH } from '../../../lib/tokens';

export default function SavedComparisons() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    try {
      const j = await (await fetch(`${API}/comparisons?user_id=${DEMO_USER}`)).json();
      setItems(j.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  async function remove(id) {
    await fetch(`${API}/comparisons/${id}?user_id=${DEMO_USER}`, { method: 'DELETE' });
    load();
  }
  const dispName = (t, x) => (t === 'combination' ? `${x.horse} + ${x.rider}` : t === 'horse' ? x.horse : x.rider);
  const disp = (t, x, k) => {
    if (t === 'combination' && k === 'starts') return x.rounds_together;
    if (t === 'combination' && k === 'wins') return '–';
    return x[k];
  };
  return (
    <>
      <h1 className={H1}>Elite — Saved Comparisons</h1>
      <p className={SUB}>Head-to-head matchups stored to your workspace.</p>
      {loading ? (
        <section className={CARD}><p className={EMPTY}>Loading saved comparisons…</p></section>
      ) : null}
      {items.map((sc) => (
        <section className={CARD} key={sc.id}>
          <h2 className={H2}>{sc.label || 'Comparison'} <span className={MUT}>({sc.type})</span></h2>
          {sc.a && sc.b ? (
            <div className={TABLEWRAP}>
            <table className={TABLE}>
              <thead><tr><th className={TH}>Metric</th><th className={TH}>{dispName(sc.type, sc.a)}</th><th className={TH}>{dispName(sc.type, sc.b)}</th></tr></thead>
              <tbody>
                {[['starts', 'Starts'], ['clear_pct', 'Clear %'], ['avg_faults', 'Avg faults'], ['wins', 'Wins']].map(([k, l]) => (
                  <tr key={k}><td className={TD}>{l}</td><td className={TD}>{disp(sc.type, sc.a, k)}</td><td className={TD}>{disp(sc.type, sc.b, k)}</td></tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : <p className={MUT}>A side was deleted.</p>}
          <div className="mt-3 flex justify-end gap-2">
            <a className={BTN} href={`/comparison?type=${sc.type}&a=${sc.a_id}&b=${sc.b_id}`}>Open in Compare →</a>
            <button className={BTN_DANGER} onClick={() => remove(sc.id)}>Remove</button>
          </div>
        </section>
      ))}
      {!loading && !items.length && <section className={CARD}><p className={EMPTY}>Empty — save one from the <a className={LINK} href="/comparison">Comparison</a> page.</p></section>}
    </>
  );
}
