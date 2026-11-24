'use client';
// Admin > Merch catalog: name, price, colours, sizes and logo spots of every
// product the 3D designer can draw. The API checks every save with the same
// rules as the store (parseMerchProduct). Products are hidden, never deleted.
// A new product reuses one of the built-in 3D models; a new 3D shape needs
// code first (docs/merch-3d-models.md).
import { useEffect, useState } from 'react';
import { useNotify } from './Toaster';
import { nzdc, studio } from '../lib/studio';
import { MERCH_CATEGORIES, MERCH_PRODUCTS, MERCH_STATUSES, RIDER_MODELS, newMerchProductDraft } from '../lib/merch.mjs';
import formRow from './FormRow.module.css';
import s from './AdminMerchCatalog.module.css';

const CATEGORIES = MERCH_CATEGORIES.filter((c) => c.id !== 'all');
const STATUS_LABEL = { active: 'In store', hidden: 'Hidden' };
const toDollars = (cents) => String(Number(cents) / 100);
const toCents = (v) => Math.round(Number(String(v).replace(/[^0-9.]/g, '')) * 100);
const MODEL_LABEL = Object.fromEntries(MERCH_PRODUCTS.map((p) => [p.id, p.label]));

// Form state keeps prices as typed dollars; the API gets whole cents.
function toForm(row) {
  const d = row.data;
  return {
    ...d,
    badge: d.badge || '',
    modelFile: d.modelFile || '',
    base: toDollars(d.baseCents),
    sizesText: d.sizes.join(', '),
    colorList: d.colorList.map((c) => ({ ...c })),
    slotList: d.slotList.map((x) => ({ ...x, premium: toDollars(x.premiumCents) })),
  };
}

function toBody(f) {
  return {
    label: f.label, category: f.category, badge: f.badge, blurb: f.blurb, status: f.status, modelFile: f.modelFile || null,
    sort: Number(f.sort), baseCents: toCents(f.base),
    colorList: f.colorList.map(({ hex, name }) => ({ hex, name })),
    sizes: f.sizesText.split(',').map((z) => z.trim()).filter(Boolean),
    slotList: f.slotList.map(({ id, label, widthMm, heightMm, premium, active }) => ({
      id, label, active, widthMm: Number(widthMm), heightMm: Number(heightMm), premiumCents: toCents(premium),
    })),
  };
}

export default function AdminMerchCatalog() {
  const notify = useNotify();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null); // new product being created
  useEffect(() => {
    studio.get('/api/merch/catalog').then((r) => setRows(r || [])).catch((e) => notify(e.message, true));
  }, [notify]);

  if (rows === null) return <p className="empty-note">Loading…</p>;
  const sorted = [...rows].sort((a, b) => a.data.sort - b.data.sort);
  return (
    <>
      <div className="st-card" style={{ padding: '6px 22px' }}>
        <div className="table-scroll"><table className="st-table">
          <thead><tr><th>Product</th><th>3D model</th><th>Status</th><th>Base price</th><th>Colours</th><th>Sizes</th><th>Logo spots</th><th /></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.data.label}</strong><br /><small className={s.muted}>{r.id}</small></td>
                <td>{MODEL_LABEL[r.data.model || r.id]}</td>
                <td>{STATUS_LABEL[r.data.status]}</td>
                <td>{nzdc(r.data.baseCents)}</td>
                <td>
                  <span className={s.dots}>
                    {r.data.colorList.map((c) => <span key={c.hex} className={s.dot} style={{ background: c.hex }} title={c.name} />)}
                  </span>
                </td>
                <td>{r.data.sizes.join(' · ')}</td>
                <td>{r.data.slotList.filter((x) => x.active).length} of {r.data.slotList.length}</td>
                <td>
                  <button className="st-btn-ghost" style={{ minHeight: 36 }} aria-expanded={editing === r.id}
                    onClick={() => { setDraft(null); setEditing(editing === r.id ? null : r.id); }}>{editing === r.id ? 'Close' : 'Edit'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      {!draft && <NewProduct taken={new Set(rows.map((r) => r.id))} onStart={(d) => { setEditing(null); setDraft(d); }} />}
      {draft && (
        <ProductEditor key={`new-${draft.id}`} row={{ id: draft.id, data: draft }} isNew
          onCancel={() => setDraft(null)}
          onSaved={(next) => { setRows(next); setDraft(null); }} />
      )}
      {editing && (
        <ProductEditor key={editing} row={rows.find((r) => r.id === editing)}
          onCancel={() => setEditing(null)}
          onSaved={(next) => { setRows(next); setEditing(null); }} />
      )}
      <p className="st-csub" style={{ marginTop: 12 }}>
        Changes reach the store within a minute. Orders already sent keep their price and colour.
        A new product uses the 3D model, logo spot positions and photos of the model you pick.
        A new 3D shape (boots, bags) needs code first (docs/merch-3d-models.md).
      </p>
    </>
  );
}

