'use client';
import { useEffect, useRef } from 'react';

// Shared dropdown dismiss behavior (P1b bell, user menu, …):
// close on outside pointer-down + Escape. Attach the returned ref to the
// wrapper that contains BOTH the toggle button and the popup, so toggling
// doesn't count as "outside".
export function useDismiss(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
}
