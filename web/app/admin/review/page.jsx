'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { BTN_SECONDARY, BTN_DANGER, BTN_PRIMARY, CARD, EMPTY, H1, H2, INP, MUT, SUB } from '../../../lib/tokens';
import Dropdown from '../../../components/Dropdown';

export default function ReviewQueue() {
  const [items, setItems] = useState([]);
  const [cands, setCands] = useState({ horse: [], rider: [] });
  const [match, setMatch] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  async function load() {
    setErr('');
    try {
      setItems(((await (await fetch(`${API}/review?status=pending`)).json()).data) || []);
      const [h, r] = await Promise.all([
        (await fetch(`${API}/rankings/horses?limit=100`)).json(),
        (await fetch(`${API}/rankings/riders?limit=100`)).json(),
      ]);
      setCands({ horse: h.data || [], rider: r.data || [] });
    } catch {
      setErr('API unreachable — queue could not load.');
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  async function act(id, action, match_id) {
    setErr('');
    try {
      const res = await fetch(`${API}/review/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, match_id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || `Action failed (${res.status}).`);
        return;
      }
    } catch {
      setErr('API unreachable — action not saved.');
      return;
    }
    load();
  }
  const key = (k) => (k === 'horse' ? 'horse_id' : 'rider_id');
  const nm = (k) => (k === 'horse' ? 'horse' : 'rider');
  return (
    <>
      <h1 className={H1}>Naming review</h1>
      <p className={SUB}>Ambiguous names awaiting a human decision: approve as new record, merge into canonical, or reject.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      {loading && <section className={CARD}><p className={EMPTY}>Loading queue…</p></section>}
      {items.map((q) => (
        <section className={CARD} key={q.id}>
          <h2 className={H2}>{q.raw_name} <span className={MUT}>({q.kind}, from {q.source})</span></h2>
          {q.suggested_match_name && (
            <p className={MUT}>Suggested match: <b className="text-body">{q.suggested_match_name}</b>{' '}
              {q.suggested_match_id && (
                <button className={BTN_SECONDARY} onClick={() => act(q.id, 'merge', q.suggested_match_id)}>Accept suggestion →</button>
              )}
            </p>
          )}
          <div className="flex gap-3 items-end flex-wrap">
            <button className={BTN_PRIMARY} onClick={() => act(q.id, 'approve_new')}>Approve new</button>
            <label className="text-xs text-muted flex flex-col gap-1">Merge into <Dropdown ariaLabel="Merge into" value={match[q.id] || ''} searchable placeholder="—"
              options={[{ value: '', label: '—' },
                ...(cands[q.kind] || []).map((c) => ({ value: c[key(q.kind)], label: c[nm(q.kind)] }))]}
              onSelect={(o) => setMatch({ ...match, [q.id]: o.value })} /></label>
            <button className={BTN_SECONDARY} onClick={() => act(q.id, 'merge', match[q.id])} disabled={!match[q.id]}>Merge</button>
            <button className={BTN_DANGER} onClick={() => act(q.id, 'reject')}>Reject</button>
          </div>
        </section>
      ))}
      {!loading && !items.length && !err && <section className={CARD}><p className={EMPTY}>Queue empty — all names resolved.</p></section>}
    </>
  );
}
