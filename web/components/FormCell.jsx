'use client';

// Form-window cell shared by the Horses and Riders ranking tables.
// Eligible: the recent-window score, bold. The column header names the
// window, so the cell carries no redundant "form" prefix.
// Ineligible: compact n/min progress instead of a long sentence
// (full text kept in title + screen-reader text).
export default function FormCell({ eligible, formScore, rounds, minRounds, windowNote }) {
  if (!eligible) {
    const r = Number(rounds || 0);
    const need = Math.max(1, minRounds - r);
    const pct = Math.min(100, Math.round((100 * r) / minRounds));
    return (
      <span className="inline-flex items-center gap-2" title={`needs ${need} more rounds to rank`}>
        <span className="h-1 w-14 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <span className="block h-full rounded-full bg-gold/70" style={{ width: `${pct}%` }} />
        </span>
        <span className="tabular-nums text-[12px] text-faint">{r}/{minRounds}</span>
        <span className="sr-only">needs {need} more rounds to rank</span>
      </span>
    );
  }
  if (formScore === null || formScore === undefined) return <span className="text-faint">–</span>;
  return (
    <b className="font-bold text-white tabular-nums" title={windowNote || 'Recent window score, worst rounds dropped'}>
      {Number(formScore).toFixed(1)}
    </b>
  );
}
