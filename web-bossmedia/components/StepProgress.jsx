'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import s from './StepProgress.module.css';

// Step labels with one underline that slides to the current step, after
// https://microinteractions.dev/markdown/tab-indicator.md (250ms ease-out-quint).
// The line is placed with one transform so a change mid-move retargets smoothly.
export default function StepProgress({ steps, current, label }) {
  const listRef = useRef(null);
  const [line, setLine] = useState(null); // { x, w } in list-local px
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const place = () => {
      const el = list.children[current];
      if (!el) return;
      const lr = list.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setLine({ x: r.left - lr.left + list.scrollLeft, w: r.width });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(list);
    return () => ro.disconnect();
  }, [current]);
  // First placement paints without a transition, later ones animate.
  useLayoutEffect(() => { if (line && !ready) requestAnimationFrame(() => setReady(true)); }, [line, ready]);

  return (
    <div className={`booking-progress ${s.list}`} ref={listRef} aria-label={label} data-ready={ready || undefined}>
      {steps.map((text, i) => (
        <span key={text} className={i === current ? 'active' : ''} aria-current={i === current ? 'step' : undefined}>{text}</span>
      ))}
      {line && <i className={s.line} aria-hidden="true" style={{ transform: `translateX(${line.x}px) scaleX(${line.w})` }} />}
    </div>
  );
}
