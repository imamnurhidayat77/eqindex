'use client';
// Review table for the Import Assistant: every mapped record, grouped by
// class, with inline fixes. Edits go through onEdit/onDelete, which replace
// the analysis records — the page then drops the stale dry-run preview.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { TABLE, TH, TD, NUM, badge, BADGE } from '../../../lib/tokens';
import { reviewGroups, failureSummary, ISSUE_LABELS, INFO_LABELS, DUPLICATE_ERROR } from '../../../lib/importReview';

const ISSUE_BADGE = {
  ungrounded: BADGE.red, failed: BADGE.red, no_series: BADGE.red, placing: BADGE.gray,
  similar_horse: BADGE.gold, similar_rider: BADGE.gold,
};
const FAILURE_CHIP = 'rounded-full border px-2.5 py-1 text-[12px] cursor-pointer bg-transparent transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold [overflow-wrap:anywhere] text-left';
const DUPLICATE_HINT = 'Every failure is a duplicate: that horse and rider already have a round in the same class — either earlier in this file (often a second round or day listed under the same class name) or from an earlier import of this event. Duplicates are never saved twice.';
// "similar_horse" → which record field a "Use X" click replaces.
const SIMILAR_FIELD = { similar_horse: ['horse', 'horse_name'], similar_rider: ['rider', 'rider_name'] };
const USE_BTN = 'text-left [overflow-wrap:anywhere] rounded border border-gold/50 px-2 py-0.5 text-[12px] font-semibold text-gold bg-transparent cursor-pointer hover:bg-goldbg active:scale-[0.97] transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-40 disabled:cursor-not-allowed';
const CELL_INPUT = 'w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-body hover:border-line focus:border-gold/60 focus:bg-ink focus:outline-none';
const PLACE_INPUT_WIDTH = 'w-14';

// "0 · 38.42s", or the non-finished status ("eliminated").
function resultText(r) {
  const status = r.status || 'finished';
  if (status !== 'finished') return status;
  const parts = [r.faults ?? null, r.time != null && r.time !== '' ? `${r.time}s` : null].filter((x) => x !== null && x !== '');
  return parts.length ? parts.join(' · ') : '–';
}

// Uncommitted text input: saves on blur or Enter, Escape restores. Keyed by
// value so an outside change (edit elsewhere, delete) resets the draft.
function EditCell({ value, label, onSave, required = false, className = '' }) {
  const save = (el) => { if (el.value.trim() !== String(value ?? '')) onSave(el.value.trim()); };
  return (
    <input key={String(value ?? '')} defaultValue={value ?? ''} aria-label={label} title={value ? String(value) : undefined}
      placeholder={required ? 'missing' : ''} className={`${CELL_INPUT} placeholder:text-blood ${className}`}
      onBlur={(e) => save(e.target)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { e.currentTarget.value = value ?? ''; e.currentTarget.blur(); }
      }} />
  );
}

