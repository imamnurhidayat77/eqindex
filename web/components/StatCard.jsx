// Shared stat-card primitives — one tidy visual language for every metric
// grid on EQIndex (profiles, events, dashboard, series, stable, about).
// Server-safe: sparklines are fixed-size inline SVG, no chart library needed.
//
// Layout contract (identical on every page):
//   row 1: truncated UPPERCASE label + delta (plain or pill)
//   row 2: 26px tabular value + fixed 76×30 sparkline (or sub-line)
// Cards share min-height so rows stay aligned across breakpoints.

const TONE = {
  gold: 'text-gold',
  mint: 'text-moss',
  blood: 'text-blood',
  faint: 'text-faint',
};

const PILL_TONE = {
  gold: 'text-gold bg-goldbg/40',
  mint: 'text-moss bg-greenbg/40',
  blood: 'text-blood bg-redbg/40',
  faint: 'text-faint bg-line/60',
};

// Fixed-size SVG sparkline. Thin data (<2 points) and flat series render the
// same centered dashed track in every card — never a misleading floating line.
export function StatSpark({ data, color = '#FFD700', w = 76, h = 30 }) {
  const vals = (data || []).map(Number).filter((v) => Number.isFinite(v));
  const track = (
    <line x1="2" y1={h / 2} x2={w - 2} y2={h / 2} stroke={color} strokeWidth="1.5"
      strokeDasharray="3 3" strokeLinecap="round" opacity="0.45" />
  );
  if (vals.length < 2) {
    return (
      <svg width={w} height={h} className="shrink-0" aria-hidden="true" role="presentation">{track}</svg>
    );
  }
  const min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) {
    return (
      <svg width={w} height={h} className="shrink-0" aria-hidden="true" role="presentation">{track}</svg>
    );
  }
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((v - min) / (max - min)) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastY = h - 3 - ((vals[vals.length - 1] - min) / (max - min)) * (h - 6);
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden="true" role="presentation">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w - 2} cy={lastY.toFixed(1)} r={2.5} fill={color} />
    </svg>
  );
}

export function StatCard({
  label,
  delta = null,
  tone = 'gold',
  pill = false,
  value,
  valueTone = null,
  sub = null,
  subTone = 'muted',
  spark = null,
  sparkColor = '#FFD700',
  highlight = false,
  title = null,
}) {
  const hasDelta = delta !== null && delta !== undefined && delta !== '';
  const hasSub = sub !== null && sub !== undefined && sub !== '';
  const subCls = subTone === 'muted' ? 'text-muted' : subTone === 'gold' ? 'text-gold' : subTone === 'moss' ? 'text-moss' : 'text-faint';
  const valueCls = valueTone === 'blood' ? 'text-blood' : highlight ? 'text-gold' : '';
  const labelText = typeof label === 'string' ? label : undefined;
  return (
    <div
      title={title || labelText}
      className={`rounded border bg-card p-4 flex flex-col min-h-[118px] ${highlight ? 'border-gold/60' : 'border-line'}`}
    >
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.4px] text-muted">{label}</div>
      <div className="mt-2 flex flex-1 items-end justify-between gap-2">
        <span className={`text-[26px] font-extrabold leading-none tabular-nums ${valueCls}`}>{value}</span>
        {spark && <StatSpark data={spark} color={sparkColor} />}
      </div>
      <div className="mt-1.5 min-h-[18px] truncate text-[12px] tabular-nums">
        {hasDelta && (pill ? (
          <span className={`inline-block whitespace-nowrap rounded-full px-2 py-px text-[11px] font-bold ${PILL_TONE[tone] || PILL_TONE.gold}`}>{delta}</span>
        ) : (
          <span className={`font-semibold ${TONE[tone] || TONE.gold}`}>{delta}</span>
        ))}
        {hasDelta && hasSub && <span className="text-faint"> · </span>}
        {hasSub && <span className={subCls}>{sub}</span>}
      </div>
    </div>
  );
}

const GRID_COLS = {
  7: 'grid-cols-2 sm:grid-cols-4 xl:grid-cols-7',
  6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
  5: 'grid-cols-2 md:grid-cols-5',
  4: 'grid-cols-2 lg:grid-cols-4',
  3: 'grid-cols-1 md:grid-cols-3',
  2: 'grid-cols-2',
};

export function StatGrid({ children, cols = 7, className = '' }) {
  return (
    <div className={`grid gap-3 mb-6 ${GRID_COLS[cols] || GRID_COLS[7]} ${className}`}>
      {children}
    </div>
  );
}
