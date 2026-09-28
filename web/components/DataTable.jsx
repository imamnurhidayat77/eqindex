'use client';
import { useEffect, useMemo, useState } from 'react';
import { Pagination } from './list-controls';

// Generic client-side datatable: text filter + pagination around any table.
// Props:
//   rows: array of row objects
//   searchKeys: keys searched by the text box (default: all string/number values)
//   placeholder: search box placeholder
//   initialPerPage, perPageOptions
//   loading, emptyText
//   thead: <tr>…</tr> header row
//   renderRow: (row, i) => <tr>…</tr>  (key must be set by caller)
//   colSpan: colspan for the empty/loading row
//   showSearch (default true), showPagination (default true)
export default function DataTable({
  rows = [],
  searchKeys = null,
  placeholder = 'Filter…',
  initialPerPage = 15,
  perPageOptions = [10, 15, 25, 50],
  loading = false,
  emptyText = 'No rows match these filters.',
  thead = null,
  renderRow = null,
  colSpan = 99,
  showSearch = true,
  showPagination = true,
  tableMinWidth = null,
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const vals = searchKeys
        ? searchKeys.map((k) => r?.[k])
        : Object.values(r ?? {});
      return vals.some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(s));
    });
  }, [rows, q, searchKeys]);

  useEffect(() => { setPage(1); }, [q, rows]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const view = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  return (
    <>
      {showSearch && (
        <div className="mb-3">
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
            className="w-full max-w-[320px] rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-white placeholder:text-faint focus:border-gold/60 focus:outline-none"
          />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}>
          {thead && <thead>{thead}</thead>}
          <tbody>
            {view.map((r, i) => renderRow(r, i))}
            {!view.length && (
              <tr><td colSpan={colSpan} className="px-2 py-6 text-center text-muted">
                {loading ? 'Loading…' : emptyText}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {showPagination && (
        <Pagination
          page={safePage} pages={pages} setPage={setPage}
          perPage={perPage} setPerPage={setPerPage} total={filtered.length}
        />
      )}
    </>
  );
}
