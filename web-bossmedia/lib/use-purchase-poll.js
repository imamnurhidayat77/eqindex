import { useEffect, useState } from 'react';
import { API } from './api';

// Polls purchase status until every id is paid. One batched request per
// round with backoff (2s → 8s, ~60s total), timers cleaned on unmount.
// States: checking | pending | paid | login | unknown.
export function usePurchasePoll(ids, { interval0 = 2000, cap = 8000, total = 60000 } = {}) {
  const [state, setState] = useState('checking');
  const [rows, setRows] = useState([]);
  const [attempt, setAttempt] = useState(0);
  const key = (ids || []).join(',');

  useEffect(() => {
    const list = key.split(',').filter(Boolean);
    if (!list.length) { setState('unknown'); return undefined; }
    let live = true;
    let timer;
    let wait = interval0;
    const t0 = Date.now();
    setState('checking');
    const check = async () => {
      try {
        const r = await fetch(`${API}/api/purchases?ids=${list.join(',')}`, { credentials: 'include' });
        if (r.status === 401) { if (live) setState('login'); return true; }
        const j = await r.json().catch(() => ({}));
        const got = Array.isArray(j.data) ? j.data : [];
        if (!live) return true;
        const paid = got.filter((g) => g && g.status === 'paid');
        if (paid.length === list.length) { setRows(paid); setState('paid'); return true; }
        if (paid.length || got.length) setState('pending');
        return false;
      } catch { return false; }
    };
    const round = async () => {
      if (!live) return;
      if (await check()) return;
      if (Date.now() - t0 > total) { if (live) setState('unknown'); return; }
      timer = setTimeout(() => { wait = Math.min(wait * 2, cap); round(); }, wait);
    };
    round();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [key, attempt, interval0, cap, total]);

  return { state, rows, retry: () => setAttempt((a) => a + 1) };
}