// Step 1 of a new product: its permanent id and the model it reuses. The
// editor below then opens prefilled from that model, hidden from the store.
function NewProduct({ taken, onStart }) {
  const notify = useNotify();
  const [id, setId] = useState('');
  const [model, setModel] = useState(MERCH_PRODUCTS[0].id);
  function start(e) {
    e.preventDefault();
    const clean = id.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(clean)) return notify('Product id: 2 to 40 lowercase letters, digits or dashes, e.g. club-hoodie.', true);
    if (taken.has(clean)) return notify('That id is already used.', true);
    onStart(newMerchProductDraft(clean, model));
  }
  return (
    <div className="st-card" style={{ padding: 18, marginTop: 16 }}>
      <h3 style={{ margin: '0 0 4px' }}>Add a product</h3>
      <p className="st-csub" style={{ margin: '0 0 12px' }}>The id becomes the link (/merch/club-hoodie) and cannot change later.</p>
      <form className="st-form" onSubmit={start}>
        <div className={`st-form-row ${formRow.row3}`}>
          <label><span>Product id</span><input value={id} maxLength={40} placeholder="club-hoodie" onChange={(e) => setId(e.target.value)} /></label>
          <label><span>3D model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {MERCH_PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select></label>
        </div>
        <div><button className="st-btn" type="submit">Continue</button></div>
      </form>
    </div>
  );
}

