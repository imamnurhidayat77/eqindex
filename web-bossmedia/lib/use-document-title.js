'use client';
import { useEffect } from 'react';

// Tab titles for client-only pages (which can't export metadata).
// Appends the brand the same way the root title template does.
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} — Boss Media`;
    return () => { document.title = prev; };
  }, [title]);
}
