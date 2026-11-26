'use client';
// Studio > Admin > Merch catalog > one product, on its own page. Logo spots
// are edited on the same 3D view the store uses: pick a spot in the list or
// on the model, drag it over the surface, resize its print area on the
// sizer, drop new spots with a click. Product details live in a second tab.
// Every save is checked by the API with the store's own rules
// (parseMerchProduct), so prices and orders always follow what is saved.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useNotify } from './Toaster';
import { studio } from '../lib/studio';
import {
  MERCH_CATEGORIES, MERCH_PRODUCTS, MERCH_STATUSES, RIDER_MODELS, SLOT_SIZES_PROVISIONAL,
  isHorseProduct, newMerchProductDraft, parseMerchProduct, previewMerchProduct, setMerchCatalog,
} from '../lib/merch.mjs';
import MerchAreaSizer from './MerchAreaSizer';
import formRow from './FormRow.module.css';
import stage from './MerchClient.module.css';
import s from './MerchProductEditor.module.css';

const Merch3D = dynamic(() => import('./Merch3D'), { ssr: false, loading: () => <p className={s.loading}>Loading 3D preview…</p> });

const CATEGORIES = MERCH_CATEGORIES.filter((c) => c.id !== 'all');
const STATUS_LABEL = { active: 'In store', hidden: 'Hidden' };
const MODEL_LABEL = Object.fromEntries(MERCH_PRODUCTS.map((p) => [p.id, p.label]));
const SAMPLE_LOGO = 'club:demo-club';
const MAX_SLOTS = 16; // CATALOG_LIMITS.slots in lib/merch.mjs
const NEW_SLOT_MM = 80;
const HISTORY_MAX = 80;
const TYPE_PAUSE_MS = 1000; // typing in one field within this = one undo step
// Common print sizes, for a quick start before Paladin's real ones land.
const PRESETS = [
  { label: 'Badge', w: 50, h: 50 },
  { label: 'Chest', w: 100, h: 100 },
  { label: 'Sleeve', w: 80, h: 100 },
  { label: 'Banner', w: 250, h: 80 },
  { label: 'Back', w: 300, h: 350 },
];
const PLACE_LABEL = { custom: 'Moved', default: 'Default', none: 'Not placed' };

const toDollars = (cents) => String(Number(cents) / 100);
const toCents = (v) => Math.round(Number(String(v).replace(/[^0-9.]/g, '')) * 100);
// Spots the 3D model has a code position for.
const defaultSlotIds = (model) => new Set((newMerchProductDraft('x-preview', model)?.slotList || []).map((x) => x.id));

// Form state keeps prices as typed dollars; the API gets whole cents.
function toForm(data) {
  return {
    ...data,
    badge: data.badge || '',
    modelFile: data.modelFile || '',
    base: toDollars(data.baseCents),
    sizesText: data.sizes.join(', '),
    colorList: data.colorList.map((c) => ({ ...c })),
    slotList: data.slotList.map((x) => ({ ...x, premium: toDollars(x.premiumCents) })),
  };
}

function toBody(f) {
  return {
    label: f.label, category: f.category, badge: f.badge, blurb: f.blurb, status: f.status, modelFile: f.modelFile || null,
    sort: Number(f.sort), baseCents: toCents(f.base),
    colorList: f.colorList.map(({ hex, name }) => ({ hex, name })),
    sizes: f.sizesText.split(',').map((z) => z.trim()).filter(Boolean),
    slotList: f.slotList.map(({ id, label, widthMm, heightMm, premium, active, place }) => ({
      id, label, active, widthMm: Number(widthMm), heightMm: Number(heightMm), premiumCents: toCents(premium),
      ...(place ? { place } : {}),
    })),
  };
}

