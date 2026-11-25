'use client';
// Print area of one logo spot, drawn to scale with edge and corner handles.
// The box stays centred, so an edge handle grows both sides (width follows
// twice the pointer travel). Handle behaviour follows the microinteractions
// resize-handle study (https://microinteractions.dev/markdown/resize-handle.md):
// 1:1 tracking after a small travel threshold, pointer capture, Escape puts
// it back, arrow keys step 1 mm (10 mm with Shift).
import { useRef, useState } from 'react';
import s from './MerchAreaSizer.module.css';

const MM_MIN = 10; // CATALOG_LIMITS.mmMin in lib/merch.mjs
const MM_MAX = 2000; // CATALOG_LIMITS.mmMax
const SNAP_MM = 5; // drag snaps to 5 mm; hold Alt for 1 mm
const START_PX = { mouse: 2, touch: 10, pen: 2 };
const FILL = 0.72; // share of the pad the larger side fills at rest
const MIN_VIEW_MM = 60; // a tiny area still reads as small, not huge

const clampMm = (v) => Math.min(MM_MAX, Math.max(MM_MIN, Math.round(v)));

export default function MerchAreaSizer({ widthMm, heightMm, onChange, onCommit, label }) {
  const padRef = useRef(null);
  const drag = useRef(null);
  const [live, setLive] = useState(null); // { w, h, scale } while dragging
  const w = live ? live.w : Number(widthMm) || MM_MIN;
  const h = live ? live.h : Number(heightMm) || MM_MIN;
  const padSize = () => {
    const r = padRef.current?.getBoundingClientRect();
    return r ? Math.min(r.width, r.height) : 240;
  };
  // Scale is frozen for the whole drag, so the box tracks the pointer 1:1.
  const restScale = (padSize() * FILL) / Math.max(w, h, MIN_VIEW_MM);
  const scale = live ? live.scale : restScale;

  function down(e, axis) {
    if (e.button !== 0 || drag.current || e.ctrlKey) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { axis, x: e.clientX, y: e.clientY, w, h, scale: restScale, started: false, type: e.pointerType };
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.started) {
      if (Math.hypot(dx, dy) < (START_PX[d.type] ?? 2)) return;
      d.started = true;
      d.x = e.clientX; d.y = e.clientY; // measure from where the drag began
      setLive({ w: d.w, h: d.h, scale: d.scale });
      return;
    }
    const step = e.altKey ? 1 : SNAP_MM;
    const snap = (v) => clampMm(Math.round(v / step) * step);
    let nw = d.axis === 's' ? d.w : snap(d.w + (2 * dx) / d.scale);
    let nh = d.axis === 'e' ? d.h : snap(d.h + (2 * dy) / d.scale);
    // Shift on the corner keeps the shape.
    if (d.axis === 'se' && e.shiftKey) nh = clampMm((nw * d.h) / d.w);
    if (nw !== d.lw || nh !== d.lh) {
      d.lw = nw; d.lh = nh;
      setLive({ w: nw, h: nh, scale: d.scale });
      onChange(nw, nh);
    }
  }
  function end(commit) {
    const d = drag.current;
    drag.current = null;
    setLive(null);
    if (!d?.started) return;
    if (commit) onCommit?.();
    else onChange(d.w, d.h);
  }
  function key(e, axis) {
    const steps = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    let dv = steps[e.key];
    if (e.key === 'Home') dv = -Infinity;
    if (e.key === 'End') dv = Infinity;
    if (dv === undefined) return;
    e.preventDefault();
    const by = Number.isFinite(dv) ? dv * (e.shiftKey ? 10 : 1) : dv;
    const next = (v) => clampMm(Number.isFinite(by) ? v + by : by > 0 ? MM_MAX : MM_MIN);
    onChange(axis === 's' ? w : next(w), axis === 'e' ? h : next(h));
    onCommit?.();
  }
  const handle = (axis, name, value) => ({
    role: 'slider',
    tabIndex: 0,
    'aria-label': `${label} print ${name}`,
    'aria-valuemin': MM_MIN,
    'aria-valuemax': MM_MAX,
    'aria-valuenow': value,
    'aria-valuetext': `${value} millimetres`,
    'data-axis': axis,
    onPointerDown: (e) => down(e, axis),
    onPointerMove: move,
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    onLostPointerCapture: () => { if (drag.current) end(true); },
    onKeyDown: (e) => {
      if (e.key === 'Escape' && drag.current) { e.preventDefault(); end(false); return; }
      key(e, axis);
    },
  });

  // 10 mm grid that scales with the box, every 50 mm a stronger line.
  const grid = Math.max(4, 10 * scale);
  return (
    <div className={s.pad} ref={padRef} style={{ '--grid': `${grid}px` }} data-dragging={live ? 'true' : undefined}>
      <div className={s.box} style={{ width: `${w * scale}px`, height: `${h * scale}px` }}>
        <span className={s.dims} aria-hidden="true">{w} × {h} mm</span>
        <span className={`${s.handle} ${s.e}`} {...handle('e', 'width', w)}><span className={s.grip} /></span>
        <span className={`${s.handle} ${s.s}`} {...handle('s', 'height', h)}><span className={s.grip} /></span>
        <span className={`${s.handle} ${s.se}`} {...handle('se', 'width', w)} aria-label={`${label} print width and height`}><span className={s.knob} /></span>
      </div>
    </div>
  );
}
