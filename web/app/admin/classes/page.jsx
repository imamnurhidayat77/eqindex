'use client';
import { useEffect, useState } from 'react';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import { TableEmpty } from '../../../components/EmptyState';
import { Pagination } from '../../../components/list-controls';
import { LabeledSwitch } from '../../../components/Switch';
import Dropdown from '../../../components/Dropdown';
import { keyOptions, FALLBACK_CATS } from '../../../lib/categories';

// Class rider-category options come from the rider_categories master table
// (Admin → Categories). Stored values are master keys; '' = open/unrestricted.

// Per-class on/off switches. Switched-off classes stay in the DB (audit trail,
// profiles keep raw history) but are excluded from rankings, trends and every
// aggregate. Category-wide switches live under Admin → Settings.
export default function AdminClasses() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [busyId, setBusyId] = useState(null);
  const call = useAdminApi();
  const [cats, setCats] = useState(null);
  useEffect(() => {
    let live = true;
    call('/admin/categories').then((d) => { if (live) setCats(d || []); }).catch(() => { if (live) setCats([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(query) {
    setLoading(true); setErr('');
    try {
      const p = new URLSearchParams({ limit: '100' });
      if (query.trim().length >= 2) p.set('q', query.trim());
      setRows(await call(`/admin/classes?${p}`) || []); setPage(1);
    } catch (e) { setErr(e.message); setRows([]); }
    setLoading(false);
  }
  useEffect(() => {
    const t = setTimeout(() => load(q), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);
  async function flip(r) {
    setBusyId(r.id);
    try {
      const updated = await call(`/admin/classes/${r.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_active: !(r.is_active ?? true) }),
      });
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...(updated || {}), is_active: updated?.is_active ?? !(r.is_active ?? true) } : x)));
    } catch (e) { setErr(e.message); }
    setBusyId(null);
  }

  async function flipWC(r) {
    setBusyId(r.id);
    try {
      const updated = await call(`/admin/classes/${r.id}`, {
        method: 'PATCH', body: JSON.stringify({ is_world_cup: !(r.is_world_cup ?? false) }),
      });
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...(updated || {}), is_world_cup: updated?.is_world_cup ?? !(r.is_world_cup ?? false) } : x)));
    } catch (e) { setErr(e.message); }
    setBusyId(null);
  }
  async function setCategory(r, v) {
    setBusyId(r.id);
    try {
      const updated = await call(`/admin/classes/${r.id}`, {
        method: 'PATCH', body: JSON.stringify({ rider_category: v || null }),
      });
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, rider_category: updated?.rider_category ?? null } : x)));
    } catch (e) { setErr(e.message); }
    setBusyId(null);
  }
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(page, pages);
  const view = rows.slice((safePage - 1) * perPage, safePage * perPage);
  const offN = rows.filter((r) => r.is_active === false).length;

  return (
    <>
      <h1 className={H1}>Classes</h1>
      <p className={SUB}>
        Per-class tracking switches{offN > 0 && <> — <b className="text-gold">{offN} switched off</b> in this view</>}.
        Category-wide switches live under Admin → Settings.
      </p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <div className="mb-4 rounded border border-line bg-card p-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search class or event… (min 2 chars)"
          className={`${INP} w-full max-w-[320px]`} />
      </div>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Class</th><th className={TH}>Event</th><th className={TH}>Date</th>
            <th className={TH}>Type</th><th className={`${TH} ${NUM}`}>Ht</th>
            <th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}>Category</th><th className={TH}>Tracked</th><th className={TH}>WC</th>
          </tr></thead>
          <tbody>
            {view.map((r) => {
              const on = r.is_active ?? true;
              return (
                <tr key={r.id} className={on ? '' : 'opacity-55'}>
                  <td className={TD}><b>{r.name}</b></td>
                  <td className={`${TD} text-muted`}>{r.event_name}</td>
                  <td className={`${TD} text-muted whitespace-nowrap`}>{(r.class_date || '').slice(0, 10) || '—'}</td>
                  <td className={TD}>{r.class_type || '—'}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{r.height_cm ? `${r.height_cm}cm` : '—'}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{r.round_count}</td>
                  <td className={TD}>
                    <Dropdown ariaLabel={`Category for ${r.name}`} value={r.rider_category || ''} size="sm"
                      options={[{ value: '', label: 'Open' }, ...keyOptions(cats === null ? FALLBACK_CATS : cats, r.rider_category)]}
                      onSelect={(o) => { if ((o.value || null) !== (r.rider_category || null)) setCategory(r, o.value); }} />
                  </td>
                  <td className={TD}>
                    <LabeledSwitch
                      on={on}
                      onFlip={() => flip(r)}
                      label={`${r.name} tracked`}
                      disabled={busyId === r.id}
                      size="sm"
                    />
                  </td>
                  <td className={TD}>
                    <LabeledSwitch
                      on={!!r.is_world_cup}
                      onFlip={() => flipWC(r)}
                      label={`${r.name} World Cup class`}
                      disabled={busyId === r.id}
                      size="sm"
                    />
                  </td>
                </tr>
              );
            })}
            {!view.length && !loading && (
              <TableEmpty icon="📋" title={q ? 'No classes match this search' : 'No classes recorded yet'} hint={q ? 'Try a different class or event name.' : 'Classes appear here once results are imported.'} />
            )}
            {loading && <tr><td colSpan={9} className="px-2 py-4">
              <span className="flex flex-col gap-2 py-1" aria-hidden="true" aria-label="Loading">
                {[0, 1, 2].map((i) => <span key={i} className="sk h-3.5 w-full" />)}
              </span>
            </td></tr>}
          </tbody>
        </table>
        </div>
        <Pagination page={safePage} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={rows.length} />
      </section>
    </>
  );
}
