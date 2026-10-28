'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../lib/focus-trap';

// Controlled confirm modal — deliberately context-free. The parent owns
// `open` state, so open=true always paints: no promise chain or provider
// stands between the click and the pixels.
export default function ConfirmModal({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, busy = false, prompt = false, placeholder = '', initial = '',
  numeric = false, onConfirm, onCancel,
}) {
  const [input, setInput] = useState(initial);
  const rootRef = useRef(null);
  useEffect(() => { if (open) setInput(initial); }, [open, initial]);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open ]);
  useFocusTrap(rootRef, { onClose: onCancel, active: open });

  if (!open) return null;
  const submit = (v) => onConfirm?.(v);
  return (
    <div className="st-modal" ref={rootRef} role="alertdialog" aria-modal="true" aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}>
      <div className="st-modal-card" role="document">
        <p className="eyebrow">Please confirm</p>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        {prompt && (
          <input autoFocus value={input} placeholder={placeholder}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(input); }}
            inputMode={numeric ? 'decimal' : undefined} />
        )}
        <div className="st-modal-actions">
          <button type="button" className="st-btn-ghost" onClick={() => onCancel?.()}>{cancelLabel}</button>
          <button type="button" className={danger ? 'st-btn st-btn-danger-fill' : 'st-btn'}
            disabled={busy} onClick={() => submit(prompt ? input : undefined)}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Drop-in replacement for the old dialog context: same confirm()/prompt()
// promise API, but state lives in the calling component (proven to paint).
// Render the returned element somewhere in your tree:
//   const [confirmUI, dialog] = useConfirm(); ... {confirmUI} ... await dialog.confirm({...})
export function useConfirm() {
  const [req, setReq] = useState(null);
  const ask = useCallback((opts) => new Promise((resolve) => setReq({ ...opts, resolve })), []);
  const close = useCallback((value) => {
    setReq((r) => { if (r) r.resolve(value); return null; });
  }, []);
  const api = useCallback(() => ({
    confirm: (opts) => ask({ ...opts, prompt: false }),
    prompt: (opts) => ask({ ...opts, prompt: true }),
  }), [ask]);
  // Stable-ish handle: callers destructure once (const [ui, dialog] = ...).
  const ui = req ? (
    <ConfirmModal open
      title={req.title} message={req.message}
      confirmLabel={req.confirmLabel || (req.prompt ? 'Save' : 'Confirm')}
      cancelLabel={req.cancelLabel || 'Cancel'}
      danger={req.danger} prompt={req.prompt}
      placeholder={req.placeholder} initial={req.initial || ''}
      numeric={req.numeric}
      onCancel={() => close(req.prompt ? null : false)}
      onConfirm={(v) => close(req.prompt ? v : true)} />
  ) : null;
  return [ui, api()];
}
