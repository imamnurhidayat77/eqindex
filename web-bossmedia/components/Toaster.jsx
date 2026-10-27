'use client';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// One toast system for the whole storefront (shop + studio). Mounted once in
// app/layout.jsx. Two ways to send:
//   const toast = useToast(); toast('Saved', { type: 'success', action: { label, href } })
//   import { toast } from './Toaster'; toast('Saved')  // outside React tree
// Types: success | error | info. Auto-dismiss 4.5s, closable, aria-live.

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

const listeners = new Set();
export function toast(msg, opts = {}) {
  const t = {
    id: Date.now() + Math.random(),
    msg: String(msg),
    type: opts.type || (opts.err ? 'error' : 'success'),
    action: opts.action || null,
  };
  listeners.forEach((fn) => fn(t));
  return t.id;
}

export function ToastProvider({ children }) {
  const push = useCallback((msg, opts) => toast(msg, opts), []);
  return <ToastCtx.Provider value={push}>{children}</ToastCtx.Provider>;
}

// Studio-compatible notify shape notify(msg) / notify(msg, true=error).
export const useNotify = () => {
  const push = useToast();
  return useCallback((msg, err = false) => push(msg, err === true ? { type: 'error' } : err || undefined), [push]);
};

function ToastIcon({ type }) {
  if (type === 'error') {
    return (
      <span className="bm-toast-icon err" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 7v6M12 16.5h.01" /><circle cx="12" cy="12" r="9" /></svg>
      </span>
    );
  }
  if (type === 'info') {
    return (
      <span className="bm-toast-icon info" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 11v5M12 7.5h.01" /><circle cx="12" cy="12" r="9" /></svg>
      </span>
    );
  }
  return (
    <span className="bm-toast-icon ok" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 12.5 5 5L19.5 7" /></svg>
    </span>
  );
}

export function Toaster() {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
  }, []);

  useEffect(() => {
    const push = (t) => {
      setItems((xs) => [...xs.slice(-3), t]);
      timers.current.set(t.id, setTimeout(() => dismiss(t.id), 4500));
    };
    listeners.add(push);
    return () => {
      listeners.delete(push);
      timers.current.forEach((tm) => clearTimeout(tm));
      timers.current.clear();
    };
  }, [dismiss]);

  if (!items.length) return null;
  return (
    <div className="bm-toast-wrap" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`bm-toast ${t.type}`}>
          <ToastIcon type={t.type} />
          <p>{t.msg}</p>
          {t.action && (
            <Link href={t.action.href} onClick={() => dismiss(t.id)}>{t.action.label}</Link>
          )}
          <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
