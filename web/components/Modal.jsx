'use client';
import { useEffect } from 'react';
import { BTN_DANGER, BTN_PRIMARY } from '../lib/tokens';

// Shared admin modal: overlay + ESC/backdrop close, gold accent, scroll-safe.
// Put form/action content in children, buttons in `footer`.
export default function Modal({ title, sub, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] isolate flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div aria-hidden="true" onClick={onClose} className="modal-fade absolute inset-0 bg-black/80 backdrop-blur-[3px]" />
      <div className={`modal-pop relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded border shadow-2xl max-h-[90vh] overflow-y-auto`}
        style={{ backgroundColor: '#141414', borderColor: '#2A2A2A' }}>
        <div className="h-[3px] rounded-t bg-gold" aria-hidden="true" />
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold truncate">{title}</h2>
              {sub && <p className="text-muted text-[13px] mt-0.5">{sub}</p>}
            </div>
            <button onClick={onClose} aria-label="Close dialog"
              className="shrink-0 w-8 h-8 rounded border border-line bg-card2 text-muted hover:text-white hover:border-faint text-[14px] cursor-pointer">
              ✕
            </button>
          </div>
          <div className="mt-4">{children}</div>
          {footer && <div className="flex flex-wrap gap-2 mt-5 justify-end">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

// Destructive confirm in modal form (replaces window.confirm).
export function ConfirmDialog({ title, body, confirmLabel = 'Delete', danger = true, busy = false, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel}
      footer={[
        <button key="cancel" onClick={onCancel} disabled={busy}
          className="rounded border border-line px-4 py-2 text-sm text-muted hover:text-white hover:border-faint bg-none cursor-pointer disabled:opacity-60">
          Cancel
        </button>,
        <button key="ok" onClick={onConfirm} disabled={busy}
          className={`${danger ? BTN_DANGER : BTN_PRIMARY} disabled:opacity-60 disabled:cursor-wait`}>
          {busy ? 'Working…' : confirmLabel}
        </button>,
      ]}>
      <div className="text-sm text-muted leading-relaxed">{body}</div>
    </Modal>
  );
}
