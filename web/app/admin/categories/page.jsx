'use client';
import { useEffect, useState } from 'react';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY, BTN_DANGER, badge, BADGE } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import Modal, { ConfirmDialog } from '../../../components/Modal';

const csvGet = (arr) => (arr || []).join(', ');

export default function AdminCategories() {
  const call = useAdminApi();
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  async function load() {
    setLoading(true); setErr('');
    try { setRows(await call('/admin/categories') || []); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function startEdit(r) {
    setIsNew(false);
    setForm({ title: r.title || '', label: r.label || '', sort: r.sort ?? 0, is_active: r.is_active !== false,
      nameContains: csvGet(r.nameContains), classTypes: csvGet(r.classTypes), excludeName: csvGet(r.excludeName) });
    setEditing(r); setErr('');
  }
  function startNew() {
    setIsNew(true);
    setForm({ key: '', title: '', label: '', sort: rows.length, is_active: true, nameContains: '', classTypes: '', excludeName: '' });
    setEditing({ key: '' }); setErr('');
  }
  const csvSet = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  async function save() {
    setBusy(true); setErr('');
    try {
      const body = {
        title: form.title?.trim(), label: form.label?.trim(), sort: Number(form.sort) || 0,
        is_active: !!form.is_active, nameContains: csvSet(form.nameContains),
        classTypes: csvSet(form.classTypes), excludeName: csvSet(form.excludeName),
      };
      if (isNew) {
        if (!/^[a-z0-9-]{1,30}$/.test(form.key || '')) throw new Error('key must be [a-z0-9-], max 30 chars.');
        await call('/admin/categories', { method: 'POST', body: JSON.stringify({ key: form.key.trim(), ...body }) });
        setNotice(`Category “${form.key}” created.`);
      } else {
        await call(`/admin/categories/${editing.key}`, { method: 'PATCH', body: JSON.stringify(body) });
        setNotice(`Category “${editing.key}” saved. Weekend Best updates within a minute.`);
      }
      setEditing(null);
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function flip(r) {
    setErr('');
    try {
      const updated = await call(`/admin/categories/${r.key}`, { method: 'PATCH', body: JSON.stringify({ is_active: !r.is_active }) });
      setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, is_active: updated.is_active } : x)));
    } catch (e) { setErr(e.message); }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true); setErr('');
    try {
      await call(`/admin/categories/${deleting.key}`, { method: 'DELETE' });
      setDeleting(null);
      setNotice(`Category “${deleting.key}” deleted.`);
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <>
      <h1 className={H1}>Rider categories</h1>
      <p className={SUB}>Titles and matching rules for Weekend Best buckets. A rider's own category wins; otherwise the class field, otherwise these name/type rules. Changes apply within a minute.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      {notice && <section className={CARD}><p className="text-moss text-sm">{notice}</p></section>}
      <section className={CARD}>
        <div className="flex justify-end mb-3">
          <button className={BTN_PRIMARY} onClick={startNew}>+ New category</button>
        </div>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Title</th><th className={TH}>Matches</th>
            <th className={`${TH} ${NUM}`}>Order</th><th className={TH}>Status</th><th className={TH}><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.is_active ? '' : 'opacity-55'}>
                <td className={TD}><b>{r.title}</b><div className="text-faint text-[11px]">{r.key} · {r.label}</div></td>
                <td className={`${TD} text-muted text-[12px]`}>
                  {r.nameContains?.length ? <>name: {r.nameContains.join(', ')}<br /></> : null}
                  {r.classTypes?.length ? <>type: {r.classTypes.join(', ')}<br /></> : null}
                  {r.excludeName?.length ? <span className="text-faint">excl: {r.excludeName.join(', ')}</span> : null}
                  {!r.nameContains?.length && !r.classTypes?.length && <span className="text-faint">—</span>}
                </td>
                <td className={`${TD} ${NUM} text-muted`}>{r.sort}</td>
                <td className={TD}>
                  <button onClick={() => flip(r)} aria-pressed={!!r.is_active} title={r.is_active ? 'Switch off' : 'Switch on'}
                    className={`text-[11px] font-bold rounded-md px-2 py-[3px] border cursor-pointer transition-colors ${r.is_active ? 'bg-greenbg text-moss border-moss/30' : 'bg-redbg text-blood border-blood/40'}`}>
                    {r.is_active ? 'ON' : 'OFF'}
                  </button>
                </td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  <span className="inline-flex gap-1.5">
                    <button title={`Edit ${r.key}`} aria-label={`Edit ${r.key}`} onClick={() => startEdit(r)}
                      className="w-7 h-7 inline-flex items-center justify-center rounded border border-line bg-card2 text-sky hover:text-white hover:border-sky/60 text-[13px] cursor-pointer transition-colors">✎</button>
                    <button title={`Delete ${r.key}`} aria-label={`Delete ${r.key}`} onClick={() => setDeleting(r)}
                      className="w-7 h-7 inline-flex items-center justify-center rounded border border-line bg-card2 text-blood hover:border-blood/70 text-[13px] cursor-pointer transition-colors">🗑</button>
                  </span>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td colSpan={5} className={EMPTY}>No categories yet.</td></tr>}
            {loading && <tr><td colSpan={5} className={EMPTY}>Loading…</td></tr>}
          </tbody>
        </table>
        </div>
      </section>

      {editing && (
        <Modal title={isNew ? 'New category' : `Edit — ${editing.key}`} sub="Title shows on the site exactly as typed."
          onClose={() => setEditing(null)}
          footer={[
            <button key="c" onClick={() => setEditing(null)} disabled={busy}
              className="rounded border border-line px-4 py-2 text-sm text-muted hover:text-white bg-none cursor-pointer disabled:opacity-60">Cancel</button>,
            <button key="s" onClick={save} disabled={busy}
              className={`${BTN_PRIMARY} disabled:opacity-60`}>{busy ? 'Saving…' : isNew ? 'Create category' : 'Save changes'}</button>,
          ]}>
          {isNew && (
            <label className="text-xs text-muted flex flex-col gap-1 mb-3">Key (lowercase, permanent)
              <input className={INP} value={form.key || ''} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="veteran" maxLength={30} /></label>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-xs text-muted flex flex-col gap-1">Title (shown on site)
              <input className={INP} value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Best Veteran" /></label>
            <label className="text-xs text-muted flex flex-col gap-1">Short label
              <input className={INP} value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Veteran" /></label>
            <label className="text-xs text-muted flex flex-col gap-1">Order
              <input className={INP} type="number" value={form.sort ?? 0} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} /></label>
            <label className="text-xs text-muted flex items-center gap-2 pt-5">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="accent-gold w-4 h-4" />
              Active (shown on site)
            </label>
            <label className="text-xs text-muted flex flex-col gap-1 md:col-span-2">Name contains (comma separated)
              <input className={INP} value={form.nameContains || ''} onChange={(e) => setForm({ ...form, nameContains: e.target.value })} placeholder="veteran, masters" /></label>
            <label className="text-xs text-muted flex flex-col gap-1 md:col-span-2">Class types (comma separated)
              <input className={INP} value={form.classTypes || ''} onChange={(e) => setForm({ ...form, classTypes: e.target.value })} placeholder="Grand Prix, Open" /></label>
            <label className="text-xs text-muted flex flex-col gap-1 md:col-span-2">Exclude if name contains
              <input className={INP} value={form.excludeName || ''} onChange={(e) => setForm({ ...form, excludeName: e.target.value })} placeholder="schooling" /></label>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete category “${deleting.key}”?`}
          body="Weekend Best buckets using it disappear. Rider and class records are untouched."
          confirmLabel="Delete category"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
