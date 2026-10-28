'use client';
import { useState } from 'react';
import { Pager } from './studio';

// Shared studio datatable: consistent st-table + numbered pagination.
// columns: [{ key, label, render?(row) }]. Pagination is client-side and
// self-contained (clamps when rows shrink after delete/reload).
export default function StudioTable({
  columns,
  rows,
  rowKey = (r, i) => r.id ?? i,
  pageSize = 10,
  loading = false,
  empty = 'Nothing here.',
}) {
  const [offset, setOffset] = useState(0);
  if (loading) return <p className="empty-note">Loading…</p>;
  const total = rows?.length || 0;
  if (!total) return <p className="empty-note">{empty}</p>;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(offset, Math.max(0, (pages - 1) * pageSize));
  const page = (rows || []).slice(safe, safe + pageSize);
  return (
    <>
      <div className="table-scroll">
      <table className="st-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {page.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <Pager total={total} limit={pageSize} offset={safe} onPage={setOffset} />
    </>
  );
}
