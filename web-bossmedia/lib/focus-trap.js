'use client';
import { useEffect } from 'react';

// Minimal dialog focus trap: Tab cycles inside, Escape closes, focus
// returns to whatever opened the dialog.
export function useFocusTrap(rootRef, { onClose, active = true } = {}) {
  useEffect(() => {
    if (!active || !rootRef.current) return undefined;
    const root = rootRef.current;
    const prev = document.activeElement;
    const focusables = () => [...root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )].filter((el) => !el.disabled && el.offsetParent !== null);
    focusables()[0]?.focus?.();
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, [active, rootRef, onClose]);
}
