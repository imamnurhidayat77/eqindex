// Season Timeline — Charles's sheet as a component: one column per round,
// chronological left to right, grouped by month. Dot colour = event profile
// (green Normal, red Premier/Grand Prix), bold black ring = jump-off class,
// number inside = faults (solid dot = clear).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const initials = (name) => String(name || '').trim().split(/\s+/)
  .slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '–';

const isPremier = (r) => r.event_tier === 'Premier' || r.event_tier === 'Grand Prix';
const isJumpOff = (r) => (r.class_format || '').toLowerCase() === 'jump-off';

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
      className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full text-[11px] font-extrabold tabular-nums"
      style={{
        background: clear ? color : '#141414',
        border: `${jumpOff ? 3 : 2}px solid ${jumpOff ? '#000' : color}`,
        boxShadow: jumpOff ? `0 0 0 1px ${color}` : 'none',
        color: clear ? '#0A0A0A' : color,
        outline: jumpOff ? '1px solid rgba(255,255,255,0.35)' : 'none',
      }}
    >
      {!clear && faults !== null ? faults : ''}
    </span>
  );
}

export default function SeasonTimeline({ history, limit = 12 }) {
  const rounds = [...(history || [])].slice(0, limit).reverse();
  if (!rounds.length) return null;
  const monthOf = (ds) => {
    const d = new Date(ds);
    if (Number.isNaN(d.getTime())) return '';
    return MONTHS[d.getMonth()];
  };
  return (
    <>
      <div className="overflow-x-auto">
      <table className="border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
            <th className="px-2 py-2 font-semibold sticky left-0 bg-card">Season</th>
            {rounds.map((r, i) => (
              <th key={r.id || i} className="px-2 py-2 font-semibold text-center min-w-[52px]">
                {monthOf(r.class_date) || '—'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line/50">
            <td className="px-2 py-2 text-muted sticky left-0 bg-card">Place</td>
            {rounds.map((r, i) => (
              <td key={r.id || i} className="px-2 py-2 text-center font-semibold">
                {r.status !== 'finished'
                  ? ({ eliminated: 'E', retired: 'R', withdrawn: 'W', disqualified: 'DQ' }[r.status] || '–')
                  : (r.finish_place ?? '–')}
              </td>
            ))}
          </tr>
          <tr className="border-t border-line/50">
            <td className="px-2 py-2 text-muted sticky left-0 bg-card">Clear / Faults</td>
            {rounds.map((r, i) => (
              <td key={r.id || i} className="px-2 py-2 text-center"><Dot r={r} /></td>
            ))}
          </tr>
          <tr className="border-t border-line/50">
            <td className="px-2 py-2 text-muted sticky left-0 bg-card">Height</td>
            {rounds.map((r, i) => (
              <td key={r.id || i} className="px-2 py-2 text-center tabular-nums">
                <b>{r.height_cm ? `${(Number(r.height_cm) / 100).toFixed(2)}` : '–'}</b>
              </td>
            ))}
          </tr>
          <tr className="border-t border-line/50">
            <td className="px-2 py-2 text-muted sticky left-0 bg-card">Rider</td>
            {rounds.map((r, i) => (
              <td key={r.id || i} className="px-2 py-2 text-center text-[12px] font-bold">{initials(r.rider)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      </div>
      <div className="mt-3 space-y-1 text-[12px] text-muted">
        <div className="font-bold text-white text-[13px]">Key</div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: '#00C853' }} /> Normal Event
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: '#FF1744' }} /> Premier Event (incl. Grand Prix)
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3.5 h-3.5 rounded-full border-[3px] border-black" style={{ boxShadow: '0 0 0 1px #00C853' }} /> Jump-off class
        </div>
      </div>
    </>
  );
}
