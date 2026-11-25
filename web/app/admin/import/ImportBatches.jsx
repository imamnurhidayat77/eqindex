'use client';
// Undoable imports (migration 117): each committed import run is one batch.
// Undo is two steps: Preview runs the real undo and rolls it back, so the
// numbers shown are exactly what Confirm will do.
import { useEffect, useState } from 'react';
import { CARD, TABLE, TABLEWRAP, TD, TH, NUM, BTN, BTN_DANGER, badge, BADGE } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';

const LIST_LIMIT = 20;
const when = (t) => (t ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ENTITY_LABEL = { horses: ['horse', 'horses'], riders: ['rider', 'riders'], classes: ['class', 'classes'], events: ['event', 'events'], venues: ['venue', 'venues'] };

function UndoSummary({ s }) {
  const removed = Object.entries(s.removed || {}).filter(([, n]) => n > 0)
    .map(([t, n]) => plural(n, ENTITY_LABEL[t][0], ENTITY_LABEL[t][1]));
  return (
    <ul className="mt-1 list-disc pl-5 text-[13px] text-body">
      <li>{plural(s.results_deleted, 'result')} deleted, {plural(s.classes_recalculated, 'class', 'classes')} recalculated</li>
      <li>{removed.length ? `Created by this import and removed: ${removed.join(', ')}` : 'Nothing this import created needs removing'}</li>
      {s.fills_reverted > 0 && <li>{plural(s.fills_reverted, 'blank field')} the import filled on existing records restored to blank</li>}
      {(s.kept || []).map((k) => <li key={k.id} className="text-gold [overflow-wrap:anywhere]">Kept {ENTITY_LABEL[k.table]?.[0] || k.table} “{k.name}”: {k.reason}</li>)}
      {(s.fills_skipped || []).length > 0 && (
        <li className="text-muted">{plural(s.fills_skipped.length, 'filled field')} left as is (changed since the import or record gone)</li>
      )}
    </ul>
  );
}

export default function ImportBatches() {
  const call = useAdminApi();
  const [batches, setBatches] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  // { id, phase: 'preview'|'done', data?, error? } for the one open row
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);

  async function load() {
    try {
      setBatches(await call(`/admin/import-batches?limit=${LIST_LIMIT}`));
      setLoadErr('');
    } catch (e) { setLoadErr(e.message); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function undo(id, dryRun) {
    setBusy(id);
    try {
      const data = await call(`/admin/imports/${id}/undo`, { method: 'POST', body: JSON.stringify({ dry_run: dryRun }) });
      setOpen({ id, phase: dryRun && !data.already_undone ? 'preview' : 'done', data });
      if (!dryRun) await load();
    } catch (e) {
      setOpen({ id, phase: 'error', error: e.message });
    }
    setBusy(null);
  }

  if (loadErr) return <section className={CARD}><h2 className="text-[15px] font-bold mb-1">Undoable imports</h2><p className="text-blood text-sm">Could not load imports: {loadErr}</p></section>;
  if (!batches) return null;
  return (
    <section className={CARD}>
      <h2 className="text-[15px] font-bold mb-0.5">Undoable imports</h2>
      <p className="text-[13px] text-muted mb-2">Every commit since undo support was added. Imports before that cannot be undone here.</p>
      {!batches.length ? <p className="text-[13px] text-muted">No undoable imports yet.</p> : (
        <div className={TABLEWRAP}>
          <table className={TABLE}>
            <thead><tr>
              <th className={TH}>When</th><th className={TH}>By</th><th className={TH}>Import</th>
              <th className={`${TH} ${NUM}`}>Results</th><th className={TH}>Status</th><th className={TH}><span className="sr-only">Actions</span></th>
            </tr></thead>
            {batches.map((b) => {
              const isOpen = open?.id === b.id;
              return (
                <tbody key={b.id}>
                  <tr className="align-top">
                    <td className={`${TD} text-muted whitespace-nowrap`}>{when(b.created_at)}</td>
                    <td className={TD}>{b.actor_name || '–'}</td>
                    <td className={`${TD} min-w-[180px]`}>
                      <div className="[overflow-wrap:anywhere]">{b.filename || b.source}</div>
                      {b.event_names && <div className="text-[12px] text-muted [overflow-wrap:anywhere]">{b.event_names}</div>}
                    </td>
                    <td className={`${TD} ${NUM}`}>{b.status === 'undone' ? b.rows_ok : b.results_now}</td>
                    <td className={`${TD} whitespace-nowrap`}>{b.status === 'undone'
                      ? <span className={badge(BADGE.gray)}>undone {when(b.undone_at)}</span>
                      : <span className={badge(BADGE.green)}>active</span>}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      {b.status === 'active' && !(isOpen && open.phase === 'preview') && (
                        <button type="button" className={BTN} disabled={!!busy} onClick={() => undo(b.id, true)}>
                          {busy === b.id ? 'Checking…' : 'Preview undo'}</button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className={`${TD} pt-0`}>
                        <div role="status" aria-live="polite" className="rounded-md border border-line bg-ink p-3">
                          {open.phase === 'error' && <p className="text-[13px] text-blood [overflow-wrap:anywhere]">{open.error}</p>}
                          {open.phase === 'preview' && (
                            <>
                              <p className="text-[13px] font-bold">Undo will:</p>
                              <UndoSummary s={open.data} />
                              <p className="mt-2 text-[12px] text-faint">Results corrected by hand after this import are deleted with it. Nothing is changed until you confirm.</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={() => undo(b.id, false)}>
                                  {busy === b.id ? 'Undoing…' : 'Confirm undo'}</button>
                                <button type="button" className={BTN} disabled={!!busy} onClick={() => setOpen(null)}>Cancel</button>
                              </div>
                            </>
                          )}
                          {open.phase === 'done' && (open.data.already_undone
                            ? <p className="text-[13px] text-muted">{open.data.message}</p>
                            : <><p className="text-[13px] font-bold text-moss">Import undone.</p><UndoSummary s={open.data} /></>)}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </section>
  );
}
