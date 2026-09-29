'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminApi } from './useAdminApi';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY } from '../lib/tokens';
import Dropdown from './Dropdown';
import Modal, { ConfirmDialog } from './Modal';
import { Pagination } from './list-controls';
import { TableEmpty } from './EmptyState';
import Switch, { LabeledSwitch } from './Switch';

// Generic admin CRUD table.
//   base: 'horses'|'riders'|'events'|'series' (drives /admin/<base> endpoints)
//   idKey: row id field (default 'id'; series uses 'series_key')
//   nameKey: string key or (row) => string for dialog titles (default 'name')
//   profile: (row) => href|null
//   columns: [{k,label,num?,bool?,render?,toggle?}]
//     bool → ON/OFF pill, clickable to flip the field in place.
//     toggle {field,on,off,onLabel,offLabel} → pill flipping any value pair
//       (e.g. visibility public/anonymous) without opening the edit form.
//   fields: [{k,label,type?('textarea'),bool?,options?}]
//   hideSearch: true when the list endpoint has no ?q= support.
export default function ManageTable({ title, sub, base, profile, columns, fields, idKey = 'id', nameKey = 'name', hideSearch = false }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [form, setForm] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  // bulk selection (ids persist across pages) + progress
  const [selected, setSelected] = useState(() => new Set());
  const [bulkConfirm, setBulkConfirm] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(null);
  // density + visible columns, persisted per table
  const [density, setDensity] = useState(() => {
    try { return localStorage.getItem(`eq-admin-density-${base}`) || 'comfortable'; } catch { return 'comfortable'; }
  });
  const [hiddenCols, setHiddenCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`eq-admin-cols-${base}`) || '[]'); } catch { return []; }
  });
  const [colsOpen, setColsOpen] = useState(false);

  const rowName = (r) => (typeof nameKey === 'function' ? nameKey(r) : r[nameKey]);
  const call = useAdminApi();
  const visibleColumns = columns.filter((c) => !hiddenCols.includes(c.k));
  const shownColumns = visibleColumns.length ? visibleColumns : columns;
  const setDensityPersist = (d) => {
    setDensity(d);
    try { localStorage.setItem(`eq-admin-density-${base}`, d); } catch { /* ignore */ }
  };
  const toggleCol = (k) => {
    setHiddenCols((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      if (next.length >= columns.length) return prev; // keep at least one column
      try { localStorage.setItem(`eq-admin-cols-${base}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  async function load(query = '') {
    setLoading(true); setErr('');
    try { setRows(await call(`/admin/${base}${query ? `?q=${encodeURIComponent(query)}` : ''}`) || []); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(q.trim()); }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(page, pages);
  const view = rows.slice((safePage - 1) * perPage, safePage * perPage);

  // ---- inline toggle (hide/show without opening the form) ----
  const toggleOf = (col) => {
    if (col.toggle) return col.toggle;
    if (col.bool && col.toggle !== false) {
      return { field: col.k, on: true, off: false, onLabel: 'ON', offLabel: 'OFF' };
    }
    return null;
  };
  async function flip(row, col) {
    const t = toggleOf(col);
    if (!t || busyId) return;
    const next = row[t.field] === t.on ? t.off : t.on;
    setBusyId(row[idKey]); setErr('');
    try {
      const updated = await call(`/admin/${base}/${row[idKey]}`, { method: 'PATCH', body: JSON.stringify({ [t.field]: next }) });
      setRows((prev) => prev.map((x) => (x[idKey] === row[idKey] ? { ...x, ...(updated || {}), [t.field]: next } : x)));
    } catch (e) { setErr(e.message); }
    setBusyId(null);
  }
  const togglePill = (row, col, t) => {
    // bool toggles treat NULL as ON (matches the `IS NOT FALSE` public rule).
    const isOn = t.on === true && t.off === false ? row[t.field] !== false : row[t.field] === t.on;
    const label = isOn ? (t.onLabel || 'ON') : (t.offLabel || 'OFF');
    return (
      <LabeledSwitch
        on={isOn}
        onFlip={() => flip(row, col)}
        label={`${typeof col.label === 'string' ? col.label : 'Tracked'} — ${label}`}
        disabled={busyId === row[idKey]}
        size="sm"
        onText={t.onLabel || 'ON'}
        offText={t.offLabel || 'OFF'}
      />
    );
  };
  function startEdit(row) {
    const f = {};
    for (const fld of fields) f[fld.k] = row[fld.k] ?? '';
    setForm(f); setEditing(row); setErr('');
  }
  async function save() {
    setBusy(true); setErr('');
    try {
      const updated = await call(`/admin/${base}/${editing[idKey]}`, { method: 'PATCH', body: JSON.stringify(form) });
      setRows((prev) => prev.map((x) => (x[idKey] === editing[idKey] ? { ...x, ...(updated || {}), ...form } : x)));
      setEditing(null);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  function impactOf(row) {
    if (row.starts !== undefined) return `This record has ${row.starts} round${Number(row.starts) === 1 ? '' : 's'}.`;
    if (row.round_count !== undefined) return `Cascades to ${row.class_count ?? '?'} classes and ${row.round_count} rounds.`;
    if (row.entries !== undefined) return `Deletes all ${row.entries} standing rows in this series.`;
    return null;
  }
  async function doDelete() {
    const row = confirming;
    if (!row) return;
    setBusy(true);
    try {
      await call(`/admin/${base}/${row[idKey]}`, { method: 'DELETE' });
      setRows((prev) => prev.filter((x) => x[idKey] !== row[idKey]));
      setSelected((prev) => { const n = new Set(prev); n.delete(row[idKey]); return n; });
      setConfirming(null);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  // ---- bulk actions (sequential, per-row audit preserved) ----
  const toggleCol0 = shownColumns.map((c) => toggleOf(c)).find(Boolean) || null;
  const selRows = rows.filter((r) => selected.has(r[idKey]));
  const bulkToggleTarget = (() => {
    if (!toggleCol0 || !selRows.length) return null;
    const allOff = selRows.every((r) => toggleIsOn(r, toggleCol0) === false);
    return allOff ? toggleCol0.on : toggleCol0.off;
  })();
  function toggleIsOn(r, t) {
    return t.on === true && t.off === false ? r[t.field] !== false : r[t.field] === t.on;
  }
  async function runBulk(kind) {
    const ids = selRows.map((r) => r[idKey]);
    setBulkBusy({ done: 0, total: ids.length });
    setBulkConfirm(null); setErr('');
    const failed = [];
    for (const [i, row] of selRows.entries()) {
      try {
        if (kind === 'delete') {
          await call(`/admin/${base}/${row[idKey]}`, { method: 'DELETE' });
          setRows((prev) => prev.filter((x) => x[idKey] !== row[idKey]));
        } else {
          const updated = await call(`/admin/${base}/${row[idKey]}`, { method: 'PATCH', body: JSON.stringify({ [toggleCol0.field]: bulkToggleTarget }) });
          setRows((prev) => prev.map((x) => (x[idKey] === row[idKey] ? { ...x, ...(updated || {}), [toggleCol0.field]: bulkToggleTarget } : x)));
        }
      } catch (e) { failed.push(rowName(row)); }
      setBulkBusy({ done: i + 1, total: ids.length });
    }
    setSelected(new Set());
    setBulkBusy(null);
    if (failed.length) setErr(`Bulk ${kind} partially failed (${failed.length}): ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`);
  }

  const inputFor = (fld) => {
    if (fld.bool) {
      const on = form[fld.k] ?? true;
      return (
        <span className="inline-flex items-center gap-2.5 py-1">
          <Switch on={!!on} onFlip={() => setForm({ ...form, [fld.k]: !on })} label={fld.label} />
          <span className={`text-[12px] font-bold ${on ? 'text-moss' : 'text-faint'}`}>{on ? 'ON' : 'OFF'}</span>
        </span>
      );
    }
    if (fld.options) {
      return (
        <Dropdown ariaLabel={fld.label} value={form[fld.k] ?? ''} placeholder="—" block
          options={[{ value: '', label: '—' }, ...fld.options.map((o) => ({ value: o, label: o }))]}
          onSelect={(o) => setForm({ ...form, [fld.k]: o.value })} />
      );
    }
    if (fld.type === 'textarea') {
      return (
        <textarea className={INP} rows={3} value={form[fld.k] ?? ''}
          onChange={(e) => setForm({ ...form, [fld.k]: e.target.value })}
          placeholder={fld.placeholder || fld.label} maxLength={2000} />
      );
    }
    return (
      <input className={INP} value={form[fld.k] ?? ''} onChange={(e) => setForm({ ...form, [fld.k]: e.target.value })}
        placeholder={fld.placeholder || fld.label} maxLength={200} />
    );
  };

  const cellContent = (r, c) => {
    const t = toggleOf(c);
    if (t) return togglePill(r, c, t);
    if (c.render) return c.render(r);
    if (c.k === 'name' && profile && profile(r)) return <Link className="text-sky hover:text-white text-[13px] font-semibold no-underline" href={profile(r)}><b>{r.name}</b></Link>;
    if (c.k === 'name') return <b>{r.name}</b>;
    if (Array.isArray(r[c.k])) return r[c.k].join(', ') || '–';
    return String(r[c.k] ?? '–');
  };

  return (
    <>
      <h1 className={H1}>{title}</h1>
      <p className={SUB}>{sub}</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!hideSearch && (
          <input className={INP} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" style={{ maxWidth: 320, width: '100%' }} />
        )}
        <span className="flex-1" />
        <span className="inline-flex rounded border border-line overflow-hidden" role="group" aria-label="Row density">
          {['comfortable', 'compact'].map((d) => (
            <button key={d} onClick={() => setDensityPersist(d)} aria-pressed={density === d} title={`${d} rows`}
              className={`px-2.5 py-[7px] text-[12px] cursor-pointer border-0 ${density === d ? 'bg-goldbg text-gold font-bold' : 'bg-card2 text-muted hover:text-white'}`}>
              {d === 'comfortable' ? '☰' : '≣'}
            </button>
          ))}
        </span>
        <span className="relative">
          <button onClick={() => setColsOpen((o) => !o)} aria-expanded={colsOpen}
            className="rounded border border-line bg-card2 px-2.5 py-[7px] text-[12px] text-muted hover:text-white cursor-pointer">
            Columns ▾
          </button>
          {colsOpen && (
            <span className="absolute right-0 top-full mt-1 z-30 block min-w-[180px] rounded border border-line bg-card2 py-1 shadow-xl">
              {columns.map((c) => {
                const hidden = hiddenCols.includes(c.k);
                const lastVisible = !hidden && shownColumns.length === 1;
                return (
                  <label key={c.k} className={`flex items-center gap-2 px-3 py-1.5 text-[13px] ${lastVisible ? 'opacity-40' : 'cursor-pointer hover:bg-white/5'} text-muted`}>
                    <input type="checkbox" checked={!hidden} disabled={lastVisible} onChange={() => toggleCol(c.k)} className="accent-gold" />
                    {c.label}
                  </label>
                );
              })}
            </span>
          )}
        </span>
      </div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-gold/50 bg-goldbg/20 px-3 py-2 text-[13px]">
          <b className="text-gold">{selected.size} selected</b>
          {toggleCol0 && (
            <button onClick={() => runBulk('toggle')} disabled={!!bulkBusy}
              className="rounded border border-line bg-card2 px-2.5 py-1 text-[12px] text-white hover:border-faint cursor-pointer disabled:opacity-60">
              {bulkToggleTarget === toggleCol0.on ? `Show ${selected.size}` : `Hide ${selected.size}`}
            </button>
          )}
          <button onClick={() => setBulkConfirm('delete')} disabled={!!bulkBusy}
            className="rounded border border-blood/50 bg-redbg/30 px-2.5 py-1 text-[12px] text-blood hover:border-blood cursor-pointer disabled:opacity-60">
            Delete {selected.size}
          </button>
          <button onClick={() => setSelected(new Set())} disabled={!!bulkBusy}
            className="text-muted text-[12px] bg-none border-0 cursor-pointer hover:text-white disabled:opacity-60">Clear</button>
          {bulkBusy && <span className="text-muted text-[12px]">Working… {bulkBusy.done}/{bulkBusy.total}</span>}
        </div>
      )}
      <section className={`${CARD} ${density === 'compact' ? 'tbl-compact' : ''}`}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH} style={{ width: 34 }}>
              <input type="checkbox" aria-label="Select page"
                checked={view.length > 0 && view.every((r) => selected.has(r[idKey]))}
                ref={(el) => { if (el) el.indeterminate = view.some((r) => selected.has(r[idKey])) && !view.every((r) => selected.has(r[idKey])); }}
                onChange={(e) => {
                  setSelected((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) view.forEach((r) => n.add(r[idKey]));
                    else view.forEach((r) => n.delete(r[idKey]));
                    return n;
                  });
                }}
                className="accent-gold w-3.5 h-3.5 cursor-pointer" />
            </th>
            {shownColumns.map((c) => <th key={c.k} className={`${TH} ${c.num ? NUM : ''}`}>{c.label}</th>)}
            <th className={TH}><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={r[idKey]} className={selected.has(r[idKey]) ? 'bg-goldbg/20' : ''}>
                <td className={TD}>
                  <input type="checkbox" aria-label={`Select ${rowName(r)}`}
                    checked={selected.has(r[idKey])}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const n = new Set(prev);
                        if (e.target.checked) n.add(r[idKey]); else n.delete(r[idKey]);
                        return n;
                      });
                    }}
                    className="accent-gold w-3.5 h-3.5 cursor-pointer" />
                </td>
                {shownColumns.map((c) => (
                  <td key={c.k} className={`${TD} ${c.num ? `${NUM} text-muted` : ''}`}>{cellContent(r, c)}</td>
                ))}
                <td className={`${TD} whitespace-nowrap text-right`}>
                  <span className="inline-flex gap-1.5">
                    <button title={`Edit ${rowName(r)}`} aria-label={`Edit ${rowName(r)}`}
                      onClick={() => startEdit(r)}
                      className="w-7 h-7 inline-flex items-center justify-center rounded border border-line bg-card2 text-sky hover:text-white hover:border-sky/60 text-[13px] cursor-pointer transition-colors">✎</button>
                    <button title={`Delete ${rowName(r)}`} aria-label={`Delete ${rowName(r)}`}
                      disabled={busy} onClick={() => { setConfirming(r); setErr(''); }}
                      className="w-7 h-7 inline-flex items-center justify-center rounded border border-line bg-card2 text-blood hover:border-blood/70 text-[13px] cursor-pointer disabled:opacity-40 transition-colors">🗑</button>
                  </span>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <TableEmpty
                icon="◌"
                title="No records found"
                hint="Try a different search — or add the first record below."
              />
            )}
            {loading && <tr><td colSpan={shownColumns.length + 2} className={EMPTY}>
              <span className="flex flex-col gap-2 py-1" aria-hidden="true" aria-label="Loading">
                {[0, 1, 2].map((i) => <span key={i} className="sk h-3.5 w-full" />)}
              </span>
            </td></tr>}
          </tbody>
        </table>
        </div>
        <Pagination page={safePage} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={rows.length} />
      </section>

      {editing && (
        <Modal title={`Edit — ${rowName(editing)}`} sub={sub} onClose={() => setEditing(null)}
          footer={[
            <button key="cancel" onClick={() => setEditing(null)} disabled={busy}
              className="rounded border border-line px-4 py-2 text-sm text-muted hover:text-white hover:border-faint bg-none cursor-pointer disabled:opacity-60">
              Cancel
            </button>,
            <button key="save" onClick={save} disabled={busy}
              className={`${BTN_PRIMARY} disabled:opacity-60 disabled:cursor-wait`}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>,
          ]}>
          {err && <p className="rounded border border-blood/40 bg-redbg/40 px-3 py-2 text-blood text-[13px] mb-3">{err}</p>}
          <div className="grid md:grid-cols-2 gap-3">
            {fields.map((fld) => (
              <label key={fld.k} className={`text-xs text-muted flex flex-col gap-1 ${fld.type === 'textarea' ? 'md:col-span-2' : ''}`}>
                {fld.label}{inputFor(fld)}
              </label>
            ))}
          </div>
        </Modal>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Delete “${rowName(confirming)}”?`}
          body={<>
            {impactOf(confirming) && <p className="mb-2 text-body font-semibold">{impactOf(confirming)}</p>}
            <p>This cannot be undone. The record is removed permanently and the change is audited.</p>
          </>}
          confirmLabel="Delete permanently"
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={doDelete}
        />
      )}

      {bulkConfirm === 'delete' && (
        <ConfirmDialog
          title={`Delete ${selected.size} records?`}
          body={<>
            <p className="mb-2 text-body font-semibold">
              {selRows.slice(0, 3).map((r) => rowName(r)).join(', ')}{selRows.length > 3 ? ` and ${selRows.length - 3} more` : ''}.
            </p>
            <p>This cannot be undone. Each deletion is audited individually.</p>
          </>}
          confirmLabel={`Delete ${selected.size} records`}
          busy={!!bulkBusy}
          onCancel={() => setBulkConfirm(null)}
          onConfirm={() => runBulk('delete')}
        />
      )}
    </>
  );
}
