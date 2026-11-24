'use client';
// EQIndex rating (Model B) — single live config. No versions, no drafts:
// edit the weights, Save, live immediately. Every save is snapshotted as
// a new active version behind the scenes (audit trail, rollback via Scoring).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CARD, H1, SUB, BTN, BTN_PRIMARY, LINK } from '../../../lib/tokens';
import { ConfirmDialog } from '../../../components/Modal';
import { useAdminApi } from '../../../components/useAdminApi';
import { AdminFormSk } from '../../../components/Skeletons';
import { ModelBSections } from '../../../components/ScoringForms';

export default function AdminRating() {
  const call = useAdminApi();
  const [meta, setMeta] = useState(null);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [asking, setAsking] = useState(false);
  const dirty = !!(meta && draft) && JSON.stringify(draft) !== JSON.stringify(meta.params || {});

  async function load() {
    setErr('');
    try {
      const v = await call('/admin/rating/active');
      setMeta(v);
      setDraft(v.params ? JSON.parse(JSON.stringify(v.params)) : {});
    } catch (e) { setErr(e.message); setMeta(null); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setAsking(false);
    if (!draft) return;
    setBusy(true); setErr(''); setNotice('');
    try {
      const v = await call('/admin/rating/active', { method: 'PUT', body: JSON.stringify({ modelb: draft.modelb || {} }) });
      setMeta(v);
      setDraft(v.params ? JSON.parse(JSON.stringify(v.params)) : {});
      setSavedAt(new Date());
      setNotice(`Live as v${v.version} — rating views use these weights immediately.`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <>
      <h1 className={H1}>EQIndex rating</h1>
      <p className={SUB}>Model B weights, live now{meta ? ` · ${meta.season} v${meta.version}` : ''}. Changes go live for every visitor when you save. Each save is kept as a version, so you can roll back under <Link className={LINK} href="/admin/scoring">Scoring</Link>.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      {notice && <section className={CARD}><p className="text-moss text-sm">{notice}</p></section>}
      {draft ? (
        <section className={CARD}>
          <ModelBSections draft={draft} setDraft={setDraft} />
          <div className="flex flex-wrap items-center gap-2 mt-4 sticky bottom-0 py-3 border-t border-line" style={{ backgroundColor: '#141414' }}>
            <button className={`${BTN_PRIMARY} disabled:opacity-40 disabled:cursor-not-allowed`} disabled={busy || !dirty} onClick={() => setAsking(true)}>{busy ? 'Saving…' : 'Save — go live'}</button>
            {dirty && !busy && <button className={BTN} onClick={() => setDraft(JSON.parse(JSON.stringify(meta.params || {})))}>Discard changes</button>}
            {!dirty && !savedAt && <span className="text-[12px] text-muted">No unsaved changes.</span>}
            {savedAt && <span className="text-[12px] text-muted">Saved {savedAt.toLocaleTimeString()}.</span>}
          </div>
        </section>
      ) : !err && (
        <AdminFormSk rows={4} />
      )}
      {asking && (
        <ConfirmDialog
          title="Put these weights live?"
          body={<p>Every horse and rider rating on the public site is recalculated with the new weights right away. The current version stays in Scoring if you need to roll back.</p>}
          confirmLabel="Save and go live"
          danger={false}
          onCancel={() => setAsking(false)}
          onConfirm={save}
        />
      )}
    </>
  );
}
