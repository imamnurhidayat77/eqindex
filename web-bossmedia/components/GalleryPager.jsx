'use client';

// Numbered pagination in the gallery theme. Calls onPage(n) with a
// 1-based page number and scrolls the nearest [data-page-top] ancestor
// into view so the new slice starts at the top of the list.
export default function GalleryPager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  const go = (n) => (e) => {
    e.preventDefault();
    const t = Math.min(pages, Math.max(1, n));
    if (t === page) return;
    onPage(t);
    const host = e.currentTarget.closest('[data-page-top]');
    const top = host || e.currentTarget.closest('main') || e.currentTarget.closest('.gallery-page');
    (top || document.body).scrollIntoView({ block: 'start' });
  };
  const nums = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 2) nums.push(n);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <nav className="my-pager" aria-label={`Pagination, page ${page} of ${pages}`}>
      <button type="button" disabled={page <= 1} onClick={go(page - 1)} aria-label={`Previous page, page ${page} of ${pages}`}>← Prev</button>
      {nums.map((n, i) => n === '…'
        ? <span key={`e${i}`} className="my-pager-gap" aria-hidden="true">…</span>
        : <button key={n} type="button" aria-label={`Page ${n}`} aria-current={n === page ? 'page' : undefined} className={n === page ? 'on' : ''} onClick={go(n)}>{n}</button>)}
      <button type="button" disabled={page >= pages} onClick={go(page + 1)} aria-label={`Next page, page ${page} of ${pages}`}>Next →</button>
    </nav>
  );
}
