'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// Instant feedback for App Router navigations (Next 14 has no router events).
// Shows a white top bar + "Loading…" pill the moment an internal link is
// clicked, then hides once the new pathname commits (or after a timeout).
export default function RouteProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    setPending(false);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, [pathname]);

  useEffect(() => {
    function onClick(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.('a[href]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/') || href.startsWith('//')) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      try {
        const url = new URL(href, window.location.origin);
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch { /* fall through → show */ }
      setPending(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPending(false), 10000);
    }
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!pending) return null;
  return (
    <>
      <div className="bm-route-bar" aria-hidden="true" />
      <div className="bm-route-pill" role="status" aria-live="polite">
        <span className="bm-spinner" aria-hidden="true" />
        Loading…
      </div>
    </>
  );
}
