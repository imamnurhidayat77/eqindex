'use client';
import { useMemo, useState } from 'react';

// Season Timeline — Charles's sheet as a component: one column per round,
// chronological left to right, grouped by month. Clears are gold stars
// (a 2 inside = double clear); faults are numbered circles coloured by
// event profile (green Normal, red Premier/Grand Prix); bold black ring =
// jump-off class.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthKey = (ds) => {
  const d = new Date(ds);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key) => {
  if (!key) return 'Unknown';
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
};

const initials = (name) => String(name || '').trim().split(/\s+/)
  .slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '–';

const isPremier = (r) => r.event_tier === 'Premier' || r.event_tier === 'Grand Prix';
const isJumpOff = (r) => (r.class_format || '').toLowerCase() === 'jump-off';

const dayOf = (ds) => {
  const d = new Date(ds);
  return Number.isNaN(d.getTime()) ? '' : d.getDate();
};
const monthOf = (ds) => {
  const d = new Date(ds);
  return Number.isNaN(d.getTime()) ? '' : MONTHS[d.getMonth()];
};

const isDoubleClear = (r) => !!r.clear_round &&
  ((r.jumpoff_faults !== null && r.jumpoff_faults !== undefined && Number(r.jumpoff_faults) === 0) ||
   (r.round2_faults !== null && r.round2_faults !== undefined && Number(r.round2_faults) === 0));

function Star({ doubleClear, jumpOff, premier, title }) {
  // Gold star, edge tinted by event profile (green Normal, red Premier) so
  // the event colour survives on clears. Jump-off classes get a black halo.
  const edge = premier ? '#FF1744' : '#00C853';
  return (
    <span
      title={title}
      className="relative z-10 inline-flex rounded-full"
      style={jumpOff ? { boxShadow: '0 0 0 2px #000' } : undefined}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" role="img" aria-label={title} className="overflow-visible">
        <path
          d="M12 2l2.29 6.84 7.22 0.07-5.8 4.3 2.17 6.88L12 15.9l-5.88 4.19 2.17-6.88-5.8-4.3 7.22-0.07z"
          fill="#FFD700" stroke={edge} strokeWidth="1.6" strokeLinejoin="round"
        />
        {doubleClear && (
          <text x="12" y="12.6" textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontWeight="800" fill="#0A0A0A">2</text>
        )}
      </svg>
    </span>
  );
}

function Dot({ r }) {
  const premier = isPremier(r);
  const jumpOff = isJumpOff(r);
  const clear = !!r.clear_round;
  const faults = r.total_faults === null || r.total_faults === undefined ? null : Number(r.total_faults);
  const color = premier ? '#FF1744' : '#00C853';
  const dc = isDoubleClear(r);
  const title = `${r.event_name || ''} — ${r.class_name || ''}${faults === null ? '' : faults === 0 ? (dc ? ' · double clear' : ' · clear') : ` · ${faults} faults`}${jumpOff ? ' · jump-off' : ''}`;
  if (clear) return <Star doubleClear={dc} jumpOff={jumpOff} premier={premier} title={title} />;
  return (
    <span
      title={title}
      className="relative z-10 inline-flex items-center justify-center w-[28px] h-[28px] rounded-full text-[12px] font-extrabold tabular-nums"
      style={{
        border: `${jumpOff ? 3 : 2}px solid ${jumpOff ? '#000' : color}`,
        boxShadow: jumpOff ? `0 0 0 1.5px ${color}, 0 0 0 3px #000` : `0 0 0 3px #141414`,
        background: '#141414',
      }}
    >
      {faults !== null ? <span style={{ color }}>{faults}</span> : null}
    </span>
  );
}

// Horizontal connector drawn through the middle of each dot cell.
const TRACK = {
  background: 'linear-gradient(to bottom, transparent calc(50% - 1px), #333  calc(50% - 1px), #333 calc(50% + 1px), transparent calc(50% + 1px))',
};