function ProductEditor({ row, isNew = false, onCancel, onSaved }) {
  const notify = useNotify();
  const [f, setF] = useState(() => toForm(row));
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const setColor = (i, patch) => set({ colorList: f.colorList.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setSlot = (i, patch) => set({ slotList: f.slotList.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = isNew
        ? await studio.post('/admin/merch/catalog', { ...toBody(f), id: row.id, model: row.data.model })
        : await studio.put(`/admin/merch/catalog/${encodeURIComponent(row.id)}`, toBody(f));
      notify(isNew ? `${f.label} added (hidden until you set it to In store)` : `${f.label} saved`);
      onSaved(data);
    } catch (err) {
      notify(err.message, true);
      setBusy(false);
    }
  }

  return (
    <div className="st-card" style={{ padding: 18, marginTop: 16 }}>
      <h3 style={{ margin: '0 0 12px' }}>
        {isNew ? `New product: ${row.id}` : `Edit ${row.data.label}`}
        <small className={s.muted}> · 3D model: {MODEL_LABEL[row.data.model || row.id]}</small>
      </h3>
      <form className="st-form" onSubmit={save}>
        <div className={`st-form-row ${formRow.row3}`}>
          <label><span>Name</span><input value={f.label} maxLength={60} required onChange={(e) => set({ label: e.target.value })} /></label>
          <label><span>Base price (NZ$, incl. GST)</span>
            <input type="text" inputMode="decimal" value={f.base} required onChange={(e) => set({ base: e.target.value })} /></label>
          <label><span>Status</span>
            <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
              {MERCH_STATUSES.map((v) => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}
            </select></label>
        </div>
        <div className={`st-form-row ${formRow.row3}`}>
          <label><span>Category</span>
            <select value={f.category} onChange={(e) => set({ category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></label>
          <label><span>Badge (optional)</span><input value={f.badge} maxLength={20} placeholder="e.g. Bestseller" onChange={(e) => set({ badge: e.target.value })} /></label>
          <label><span>Sort order (0 first)</span>
            <input type="number" min={0} max={999} value={f.sort} onChange={(e) => set({ sort: e.target.value })} /></label>
        </div>
        <label><span>Description</span><input value={f.blurb} maxLength={160} onChange={(e) => set({ blurb: e.target.value })} /></label>
        {RIDER_MODELS[row.data.model || row.id] && (
          <label><span>Own 3D file (optional, any shirt-shaped GLB)</span>
            <input value={f.modelFile} placeholder="/models/rider/club-hoodie.glb" onChange={(e) => set({ modelFile: e.target.value })} /></label>
        )}

        <fieldset className={s.group}>
          <legend>Colours</legend>
          {f.colorList.map((c, i) => (
            <div key={i} className={s.colorRow}>
              <input type="color" className={s.swatch} value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#000000'}
                aria-label={`Colour ${i + 1}`} onChange={(e) => setColor(i, { hex: e.target.value })} />
              <input value={c.hex} maxLength={7} aria-label={`Colour ${i + 1} hex`} className={s.hex}
                onChange={(e) => setColor(i, { hex: e.target.value.trim() })} />
              <input value={c.name} maxLength={30} placeholder="Name, e.g. Navy" aria-label={`Colour ${i + 1} name`}
                onChange={(e) => setColor(i, { name: e.target.value })} />
              <button type="button" className="st-btn-ghost" style={{ minHeight: 36 }} disabled={f.colorList.length < 2}
                onClick={() => set({ colorList: f.colorList.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          {f.colorList.length < 12 && (
            <div><button type="button" className="st-btn-ghost" style={{ minHeight: 36 }}
              onClick={() => set({ colorList: [...f.colorList, { hex: '#808080', name: '' }] })}>Add colour</button></div>
          )}
        </fieldset>

        <label><span>Sizes (comma separated, in display order)</span>
          <input value={f.sizesText} onChange={(e) => set({ sizesText: e.target.value })} /></label>

        <fieldset className={s.group}>
          <legend>Logo spots</legend>
          <div className="table-scroll"><table className="st-table">
            <thead><tr><th>On</th><th>Label</th><th>Width (mm)</th><th>Height (mm)</th><th>Extra (NZ$)</th></tr></thead>
            <tbody>
              {f.slotList.map((x, i) => (
                <tr key={x.id}>
                  <td><input type="checkbox" checked={x.active} style={{ width: 'auto' }} aria-label={`${x.label} on`}
                    onChange={(e) => setSlot(i, { active: e.target.checked })} /></td>
                  <td><input value={x.label} maxLength={30} aria-label={`${x.id} label`} onChange={(e) => setSlot(i, { label: e.target.value })} /></td>
                  <td><input type="number" min={10} max={2000} value={x.widthMm} className={s.num} aria-label={`${x.label} width`}
                    onChange={(e) => setSlot(i, { widthMm: e.target.value })} /></td>
                  <td><input type="number" min={10} max={2000} value={x.heightMm} className={s.num} aria-label={`${x.label} height`}
                    onChange={(e) => setSlot(i, { heightMm: e.target.value })} /></td>
                  <td><input type="text" inputMode="decimal" value={x.premium} className={s.num} aria-label={`${x.label} extra price`}
                    onChange={(e) => setSlot(i, { premium: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="st-csub" style={{ margin: 0 }}>Print sizes scale the logo area in the 3D preview. Spot positions on the model are set in code.</p>
        </fieldset>

        <div className={s.actions}>
          <button className="st-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add product' : 'Save product'}</button>
          <button className="st-btn-ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
