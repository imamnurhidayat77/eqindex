'use client';
import { useEffect, useRef, useState } from 'react';
import s from './HoldConfirmButton.module.css';

// Hold to confirm, after https://microinteractions.dev/markdown/hold-confirm.md
// The fill is linear because its position stands for elapsed time.
// One constant drives both the timer and the CSS fill so they cannot drift.
export const HOLD_MS = 1200;
const HOLD_KEYS = [' ', 'Enter'];

export default function HoldConfirmButton({ label, holdingLabel = 'Keep holding…', disabled = false, onConfirm, className = '' }) {
  const [state, setState] = useState('idle'); // idle | holding | confirmed
  const timer = useRef(null);
  const key = useRef(null);

  const cancel = () => {
    clearTimeout(timer.current);
    key.current = null;
    setState((v) => (v === 'holding' ? 'idle' : v));
  };
  const start = () => {
    if (disabled || state !== 'idle') return;
    setState('holding');
    timer.current = setTimeout(() => { setState('confirmed'); onConfirm?.(); }, HOLD_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (state !== 'holding') return undefined;
    const onHide = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', onHide); };
  }, [state]);

  return (
    <button
      type="button"
      className={`${s.hold} ${className}`}
      data-state={state}
      disabled={disabled}
      style={{ '--hold-duration': `${HOLD_MS}ms` }}
      aria-describedby="hold-confirm-hint"
      onPointerDown={(e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      // Fires after both pointerup and pointercancel (a scroll that began on the button).
      onLostPointerCapture={cancel}
      onKeyDown={(e) => {
        if (!HOLD_KEYS.includes(e.key)) return;
        e.preventDefault();
        if (e.repeat || key.current) return;
        key.current = e.key;
        start();
      }}
      onKeyUp={(e) => {
        if (e.key === ' ') e.preventDefault();
        if (e.key === key.current) cancel();
      }}
      // Assistive tech can "click" with no sustained press (detail 0): the
      // surrounding dialog already asked, so that click confirms directly.
      onClick={(e) => { if (e.detail === 0 && !key.current && state === 'idle' && !disabled) { setState('confirmed'); onConfirm?.(); } }}
    >
      <span className={s.fill} data-hold-progress aria-hidden="true" />
      <span className={s.labels}>
        <span className={s.idle}>{label}</span>
        <span className={s.waiting} aria-hidden="true">{state === 'confirmed' ? '✓ Done' : holdingLabel}</span>
      </span>
      <span id="hold-confirm-hint" hidden>Press and hold for {HOLD_MS / 1000} seconds to confirm. Release to cancel.</span>
      <span className={s.live} role="status">{state === 'confirmed' ? 'Confirmed' : ''}</span>
    </button>
  );
}