export default function ReviewTable({ records, preview, seriesKeys, disabled, onEdit, onDelete }) {
  const groups = useMemo(() => reviewGroups(records, preview), [records, preview]);
  const issueRows = groups.reduce((n, g) => n + g.issueCount, 0);
  // null = automatic: filter on whenever something needs a look.
  const [onlyIssues, setOnlyIssues] = useState(null);
  const filtered = (onlyIssues ?? issueRows > 0) && issueRows > 0;
  const failures = useMemo(() => failureSummary(preview?.dry_run ? preview : null), [preview]);
  const failedTotal = groups.reduce((n, g) => n + g.failedCount, 0);
  const allDuplicates = failures.length === 1 && failures[0].message === DUPLICATE_ERROR;
  // Clicking a failure reason narrows the table to those rows.
  const [errorFilter, setErrorFilter] = useState(null);
  const errorRows = failures.find((f) => f.message === errorFilter)?.indexes || null;
  // Default open: with a filter on, only groups holding what it shows
  // (failed rows first); a click on a group header overrides per group.
  const [toggled, setToggled] = useState(() => new Map());
  // A new Validate result starts from the defaults again (failed / issue
  // groups open), whatever was collapsed by hand before.
  const scroller = useRef(null);
  useEffect(() => {
    setToggled(new Map());
    setErrorFilter(null);
    if (scroller.current) scroller.current.scrollLeft = 0; // Place column in view
  }, [preview]);
  const defaultOpen = (g) => {
    if (errorRows) return true;
    if (!filtered) return true;
    return failedTotal ? g.failedCount > 0 : g.issueCount > 0;
  };
  const isOpen = (g) => (toggled.has(g.key) ? toggled.get(g.key) : defaultOpen(g));
  const toggle = (g) => setToggled((prev) => new Map(prev).set(g.key, !isOpen(g)));
  const pickError = (message) => { setErrorFilter((cur) => (cur === message ? null : message)); setToggled(new Map()); };
  const hasPoints = !!preview?.dry_run;
  const columns = hasPoints ? 7 : 6;

  return (
    <div className="mt-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <span className="font-bold">Review {records.length} row(s)</span>
        <span className={issueRows ? 'text-gold' : 'text-muted'}>{issueRows} with issues</span>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-body cursor-pointer">
          <input type="checkbox" className="h-4 w-4 accent-gold" checked={filtered} disabled={!issueRows}
            onChange={(e) => setOnlyIssues(e.target.checked)} />
          Only rows with issues
        </label>
      </div>
      {failures.length > 0 && (
        <div className="mb-2 rounded-md border border-blood/40 bg-ink p-2.5 text-[13px]">
          <p className="font-bold text-blood">{failedTotal} row(s) failed validation — they will not be saved</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by failure reason">
            {failures.map((f) => {
              const on = errorFilter === f.message;
              return (
                <button key={f.message} type="button" aria-pressed={on} onClick={() => pickError(f.message)}
                  className={`${FAILURE_CHIP} ${on ? 'border-blood bg-redbg text-blood' : 'border-line text-body hover:border-blood/60'}`}>
                  <b className="tabular-nums">{f.count}</b> × {f.message}
                </button>
              );
            })}
          </div>
          {allDuplicates && <p className="mt-1.5 text-muted">{DUPLICATE_HINT}</p>}
          {errorRows && <p className="mt-1.5 text-faint">Showing only “{errorFilter}” rows — click it again to show everything.</p>}
        </div>
      )}
      <div ref={scroller} className="max-h-[480px] overflow-auto rounded-md border border-line">
        <table className={TABLE}>
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th className={`${TH} ${NUM}`}>Place</th><th className={TH}>Rider</th><th className={TH}>Horse</th>
              <th className={TH}>Result</th>
              <th className={TH}>Series</th>{hasPoints && <th className={`${TH} ${NUM}`}>Pts</th>}
              <th className={TH}><span className="sr-only">Delete</span></th>
            </tr>
          </thead>
          {groups.map((g) => {
            const rows = errorRows ? g.rows.filter((row) => errorRows.has(row.index))
              : filtered ? g.rows.filter((row) => row.issues.length) : g.rows;
            if (!rows.length) return null;
            const open = isOpen(g);
            return (
              <tbody key={g.key}>
                <tr>
                  <th colSpan={columns} scope="colgroup" className="border-b border-line bg-card2 p-0 text-left">
                    <button type="button" aria-expanded={open} onClick={() => toggle(g)}
                      className="flex w-full items-center gap-2 bg-transparent px-2 py-2 text-left text-[13px] cursor-pointer border-0 text-body hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
                      <span aria-hidden="true" className="w-3 shrink-0 text-muted">{open ? '▾' : '▸'}</span>
                      <span className="min-w-0 font-bold [overflow-wrap:anywhere]">{g.name || '(no class name)'}</span>
                      {g.date && <span className="shrink-0 text-muted">{g.date}</span>}
                      <span className="shrink-0 text-muted whitespace-nowrap">· {g.rows.length} row(s)</span>
                      {!!g.issueCount && <span className="shrink-0 text-gold whitespace-nowrap">· {g.issueCount} issue(s)</span>}
                      {!!g.failedCount && <span className="shrink-0 text-blood whitespace-nowrap">· {g.failedCount} failed</span>}
                    </button>
                  </th>
                </tr>
                {open && rows.map(({ index, record: r, result, issues, info }) => {
                  const n = index + 1;
                  const errors = result && !result.ok ? (result.errors || []) : [];
                  const hasNotes = issues.length > 0 || info.length > 0 || errors.length > 0;
                  const cell = hasNotes ? `${TD} border-b-0 pb-1` : TD;
                  return (
                    <Fragment key={index}>
                    <tr className="align-top">
                      <td className={`${cell} ${NUM}`}>
                        <EditCell value={r.placing} label={`Placing, row ${n}`} className={`${PLACE_INPUT_WIDTH} text-right tabular-nums`}
                          onSave={(v) => onEdit(index, 'placing', v)} />
                      </td>
                      <td className={`${cell} w-[27%] min-w-[120px]`}>
                        <EditCell value={r.rider_name} label={`Rider, row ${n}`} required onSave={(v) => onEdit(index, 'rider_name', v)}
                          className={r.ungrounded?.includes('rider') ? 'text-blood' : ''} />
                      </td>
                      <td className={`${cell} w-[27%] min-w-[120px]`}>
                        <EditCell value={r.horse_name} label={`Horse, row ${n}`} required onSave={(v) => onEdit(index, 'horse_name', v)}
                          className={r.ungrounded?.includes('horse') ? 'text-blood' : ''} />
                      </td>
                      <td className={`${cell} text-muted whitespace-nowrap tabular-nums`}>{resultText(r)}</td>
                      <td className={cell}>
                        <select aria-label={`Series, row ${n}`} value={r.series_key || ''} disabled={disabled}
                          onChange={(e) => onEdit(index, 'series_key', e.target.value)}
                          className="w-full min-w-[96px] max-w-[150px] rounded border border-line bg-ink px-1.5 py-1 text-[13px] text-body focus:border-gold/60 focus:outline-none">
                          <option value="">— none —</option>
                          {r.series_key && !seriesKeys.includes(r.series_key) && <option value={r.series_key}>{r.series_key}</option>}
                          {seriesKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </td>
                      {hasPoints && <td className={`${cell} ${NUM}`}><b className={result?.ok ? 'text-gold' : 'text-faint'}>{result?.ok ? result.preview.points : '–'}</b></td>}
                      <td className={cell}>
                        <button type="button" disabled={disabled} onClick={() => onDelete(index)} aria-label={`Delete row ${n}`} title="Delete row"
                          className="rounded px-1.5 py-0.5 text-[15px] leading-none text-faint bg-transparent border-0 cursor-pointer hover:text-blood focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-40 disabled:cursor-not-allowed">×</button>
                      </td>
                    </tr>
                    {hasNotes && (
                      <tr>
                        <td colSpan={columns} className={`${TD} pt-0`}>
                          <div className="flex flex-wrap items-center gap-1 sm:pl-16">
                            {issues.map((i) => {
                              const sim = SIMILAR_FIELD[i] && result?.preview?.[i];
                              if (!sim) return <span key={i} className={`${badge(ISSUE_BADGE[i])} whitespace-nowrap`}>{ISSUE_LABELS[i]}</span>;
                              const [what, field] = SIMILAR_FIELD[i];
                              return (
                                <span key={i} className="inline-flex flex-wrap items-center gap-1">
                                  <span className={`${badge(ISSUE_BADGE[i])} [overflow-wrap:anywhere]`}>{what} looks like “{sim.name}” ({Math.round(sim.score * 100)}%)</span>
                                  <button type="button" className={USE_BTN} disabled={disabled}
                                    aria-label={`Use existing ${what} ${sim.name} for row ${n}`}
                                    onClick={() => onEdit(index, field, sim.name)}>Use {sim.name}</button>
                                </span>
                              );
                            })}
                            {info.map((i) => <span key={i} className={`${badge(BADGE.gray)} whitespace-nowrap`}>{INFO_LABELS[i]}</span>)}
                            {errors.length > 0 && <span className="text-[12px] text-blood [overflow-wrap:anywhere]">{errors.join('; ')}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
      {filtered && !errorRows && <p className="mt-1 text-[12px] text-faint">Showing rows with issues only — untick to see all {records.length}.</p>}
    </div>
  );
}
