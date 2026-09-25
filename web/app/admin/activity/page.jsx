'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, badge, BADGE } from '../../../lib/tokens';

const ACT_CLS = { review: 'goldfill', claim: 'blue', training: 'green', health: 'green', watchlist: 'gray', comparison: 'gray', coach: 'blue' };

export default function AdminActivity() {
  const [rows, setRows] = useState([]);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  async function load(f) {
    setLoading(true); setErr('');
    try {
      const q = f ? `?action=${encodeURIComponent(f)}` : '';
      const res = await fetch(`${API}/admin/activity${q}`, { credentials: 'include' });
      if (res.status === 401 || res.status === 403) { setErr('Admin login required.'); setRows([]); }
      else setRows((await res.json()).data || []);
    } catch { setErr('API unreachable.'); }
    setLoading(false);
  }
  useEffect(() => { load(action); }, [action]);
  const fmt = (d) => { try { return new Date(d).toLocaleString('en-NZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return d; } };
  return (
    <>
      <h1 className={H1}>Activity audit</h1>
      <p className={SUB}>Every material change, who made it, and when. Filter by action prefix.</p>
      <div className="mb-4 flex gap-2">
        {['', 'review', 'claim', 'training', 'health', 'watchlist', 'comparison'].map((a) => (
          <button key={a} onClick={() => setAction(a)}
            className={`rounded-full px-3 py-1.5 text-[12px] border ${action === a ? 'bg-goldbg border-gold text-gold font-bold' : 'bg-card2 border-line text-muted'}`}>
            {a || 'All'}
          </button>
        ))}
      </div>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>When</th><th className={TH}>Actor</th><th className={TH}>Action</th><th className={TH}>Entity</th><th className={TH}>Detail</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={`${TD} text-muted whitespace-nowrap`}>{fmt(r.created_at)}</td>
                <td className={TD}>{r.actor}</td>
                <td className={TD}><span className={badge(BADGE[ACT_CLS[r.action.split('.')[0]] || 'gray'])}>{r.action}</span></td>
                <td className={TD}>{r.entity_type}{r.entity_id ? <span className="text-faint"> · {String(r.entity_id).slice(0, 8)}</span> : ''}</td>
                <td className={`${TD} text-muted`}><code>{JSON.stringify(r.detail)}</code></td>
              </tr>
            ))}
            {!rows.length && !loading && !err && <tr><td colSpan={5} className={EMPTY}>No audit entries yet.</td></tr>}
            {loading && <tr><td colSpan={5} className={EMPTY}>Loading…</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
