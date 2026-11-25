'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CARD, H1, H2, SUB, TABLE, TABLEWRAP, TD, TH, NUM, BTN, BTN_PRIMARY, LINK } from '../../../../lib/tokens';
import { useAdminApi } from '../../../../components/useAdminApi';
import EntityPicker from '../../../../components/EntityPicker';
import { ConfirmDialog } from '../../../../components/Modal';
import { fmtDay } from '../../../../lib/dates';

// Merge duplicate horses. Every merge is previewed first (the API runs the
// real merge and rolls it back), then confirmed, and can be undone from the
// history list. Old URLs of the merged horse keep working.
const MOVED_LABELS = {
  round_results: 'results', media: 'photos', packages: 'photo packages', watchlist_entity: 'watchlist follows',
  watchlist_horse: 'combination follows', horse_aliases: 'name aliases', health_records: 'health notes',
  training_records: 'training notes', correction_reports: 'correction reports', credit_bundles: 'credit bundles',
  claimed_photos: 'claimed photos',
};
const summary = (moved = {}) => Object.entries(moved).filter(([, n]) => n > 0)
  .map(([k, n]) => `${n} ${MOVED_LABELS[k] || k}`).join(', ') || 'nothing to move';

export default function MergeHorses() {
  const call = useAdminApi();
  const [groups, setGroups] = useState(null);
  const [history, setHistory] = useState([]);
  const [keep, setKeep] = useState({}); // group index -> horse id to keep
  const [dup, setDup] = useState(null);
  const [into, setInto] = useState(null);
  const [preview, setPreview] = useState(null); // {from, into, data}
  const [confirm, setConfirm] = useState(false);
  const [undo, setUndo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    try {
      const [g, h] = await Promise.all([call('/admin/horses/duplicates'), call('/admin/horses/merges')]);
      setGroups(Array.isArray(g) ? g : []);
      setHistory(Array.isArray(h) ? h : []);
    } catch (e) { setMsg(e.message); setGroups([]); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function runPreview(from, to) {
    setBusy(true); setMsg(''); setPreview(null);
    try {
      const d = await call('/admin/horses/merge', { method: 'POST', body: JSON.stringify({ from_id: from.id, into_id: to.id, dry_run: true }) });
      setPreview({ from, into: to, data: d });
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }
  async function doMerge() {
    setBusy(true); setMsg('');
    try {
      const d = await call('/admin/horses/merge', { method: 'POST', body: JSON.stringify({ from_id: preview.from.id, into_id: preview.into.id, dry_run: false }) });
      setMsg(`Merged ${preview.from.name} into ${preview.into.name}: moved ${summary(d.moved)}. You can undo it below.`);
      setPreview(null); setDup(null); setInto(null); setKeep({});
      await load();
    } catch (e) { setMsg(e.message); }
    setBusy(false); setConfirm(false);
  }
  async function doUndo() {
    setBusy(true); setMsg('');
    try {
      await call(`/admin/horses/merges/${undo.id}/undo`, { method: 'POST' });
      setMsg(`Undone: ${undo.from_name} is back as its own horse.`);
      await load();
    } catch (e) { setMsg(e.message); }
    setBusy(false); setUndo(null);
  }

  return (
    <>
      <div className="mb-1 text-[12px] text-faint"><Link href="/admin/horses" className="text-muted hover:text-white">Horses</Link></div>
      <h1 className={H1}>Merge horses</h1>
      <p className={SUB}>Combine two records of the same horse. Results, photos and follows move to the horse you keep. Every merge is previewed first and can be undone.</p>
      {msg && <section className={CARD} role="status"><p className="text-sm text-gold">{msg}</p></section>}

      <section className={CARD}>
        <h2 className={H2}>Possible duplicates</h2>
        <p className="text-[13px] text-muted mb-3">Same name ignoring case, spaces and punctuation, or only a stud suffix apart (NZ, GNZ, MVNZ). Check birth year and parents before merging: similar names can be different horses.</p>
        {groups === null && <p className="text-[13px] text-muted">Looking for duplicates…</p>}
        {groups && !groups.length && <p className="text-[13px] text-muted">No likely duplicates found.</p>}
        <div className="flex flex-col gap-3">
          {(groups || []).map((g, gi) => {
            const keepId = keep[gi] || g[0].id;
            return (
              <div key={gi} className="rounded-lg border border-line bg-ink p-3">
                <div className={TABLEWRAP}>
                  <table className={TABLE}>
                    <thead><tr><th className={TH}>Keep</th><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}>Born</th><th className={TH}>Sire × Dam</th></tr></thead>
                    <tbody>
                      {g.map((h) => (
                        <tr key={h.id}>
                          <td className={TD}><input type="radio" name={`keep-${gi}`} checked={keepId === h.id}
                            onChange={() => setKeep({ ...keep, [gi]: h.id })} aria-label={`Keep ${h.name}`} /></td>
                          <td className={TD}><Link className={LINK} href={`/horses/${h.slug || h.id}`} target="_blank">{h.name}</Link></td>
                          <td className={`${TD} ${NUM}`}>{h.rounds}</td>
                          <td className={TD}>{h.yob || '—'}</td>
                          <td className={`${TD} text-muted`}>{[h.sire, h.dam].filter(Boolean).join(' × ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {g.length === 2 && (
                  <button disabled={busy} className={`${BTN} mt-2`}
                    onClick={() => { const to = g.find((h) => h.id === keepId); const from = g.find((h) => h.id !== keepId); runPreview(from, to); }}>
                    Preview merge
                  </button>
                )}
                {g.length > 2 && <p className="mt-2 text-[12px] text-muted">More than two records: merge them one pair at a time below.</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className={CARD}>
        <h2 className={H2}>Merge any two horses</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-muted">Duplicate (will be removed)
            <EntityPicker kind="horse" value={dup} onPick={setDup} placeholder="Search horse…" width={260} /></label>
          <span aria-hidden="true" className="pb-2 text-muted">→</span>
          <label className="flex flex-col gap-1 text-[12px] text-muted">Horse to keep
            <EntityPicker kind="horse" value={into} onPick={setInto} placeholder="Search horse…" width={260} /></label>
          <button disabled={busy || !dup || !into || dup.id === into.id} className={BTN} onClick={() => runPreview(dup, into)}>Preview merge</button>
        </div>
      </section>

      {preview && (
        <section className={`${CARD} border-gold/50`}>
          <h2 className={H2}>Preview</h2>
          <p className="mt-2 text-sm">
            <b className="text-white">{preview.from.name}</b> <span className="text-muted">merges into</span> <b className="text-white">{preview.into.name}</b>
          </p>
          <ul className="mt-2 list-disc pl-5 text-[13px] text-muted">
            <li>Moves {summary(preview.data.moved)}.</li>
            {Object.keys(preview.data.filled || {}).length > 0 && <li>Fills empty fields on {preview.into.name}: {Object.keys(preview.data.filled).join(', ')}.</li>}
            {Object.values(preview.data.removed || {}).some((n) => n > 0) && <li>Drops {summary(preview.data.removed)} that {preview.into.name} already had.</li>}
            <li>&ldquo;{preview.from.name}&rdquo; becomes a name alias, so future imports land on {preview.into.name}. Its old page link redirects.</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <button disabled={busy} className={BTN_PRIMARY} onClick={() => setConfirm(true)}>Merge</button>
            <button disabled={busy} className={BTN} onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </section>
      )}

      <section className={CARD}>
        <h2 className={H2}>Merge history</h2>
        <div className={`${TABLEWRAP} mt-2`}>
          <table className={TABLE}>
            <thead><tr><th className={TH}>When</th><th className={TH}>Merged</th><th className={TH}>Into</th><th className={`${TH} ${NUM}`}>Results moved</th><th className={TH}>By</th><th className={TH} /></tr></thead>
            <tbody>
              {history.map((m) => (
                <tr key={m.id}>
                  <td className={TD}>{fmtDay(m.created_at)}</td>
                  <td className={TD}>{m.from_name}</td>
                  <td className={TD}>{m.into_slug ? <Link className={LINK} href={`/horses/${m.into_slug}`}>{m.into_name}</Link> : (m.into_name || '—')}</td>
                  <td className={`${TD} ${NUM}`}>{m.rounds_moved}</td>
                  <td className={`${TD} text-muted`}>{m.merged_by || '—'}</td>
                  <td className={TD}>{m.undone_at
                    ? <span className="text-[12px] text-muted">Undone {fmtDay(m.undone_at)}</span>
                    : <button disabled={busy} className="text-[13px] text-sky hover:underline bg-none border-0 cursor-pointer" onClick={() => setUndo(m)}>Undo</button>}</td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={6} className="px-2 py-4 text-[13px] text-muted">No merges yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {confirm && preview && (
        <ConfirmDialog title={`Merge ${preview.from.name} into ${preview.into.name}?`}
          body={`Results, photos and follows move to ${preview.into.name} and ratings recalculate. ${preview.from.name} is removed as a separate horse. You can undo this from Merge history.`}
          confirmLabel="Merge" danger={false} busy={busy} onCancel={() => setConfirm(false)} onConfirm={doMerge} />
      )}
      {undo && (
        <ConfirmDialog title={`Undo merge of ${undo.from_name}?`}
          body={`${undo.from_name} comes back as its own horse with the results, photos and follows it had before the merge.`}
          confirmLabel="Undo merge" danger={false} busy={busy} onCancel={() => setUndo(null)} onConfirm={doUndo} />
      )}
    </>
  );
}
