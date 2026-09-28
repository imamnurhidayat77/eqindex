'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// Immediate feedback for App Router navigations (Next 14 has no router events).
// Shows a gold top bar + "Loading…" pill the moment an internal link is clicked,
// then hides once the new pathname commits (or after a safety timeout).
export default function RouteProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const timer = useRef(null);

  // Navigation committed → hide.
  useEffect(() => {
    setPending(false);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, [pathname]);

  useEffect(() => {
    function onClick(e) {
      // Only left-click without modifiers on same-tab internal links.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.('a[href]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/') || href.startsWith('//')) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      // Same-page hash jump → no route load.
      try {
        const url = new URL(href, window.location.origin);
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch { /* fall through → show */ }
      setPending(true);
      if (timer.current) clearTimeout(timer.current);
      // Fail-safe: never trap the UI in loading state.
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
      <div className="route-bar" aria-hidden="true" />
      <div className="fixed top-[68px] right-4 z-50 flex items-center gap-2 rounded-full border border-gold/50 bg-card2 px-3 py-1.5 text-[12px] font-semibold text-gold shadow-xl" role="status" aria-live="polite">
        <span className="spinner spinner-gold" aria-hidden="true" />
        Loading…
      </div>
    </>
  );
}