export default function SeasonTimeline({ history, limit = 20, partnerKey = 'rider', partnerTitle = 'Rider' }) {
  const months = useMemo(() => {
    const keys = [];
    for (const r of history || []) {
      const k = monthKey(r.class_date);
      if (k && !keys.includes(k)) keys.push(k);
    }
    return keys.sort().reverse();
  }, [history]);
  const [month, setMonth] = useState('');
  const rounds = useMemo(() => {
    let list = [...(history || [])];
    if (month) list = list.filter((r) => monthKey(r.class_date) === month);
    else list = list.slice(0, limit);
    return list.reverse();
  }, [history, month, limit]);
  if (!(history || []).length) {
    return <p className="text-faint text-[13px] py-4">No rounds recorded yet — data is still empty.</p>;
  }
  // Group consecutive columns by month for a single spanning header.
  const groups = [];
  rounds.forEach((r, i) => {
    const m = monthOf(r.class_date);
    const last = groups[groups.length - 1];
    if (last && last.month === m) last.span += 1;
    else groups.push({ month: m || '—', span: 1, start: i });
  });
  const monthPicker = months.length > 0 ? (
    <div className="mb-3 flex items-center gap-2 text-[12px] text-muted">
      <label htmlFor="tl-month" className="uppercase tracking-wide text-[11px] text-faint font-bold">Month</label>
      <select
        id="tl-month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="rounded border border-line bg-ink px-2.5 py-1.5 text-[13px] text-white focus:border-gold/60 focus:outline-none"
      >
        <option value="">All months</option>
        {months.map((k) => (
          <option key={k} value={k}>{monthLabel(k)}</option>
        ))}
      </select>
    </div>
  ) : null;
  if (!rounds.length) {
    return (
      <>
        {monthPicker}
        <p className="text-faint text-[13px] py-4">No rounds in this month.</p>
      </>
    );
  }
  return (
    <>
      {monthPicker}
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-faint">
            <th className="px-2 py-2 font-semibold text-left sticky left-0 bg-card z-20">Season</th>
            {groups.map((g, i) => (
              <th key={i} colSpan={g.span} className="px-2 py-2 font-semibold text-center border-b border-line">
                {g.month}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line/50">
            <td className="px-2 py-2 text-muted sticky left-0 bg-card z-10">Place</td>
            {rounds.map((r, i) => (
              <td key={r.id || i} className="px-2 py-2 text-center font-semibold min-w-[64px]">
                {r.status !== 'finished'
                  ? ({ eliminated: 'E', retired: 'R', withdrawn: 'W', disqualified: 'DQ' }[r.status] || '–')
                  : (r.finish_place ?? '–')}
              </td>
            ))}
          </tr>
          <tr className="border-t border-line/50">
            <td className="px-2 py-2.5 text-muted sticky left-0 bg-card z-10">Clear / Faults</td>
            {rounds.map((r, i) => (
              <td key={r.id || i} className="px-2 py-2.5 text-center min-w-[64px]" style={TRACK}>
                <Dot r={r} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-line/50">
            <td className="px-2 py-2 text-muted sticky left-0 bg-card z-10">Height</td>
            {rounds.map((r, i) => (
              <td key={r.id || i} className="px-2 py-2 text-center tabular-nums min-w-[64px]">
                <b>{r.height_cm ? `${(Number(r.height_cm) / 100).toFixed(2)}` : '–'}</b>
                <span className="block text-[10px] text-faint font-normal">{dayOf(r.class_date) ? `${dayOf(r.class_date)} ${monthOf(r.class_date)}` : ''}</span>
              </td>
            ))}
          </tr>
          <tr className="border-t border-line/50">
            <td className="px-2 py-2 text-muted sticky left-0 bg-card z-10">{partnerTitle}</td>
            {rounds.map((r, i) => (
              <td key={r.id || i} className="px-2 py-2 text-center text-[12px] font-bold min-w-[64px]">{initials(r[partnerKey])}</td>
            ))}
          </tr>
        </tbody>
      </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted">
        <span className="font-bold text-white text-[13px]">Key</span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l2.29 6.84 7.22 0.07-5.8 4.3 2.17 6.88L12 15.9l-5.88 4.19 2.17-6.88-5.8-4.3 7.22-0.07z" fill="#FFD700" stroke="#00C853" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          Clear (edge = event)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l2.29 6.84 7.22 0.07-5.8 4.3 2.17 6.88L12 15.9l-5.88 4.19 2.17-6.88-5.8-4.3 7.22-0.07z" fill="#FFD700" /><text x="12" y="12.6" textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontWeight="800" fill="#0A0A0A">2</text></svg>
          Double clear
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: '#00C853' }} /> Normal Event
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: '#FF1744' }} /> Premier Event (incl. Grand Prix)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 h-3.5 rounded-full bg-card border-[3px] border-black" style={{ boxShadow: '0 0 0 1.5px #00C853' }} /> Jump-off class
        </span>
      </div>
    </>
  );
}
