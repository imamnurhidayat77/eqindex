// Season Timeline — Charles's sheet as a component: one column per round,
// chronological left to right, months grouped across the top. Dot colour =
// event profile (green Normal, red Premier/Grand Prix), bold black ring =
// jump-off class, number inside = faults (solid dot = clear).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function Dot({ r }) {
  const premier = isPremier(r);
  const jumpOff = isJumpOff(r);
  const clear = !!r.clear_round;
  const faults = r.total_faults === null || r.total_faults === undefined ? null : Number(r.total_faults);
  const color = premier ? '#FF1744' : '#00C853';
  const title = `${r.event_name || ''} — ${r.class_name || ''}${faults === null ? '' : faults === 0 ? ' · clear' : ` · ${faults} faults`}${jumpOff ? ' · jump-off' : ''}`;
  return (
    <span
      title={title}
      className="relative z-10 inline-flex items-center justify-center w-[28px] h-[28px] rounded-full text-[12px] font-extrabold tabular-nums bg-card"
      style={{
        border: `${jumpOff ? 3 : 2}px solid ${jumpOff ? '#000' : color}`,
        boxShadow: jumpOff ? `0 0 0 1.5px ${color}, 0 0 0 3px #000` : `0 0 0 3px #141414`,
        color: clear ? color : '#fff',
        background: clear ? color : '#141414',
      }}
    >
      {!clear && faults !== null ? <span style={{ color }}>{faults}</span> : null}
    </span>
  );
}

// Horizontal connector drawn through the middle of each dot cell.
const TRACK = {
  background: 'linear-gradient(to bottom, transparent calc(50% - 1px), #333  calc(50% - 1px), #333 calc(50% + 1px), transparent calc(50% + 1px))',
};

export default function SeasonTimeline({ history, limit = 20 }) {
  const rounds = [...(history || [])].slice(0, limit).reverse();
  if (!rounds.length) return null;
  // Group consecutive columns by month for a single spanning header.
  const groups = [];
  rounds.forEach((r, i) => {
    const m = monthOf(r.class_date);
    const last = groups[groups.length - 1];
    if (last && last.month === m) last.span += 1;
    else groups.push({ month: m || '—', span: 1, start: i });
  });
  return (
    <>
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
            <td className="px-2 py-2 text-muted sticky left-0 bg-card z-10">Rider</td>
            {rounds.map((r, i) => (
              <td key={r.id || i} className="px-2 py-2 text-center text-[12px] font-bold min-w-[64px]">{initials(r.rider)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted">
        <span className="font-bold text-white text-[13px]">Key</span>
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
