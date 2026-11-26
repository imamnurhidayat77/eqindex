'use client';
// A merch order's design on the same 3D view as the designer (view only),
// shared by the buyer's order page and the admin order page. Own artwork
// (mlogo:) loads through the order's own logo route: the email link token
// when there is one, else the session (owner or admin). Picking a placement
// in the list turns the model to face it.
import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { API } from '../lib/api';
import { isHorseProduct, merchPositions } from '../lib/merch.mjs';
import stage from './MerchClient.module.css';
import s from './MerchOrderDesign.module.css';

const Merch3D = dynamic(() => import('./Merch3D'), { ssr: false, loading: () => <p className={s.loading}>Loading 3D preview…</p> });
const fallbackName = (v) => (String(v).startsWith('club:') ? 'Club logo' : String(v).startsWith('mlogo:') ? 'Uploaded logo'
  : String(v).startsWith('my:') ? 'Saved logo' : 'Sponsor logo');

export default function MerchOrderDesign({ order, token = '', title = 'Your design', hint = 'Drag to turn · the proof is final', extra = null }) {
  const stageRef = useRef(null);
  const design = order.design || {};
  const placed = merchPositions(order.productId).filter((p) => design.slots?.[p.id]);
  // Start on the first placement: Merch3D only turns to a slot when the
  // selection changes from one slot to another.
  const [selected, setSelected] = useState(() => placed[0]?.id || null);
  const slots = useMemo(() => {
    const out = {};
    for (const [pos, v] of Object.entries(design.slots || {})) {
      const id = String(v);
      out[pos] = id.startsWith('mlogo:')
        ? `upload:${API}/api/merch/orders/${encodeURIComponent(order.ref)}/logos/${id.slice(6)}${token ? `?t=${encodeURIComponent(token)}` : ''}`
        : id;
    }
    return out;
  }, [design.slots, order.ref, token]);
  const zoom = useMemo(() => Object.fromEntries(Object.entries(design.slotZoom || {}).map(([k, v]) => [k, Number(v) / 100])), [design.slotZoom]);
  // Logo names as quoted at order time ("Left chest: Pak'nSave").
  const names = useMemo(() => Object.fromEntries((order.quote?.item?.lines || [])
    .filter((l) => l.slot && ['sponsor', 'club', 'upload'].includes(l.kind))
    .map((l) => [l.slot, String(l.label).split(': ').slice(1).join(': ').replace(/ \(.*\)$|, no discount$/, '')])), [order.quote]);
  return (
    <section className={s.card} aria-label={title}>
      <div className={s.head}>
        <h2 className={s.title}>{title}</h2>
        <span className={s.hint}>{hint}</span>
      </div>
      <div className={`${stage.stage}${isHorseProduct(order.productId) ? ` ${stage.stageDark}` : ''} ${s.stage}`} ref={stageRef}>
        <Merch3D productId={order.productId} color={order.color} slots={slots} zoom={zoom} shift={design.slotShift || {}}
          selectedPos={selected} switching={false} stageRef={stageRef} clean={false} />
      </div>
      {placed.length > 0 && (
        <ul className={s.placements} aria-label="Logo placements">
          {placed.map((p, i) => (
            <li key={p.id}>
              <button type="button" className={s.placement} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}>
                <span className={s.num} aria-hidden="true">{i + 1}</span>
                <span className={s.text}>
                  <strong>{p.label}</strong>
                  <small>{names[p.id] || fallbackName(design.slots[p.id])}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {extra}
    </section>
  );
}
