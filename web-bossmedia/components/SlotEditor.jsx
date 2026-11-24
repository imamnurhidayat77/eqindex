'use client';
import { useEffect, useRef, useState } from 'react';
import { LOGO_ZOOM_MIN, clampLogoOffset, clampShift, clampSpin, fitLogoInSlot } from '../lib/merch.mjs';
import SmartImage from './SmartImage';
import s from './SlotEditor.module.css';

// Snap to the centre lines with hysteresis (fractions of the slot size):
// enter within 3%, release only past 6%, so the logo never "sticks then jumps".
const SNAP_IN = 0.03;
const SNAP_OUT = 0.06;
const ROTATE_STEP = 15;

// Flat editor for one print area, drawn to scale (e.g. 100 × 100 mm). The
// 3D preview mirrors every change. Units: `slot` and the logo offset are in
// percent of garment width (the unit slotShift is stored in), so the editor
// and the 3D drag share one clamp. onPreview fires while a gesture runs (at
// most once per frame), onCommit once when it ends (one undo step).
export default function SlotEditor({ label, slot, mm, logoSrc, aspect, zoom, maxZoom, shift, onPreview, onCommit, onZoom }) {
  const boxRef = useRef(null);
  const gesture = useRef(null);
  const frame = useRef(0);
  const [live, setLive] = useState(null);
  const [snapped, setSnapped] = useState({ x: false, y: false });
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const cur = live || { x: shift.x, y: shift.y, r: shift.r, zoom };
  const { w, h } = fitLogoInSlot({ slotW: slot.w, slotH: slot.h, aspect, zoom: cur.zoom });
  const pct = (v, total) => `${(v / total) * 100}%`;

  const toUnits = (dxPx, dyPx) => {
    const rect = gesture.current.rect;
    return [(dxPx / rect.width) * slot.w, (-dyPx / rect.height) * slot.h];
  };
  const schedule = (next) => {
    if (gesture.current) gesture.current.last = next;
    setLive(next);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => onPreview?.(next));
  };
  const start = (e, kind) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = boxRef.current.getBoundingClientRect();
    gesture.current = { kind, x0: e.clientX, y0: e.clientY, rect, from: { ...cur }, snap: { ...snapped } };
  };
  const move = (e) => {
    const g = gesture.current;
    if (!g) return;
    const from = g.from;
    if (g.kind === 'move') {
      const [dx, dy] = toUnits(e.clientX - g.x0, e.clientY - g.y0);
      const off = clampLogoOffset({ slotW: slot.w, slotH: slot.h, w, h, spinDeg: from.r, x: from.x + dx, y: from.y + dy });
      const snapAxis = (v, size, was) => (Math.abs(v) < (was ? SNAP_OUT : SNAP_IN) * size);
      const sx = snapAxis(off.x, slot.w, g.snap.x);
      const sy = snapAxis(off.y, slot.h, g.snap.y);
      g.snap = { x: sx, y: sy };
      setSnapped(g.snap);
      schedule({ ...from, x: clampShift(sx ? 0 : off.x), y: clampShift(sy ? 0 : off.y) });
    } else if (g.kind === 'size') {
      // Corner distance from the logo centre sets the size, aspect locked.
      const rect = g.rect;
      const cx = rect.left + rect.width / 2 + (from.x / slot.w) * rect.width;
      const cy = rect.top + rect.height / 2 - (from.y / slot.h) * rect.height;
      const d0 = Math.hypot(g.x0 - cx, g.y0 - cy) || 1;
      const d1 = Math.hypot(e.clientX - cx, e.clientY - cy);
      const z = Math.min(maxZoom, Math.max(LOGO_ZOOM_MIN, from.zoom * (d1 / d0)));
      schedule({ ...from, zoom: Math.round(z * 100) / 100 });
    } else if (g.kind === 'rotate') {
      const rect = g.rect;
      const cx = rect.left + rect.width / 2 + (from.x / slot.w) * rect.width;
      const cy = rect.top + rect.height / 2 - (from.y / slot.h) * rect.height;
      // Screen angle grows clockwise; logo spin grows counter-clockwise.
      const a = (Math.atan2(e.clientX - cx, cy - e.clientY) * 180) / Math.PI;
      const raw = clampSpin(-a);
      schedule({ ...from, r: e.shiftKey ? raw : clampSpin(Math.round(raw / ROTATE_STEP) * ROTATE_STEP) });
    }
  };
  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    cancelAnimationFrame(frame.current);
    setSnapped({ x: false, y: false });
    const last = g.last;
    if (last) {
      if (last.zoom !== g.from.zoom) onZoom?.(last.zoom);
      onCommit?.({ x: last.x, y: last.y, r: last.r });
    }
    setLive(null);
  };
  // Arrow keys: 1 mm steps (Shift = 5 mm), [ and ] rotate, + and - size.
  const mmToUnits = slot.w / mm.w;
  const onKey = (e) => {
    const step = (e.shiftKey ? 5 : 1) * mmToUnits;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (d) {
      e.preventDefault();
      const off = clampLogoOffset({ slotW: slot.w, slotH: slot.h, w, h, spinDeg: cur.r, x: cur.x + d[0], y: cur.y + d[1] });
      onCommit?.({ x: clampShift(off.x), y: clampShift(off.y), r: cur.r });
    } else if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      onCommit?.({ x: cur.x, y: cur.y, r: clampSpin(cur.r + (e.key === ']' ? -ROTATE_STEP : ROTATE_STEP)) });
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault();
      onZoom?.(Math.min(maxZoom, Math.max(LOGO_ZOOM_MIN, cur.zoom + (e.key === '-' ? -0.05 : 0.05))));
    }
  };

  // Exact print-area proportions, so percent offsets keep the logo's aspect.
  const ratio = mm.h / mm.w;
  const posX = 50 + (cur.x / slot.w) * 100;
  const posY = 50 - (cur.y / slot.h) * 100;
  return (
    <div className={s.wrap}>
      <div
        ref={boxRef}
        className={s.area}
        style={{ aspectRatio: `${mm.w} / ${mm.h}`, width: `min(100%, ${Math.round(240 / Math.max(1, ratio))}px)` }}
        role="group"
        tabIndex={0}
        aria-label={`${label} print area, ${mm.w} by ${mm.h} mm. Drag the logo, arrow keys move it, [ and ] rotate, + and − resize.`}
        onKeyDown={onKey}
      >
        <span className={`${s.guideV} ${snapped.x ? s.guideOn : ''}`} aria-hidden="true" />
        <span className={`${s.guideH} ${snapped.y ? s.guideOn : ''}`} aria-hidden="true" />
        <div
          className={s.logo}
          style={{
            left: `${posX}%`, top: `${posY}%`, width: pct(w, slot.w), height: pct(h, slot.h),
            transform: `translate(-50%, -50%) rotate(${-cur.r}deg)`,
          }}
        >
          <SmartImage src={logoSrc} alt={`${label} logo`} width={240} height={240} unoptimized priority draggable={false}
            style={{ transform: shift.f ? 'scaleX(-1)' : undefined }}
            onPointerDown={(e) => start(e, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
          <span className={s.handle} data-corner="br" aria-hidden="true"
            onPointerDown={(e) => start(e, 'size')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
          <span className={s.knob} aria-hidden="true"
            onPointerDown={(e) => start(e, 'rotate')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
        </div>
        <span className={s.dims} aria-hidden="true">{mm.w} × {mm.h} mm</span>
      </div>
    </div>
  );
}