// Form state with undo/redo. `key` groups edits into one step: the same
// field typed in quick succession, or every frame of one drag.
function useHistory(initial) {
  const [state, setState] = useState({ now: initial, past: [], future: [] });
  const last = useRef({ key: null, at: 0 });
  const update = useCallback((fn, key = null) => {
    setState((st) => {
      const next = fn(st.now);
      if (next === st.now) return st;
      const t = Date.now();
      const l = last.current;
      const merge = key && key === l.key && (key.startsWith('drag:') || t - l.at < TYPE_PAUSE_MS);
      last.current = { key, at: t };
      return { now: next, past: merge ? st.past : [...st.past, st.now].slice(-HISTORY_MAX), future: [] };
    });
  }, []);
  const endGroup = useCallback(() => { last.current = { key: null, at: 0 }; }, []);
  const undo = useCallback(() => {
    last.current = { key: null, at: 0 };
    setState((st) => (st.past.length ? { now: st.past[st.past.length - 1], past: st.past.slice(0, -1), future: [st.now, ...st.future] } : st));
  }, []);
  const redo = useCallback(() => {
    last.current = { key: null, at: 0 };
    setState((st) => (st.future.length ? { now: st.future[0], past: [...st.past, st.now], future: st.future.slice(1) } : st));
  }, []);
  const reset = useCallback((v) => { last.current = { key: null, at: 0 }; setState({ now: v, past: [], future: [] }); }, []);
  return { f: state.now, update, endGroup, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

export default function MerchProductEditor({ id, isNew = false, newModel = '', newName = '' }) {
  const notify = useNotify();
  const router = useRouter();
  const [loaded, setLoaded] = useState(null); // { data } of the saved row (or the draft)
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    studio.get('/api/merch/catalog').then((rows) => {
      if (!live) return;
      setMerchCatalog(rows || []);
      const row = (rows || []).find((r) => r.id === id);
      if (isNew) {
        if (row) return setError('A product with this id already exists.');
        const draft = newMerchProductDraft(id, newModel);
        if (!draft || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) return setError('Unknown 3D model or product id.');
        setLoaded({ data: newName.trim().length >= 2 ? { ...draft, label: newName.trim().slice(0, 60) } : draft });
      } else if (row) setLoaded({ data: row.data });
      else setError('Product not found.');
    }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [id, isNew, newModel, newName]);

  if (error) {
    return (
      <div className="st-card">
        <p>{error}</p>
        <Link className="st-btn-ghost" href="/studio/admin?section=catalog">Back to the catalog</Link>
      </div>
    );
  }
  if (!loaded) return <p className="empty-note">Loading…</p>;
  return <Editor key={id} id={id} isNew={isNew} saved={loaded.data} notify={notify} router={router}
    onSaved={(data) => setLoaded({ data })} />;
}

function Editor({ id, isNew, saved, notify, router, onSaved }) {
  const model = saved.model || id;
  const horse = isHorseProduct(model);
  const spaces = horse && model !== 'ear-bonnet' ? ['product', 'horse'] : ['product'];
  const defaults = useMemo(() => defaultSlotIds(model), [model]);
  const savedForm = useMemo(() => toForm(saved), [saved]);
  const { f, update, endGroup, undo, redo, reset, canUndo, canRedo } = useHistory(savedForm);
  const [tab, setTab] = useState('spots');
  const [selected, setSelected] = useState(() => saved.slotList.find((x) => x.active)?.id || null);
  const [placing, setPlacing] = useState(null);
  const [sample, setSample] = useState(true);
  const [previewColor, setPreviewColor] = useState(saved.colorList[0]?.hex || '#101418');
  const [busy, setBusy] = useState(false);
  const stageRef = useRef(null);
  const barRef = useRef(null);
  // Open on the editor itself: the bar under the site header, the workspace
  // filling the rest of the window (wide screens only; phones scroll).
  useEffect(() => {
    if (window.matchMedia('(min-width: 1101px)').matches) barRef.current?.scrollIntoView({ block: 'start' });
  }, []);
  const dirty = JSON.stringify(toBody(f)) !== JSON.stringify(toBody(savedForm));

  const set = (patch, key) => update((cur) => ({ ...cur, ...patch }), key);
  const setSlot = (slotId, patch, key) => update((cur) => ({
    ...cur, slotList: cur.slotList.map((x) => (x.id === slotId ? { ...x, ...patch } : x)),
  }), key);
  const setColor = (i, patch, key) => update((cur) => ({ ...cur, colorList: cur.colorList.map((c, j) => (j === i ? { ...c, ...patch } : c)) }), key);

  // Live 3D preview of the unsaved form. A new spot not placed yet has
  // nowhere to draw and is left out; anything else invalid keeps the last view.
  useEffect(() => {
    const body = toBody(f);
    body.slotList = body.slotList.filter((x) => x.place || defaults.has(x.id));
    const { product } = parseMerchProduct({ ...body, id, model }, { draft: true });
    if (product) previewMerchProduct(product);
  }, [f, id, model, defaults]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = isNew
        ? await studio.post('/admin/merch/catalog', { ...toBody(f), id, model })
        : await studio.put(`/admin/merch/catalog/${encodeURIComponent(id)}`, toBody(f));
      setMerchCatalog(data);
      const row = data.find((r) => r.id === id);
      notify(isNew ? `${f.label} added (hidden until you set it to In store)` : `${f.label} saved`);
      if (isNew) { router.replace(`/studio/admin/merch/${encodeURIComponent(id)}`); return; }
      reset(toForm(row.data));
      onSaved(row.data);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;

  // Keyboard: Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z (or Ctrl+Y) redo, Cmd/Ctrl+S
  // save, Escape cancels placing. Text fields keep their own undo.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && document.activeElement?.type !== 'checkbox';
      if (e.key === 'Escape' && placing) { setPlacing(null); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current(); return; }
      if (!mod || typing) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, undo, redo]);
  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const onLeave = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const sel = f.slotList.find((x) => x.id === selected) || null;
  const placingSlot = f.slotList.find((x) => x.id === placing) || null;
  const isPlaced = (x) => Boolean(x.place?.product) || defaults.has(x.id);

  function place(pose, space) {
    if (!placing) return;
    setSlot(placing, { place: { ...(placingSlot?.place || {}), [space]: pose } });
    setSelected(placing);
    setPlacing(null);
  }
  // A drag on the model: every frame updates the pose, the first frame opens
  // one undo step; a cancelled drag goes back to where it started.
  const dragStart = useRef(null);
  function moveSlot(pos, pose, space, done) {
    if (!done) {
      if (!dragStart.current) dragStart.current = f;
      setSlot(pos, { place: { ...(f.slotList.find((x) => x.id === pos)?.place || {}), [space]: pose } }, `drag:${pos}`);
      return;
    }
    if (!pose && dragStart.current) update(() => dragStart.current, `drag:${pos}`);
    dragStart.current = null;
    endGroup();
  }
  function resetPlace(slotId, space) {
    const x = f.slotList.find((y) => y.id === slotId);
    const { [space]: _drop, ...rest } = x.place || {};
    setSlot(slotId, { place: Object.keys(rest).length ? rest : undefined });
  }
  function addSlot() {
    let n = f.slotList.length + 1;
    while (f.slotList.some((x) => x.id === `spot-${n}`)) n += 1;
    const slotId = `spot-${n}`;
    update((cur) => ({ ...cur, slotList: [...cur.slotList, { id: slotId, label: `Spot ${n}`, widthMm: NEW_SLOT_MM, heightMm: NEW_SLOT_MM, premium: '0', active: true, isNew: true }] }));
    setSelected(slotId);
    setPlacing(slotId);
    setTab('spots');
  }
  function removeSlot(slotId) {
    update((cur) => ({ ...cur, slotList: cur.slotList.filter((x) => x.id !== slotId) }));
    if (placing === slotId) setPlacing(null);
    setSelected(f.slotList.find((x) => x.id !== slotId && x.active)?.id || null);
  }

  const sampleSlots = sample ? Object.fromEntries(f.slotList.filter((x) => x.active && isPlaced(x)).map((x) => [x.id, SAMPLE_LOGO])) : {};
  const unplaced = f.slotList.filter((x) => x.active && !isPlaced(x));
  const missingHorse = spaces.includes('horse') ? f.slotList.filter((x) => x.active && !defaults.has(x.id) && x.place?.product && !x.place?.horse) : [];
  const colorOk = f.colorList.some((c) => c.hex === previewColor);
  // custom = moved by an admin, default = code position, none = not on the model.
  const placeState = (x) => (spaces.some((sp) => x.place?.[sp]) ? 'custom' : isPlaced(x) ? 'default' : 'none');

  return (
    <div className={s.page}>
      <header className={s.head}>
        <Link href="/studio/admin?section=catalog" className={s.back}>← Merch catalog</Link>
        <div className={s.bar} ref={barRef} data-dirty={dirty || isNew ? 'true' : undefined}>
          <div className={s.barRow}>
          <div className={s.titleBlock}>
            <div className={s.titleRow}>
              <h2 className={s.title}>{f.label || id}</h2>
              <span className={s.pill} data-status={f.status}>{STATUS_LABEL[f.status]}</span>
            </div>
            <p className={s.sub}>3D model: {MODEL_LABEL[model]} · id <code>{id}</code></p>
          </div>
          <div className={s.saveCluster} role="region" aria-label="Save changes">
            <span className={s.saveState} aria-live="polite">
              {dirty || isNew ? <><span className={s.dot} aria-hidden="true" />{isNew ? 'Not added yet' : 'Unsaved changes'}</> : 'All changes saved'}
            </span>
            <button type="button" className="st-btn-ghost" disabled={!dirty || busy} onClick={() => { reset(savedForm); setPlacing(null); }}>Discard</button>
            <button type="button" className="st-btn" disabled={(!dirty && !isNew) || busy} onClick={save}>
              {busy ? 'Saving…' : isNew ? 'Add product' : 'Save'} <kbd className={s.kbd}>⌘S</kbd>
            </button>
          </div>
          </div>
          <div className={s.tabs} role="tablist" aria-label="Product editor">
            {[['spots', `Logo spots (${f.slotList.filter((x) => x.active).length})`], ['details', 'Product details']].map(([key, label]) => (
              <button key={key} type="button" role="tab" id={`tab-${key}`} aria-controls={`panel-${key}`} aria-selected={tab === key}
                className={s.tab} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>
        </div>
      </header>

      <section id="panel-spots" role="tabpanel" aria-labelledby="tab-spots" hidden={tab !== 'spots'} className={s.workspace}>
        <div className={`${stage.stage}${horse ? ` ${stage.stageDark}` : ''} ${s.stage}`} ref={stageRef} data-placing={placing ? 'true' : undefined}>
          <Merch3D productId={id} color={colorOk ? previewColor : f.colorList[0]?.hex || '#101418'} slots={sampleSlots} zoom={{}} shift={{}}
            onShift={() => {}} selectedPos={selected} onSelectPos={(pos) => { setSelected(pos); setTab('spots'); }} switching={false} stageRef={stageRef}
            hotspots onPlace={placing ? place : undefined} onMoveSlot={placing ? undefined : moveSlot} clean={false}
            onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} />
          {placingSlot ? (
            <div className={s.banner} role="status">
              <span className={s.bannerIcon} aria-hidden="true">⌖</span>
              <span>Click the model to place <strong>{placingSlot.label}</strong>{spaces.length > 1 ? ' (alone, or with Show horse on)' : ''}</span>
              <button type="button" className={s.bannerBtn} onClick={() => setPlacing(null)}>Cancel <kbd>Esc</kbd></button>
            </div>
          ) : (
            <div className={s.stageTools}>
              <div className={s.swatches} role="radiogroup" aria-label="Preview colour">
                {f.colorList.filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex)).map((c) => (
                  <button key={c.hex} type="button" role="radio" aria-checked={(colorOk ? previewColor : f.colorList[0]?.hex) === c.hex}
                    aria-label={`Preview in ${c.name || c.hex}`} title={c.name || c.hex} className={s.swatch}
                    style={{ '--sw': c.hex }} onClick={() => setPreviewColor(c.hex)} />
                ))}
              </div>
              <span className={s.toolSep} aria-hidden="true" />
              <label className={s.switchLabel}>
                <input type="checkbox" role="switch" checked={sample} onChange={(e) => setSample(e.target.checked)} className={s.switch} />
                Sample logos
              </label>
            </div>
          )}
        </div>

        <aside className={s.inspector} aria-label="Logo spots">
          <div className={s.panel}>
            <div className={s.panelHead}>
              <div>
                <h3 className={s.panelTitle}>Logo spots</h3>
                <p className={s.panelSub}>Drag a spot on the model to move it.</p>
              </div>
              <button type="button" className={s.addBtn} onClick={addSlot} disabled={f.slotList.length >= MAX_SLOTS}>
                <span aria-hidden="true">+</span> Add spot
              </button>
            </div>
            {(unplaced.length > 0 || missingHorse.length > 0) && (
              <p className={s.warn} role="note">
                {unplaced.length > 0 && <>Not on the model yet: {unplaced.map((x) => x.label).join(', ')}. </>}
                {missingHorse.length > 0 && <>Place on the horse too: {missingHorse.map((x) => x.label).join(', ')}.</>}
              </p>
            )}
            <ul className={s.spotList}>
              {f.slotList.map((x, i) => {
                const st = placeState(x);
                return (
                  <li key={x.id} className={s.spot} data-selected={selected === x.id ? 'true' : undefined} data-off={x.active ? undefined : 'true'}>
                    <button type="button" className={s.spotMain} aria-pressed={selected === x.id} onClick={() => setSelected(x.id)}>
                      <span className={s.num} aria-hidden="true">{i + 1}</span>
                      <span className={s.spotText}>
                        <span className={s.spotName}>{x.label || x.id}</span>
                        <span className={s.spotMeta}>
                          {x.widthMm} × {x.heightMm} mm{Number(x.premium) > 0 ? ` · +NZ$${x.premium}` : ''}
                        </span>
                      </span>
                      <span className={s.badge} data-state={st}>{PLACE_LABEL[st]}</span>
                    </button>
                    <input type="checkbox" role="switch" className={s.switch} checked={x.active}
                      aria-label={`${x.label} in the store`} onChange={(e) => setSlot(x.id, { active: e.target.checked })} />
                  </li>
                );
              })}
            </ul>
          </div>

          {sel && (
            <div className={s.panel} key={sel.id}>
              <div className={s.panelHead}>
                <h3 className={s.panelTitle}>
                  <span className={s.numLg} aria-hidden="true">{f.slotList.indexOf(sel) + 1}</span>
                  <span className={s.ellipsis}>{sel.label || sel.id}</span>
                </h3>
                {sel.isNew && <button type="button" className={s.textDanger} onClick={() => removeSlot(sel.id)}>Remove</button>}
              </div>

              <label className={s.field}><span className={s.label}>Name buyers see</span>
                <input value={sel.label} maxLength={30} onChange={(e) => setSlot(sel.id, { label: e.target.value }, `label:${sel.id}`)} />
              </label>

              <div className={s.block}>
                <div className={s.blockHead}>
                  <span className={s.label}>Print area</span>
                  {SLOT_SIZES_PROVISIONAL && <span className={s.tag} title="Until the real print sizes are confirmed">Provisional</span>}
                </div>
                <MerchAreaSizer label={sel.label} widthMm={sel.widthMm} heightMm={sel.heightMm}
                  onChange={(w, h) => setSlot(sel.id, { widthMm: w, heightMm: h }, `drag:size:${sel.id}`)} onCommit={endGroup} />
                <div className={s.mmRow}>
                  <label className={s.mm}><span>Width</span>
                    <input type="number" inputMode="numeric" min={10} max={2000} value={sel.widthMm}
                      onChange={(e) => setSlot(sel.id, { widthMm: e.target.value }, `w:${sel.id}`)} /><em>mm</em></label>
                  <label className={s.mm}><span>Height</span>
                    <input type="number" inputMode="numeric" min={10} max={2000} value={sel.heightMm}
                      onChange={(e) => setSlot(sel.id, { heightMm: e.target.value }, `h:${sel.id}`)} /><em>mm</em></label>
                </div>
                <div className={s.presets} role="group" aria-label="Common print sizes">
                  {PRESETS.map((p) => (
                    <button key={p.label} type="button" className={s.preset}
                      aria-pressed={Number(sel.widthMm) === p.w && Number(sel.heightMm) === p.h}
                      onClick={() => setSlot(sel.id, { widthMm: p.w, heightMm: p.h })}>
                      <span className={s.presetName}>{p.label}</span>
                      <span className={s.presetDims}>{p.w}×{p.h}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={s.block}>
                <span className={s.label}>Position</span>
                <ul className={s.places}>
                  {spaces.map((sp) => {
                    const st = sel.place?.[sp] ? 'custom' : defaults.has(sel.id) ? 'default' : 'none';
                    return (
                      <li key={sp} className={s.placeRow}>
                        <span className={s.placeName}>{spaces.length > 1 ? (sp === 'horse' ? 'On the horse' : 'Item alone') : 'On the model'}</span>
                        <span className={s.badge} data-state={st}>{PLACE_LABEL[st]}</span>
                        {sel.place?.[sp] ? (
                          <button type="button" className={s.ghostSm} onClick={() => resetPlace(sel.id, sp)}>
                            {defaults.has(sel.id) ? 'Reset' : 'Clear'}
                          </button>
                        ) : <span className={s.ghostSpacer} aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className={s.placeBtn} aria-pressed={placing === sel.id}
                  onClick={() => setPlacing(placing === sel.id ? null : sel.id)}>
                  <span aria-hidden="true">⌖</span>
                  {placing === sel.id ? 'Cancel placing' : 'Place by clicking the model'}
                </button>
              </div>

              <label className={s.field}><span className={s.label}>Extra price</span>
                <span className={s.money}><em aria-hidden="true">NZ$</em>
                  <input type="text" inputMode="decimal" value={sel.premium} aria-label="Extra price in NZ$"
                    onChange={(e) => setSlot(sel.id, { premium: e.target.value }, `premium:${sel.id}`)} /></span>
              </label>
              {!sel.isNew && !defaults.has(sel.id) && (
                <p className={s.note}>Saved spots stay on old orders: switch it off instead of deleting.</p>
              )}
            </div>
          )}
        </aside>
      </section>

      <section id="panel-details" role="tabpanel" aria-labelledby="tab-details" hidden={tab !== 'details'} className={`st-card ${s.details}`}>
        <div className="st-form">
          <div className={`st-form-row ${formRow.row3}`}>
            <label><span>Name</span><input value={f.label} maxLength={60} required onChange={(e) => set({ label: e.target.value }, 'label')} /></label>
            <label><span>Base price (NZ$, incl. GST)</span>
              <input type="text" inputMode="decimal" value={f.base} required onChange={(e) => set({ base: e.target.value }, 'base')} /></label>
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
            <label><span>Badge (optional)</span><input value={f.badge} maxLength={20} placeholder="e.g. Bestseller" onChange={(e) => set({ badge: e.target.value }, 'badge')} /></label>
            <label><span>Sort order (0 first)</span>
              <input type="number" min={0} max={999} value={f.sort} onChange={(e) => set({ sort: e.target.value }, 'sort')} /></label>
          </div>
          <label><span>Description</span><input value={f.blurb} maxLength={160} onChange={(e) => set({ blurb: e.target.value }, 'blurb')} /></label>
          {RIDER_MODELS[model] && (
            <label><span>Own 3D file (optional, any shirt-shaped GLB)</span>
              <input value={f.modelFile} placeholder="/models/rider/club-hoodie.glb" onChange={(e) => set({ modelFile: e.target.value }, 'modelFile')} /></label>
          )}
          <fieldset className={s.group}>
            <legend>Colours</legend>
            {f.colorList.map((c, i) => (
              <div key={i} className={s.colorRow}>
                <input type="color" className={s.colorPick} value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#000000'}
                  aria-label={`Colour ${i + 1}`} onChange={(e) => setColor(i, { hex: e.target.value }, `hex:${i}`)} />
                <input value={c.hex} maxLength={7} aria-label={`Colour ${i + 1} hex`} className={s.hex}
                  onChange={(e) => setColor(i, { hex: e.target.value.trim() }, `hex:${i}`)} />
                <input value={c.name} maxLength={30} placeholder="Name, e.g. Navy" aria-label={`Colour ${i + 1} name`}
                  onChange={(e) => setColor(i, { name: e.target.value }, `cname:${i}`)} />
                <button type="button" className="st-btn-ghost" disabled={f.colorList.length < 2}
                  onClick={() => set({ colorList: f.colorList.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            {f.colorList.length < 12 && (
              <div><button type="button" className="st-btn-ghost"
                onClick={() => set({ colorList: [...f.colorList, { hex: '#808080', name: '' }] })}>Add colour</button></div>
            )}
          </fieldset>
          <label><span>Sizes (comma separated, in display order)</span>
            <input value={f.sizesText} onChange={(e) => set({ sizesText: e.target.value }, 'sizes')} /></label>
        </div>
      </section>

    </div>
  );
}
