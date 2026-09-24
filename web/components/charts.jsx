// Server-rendered SVG charts (no JS needed).
export function Sparkline({ data, color = '#FFD700', w = 80, h = 28 }) {
  if (!data || data.length < 2) {
    return <svg width={w} height={h}><line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke={color} strokeWidth="1.5" /></svg>;
  }
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ');
  return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" /></svg>;
}

export function ScoreRing({ score, size = 110, color = '#FFD700' }) {
  const r = (size - 12) / 2, c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A2A2A" strokeWidth="7" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${(c * frac).toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="round" />
      <text x="50%" y="47%" textAnchor="middle" fill="#fff" fontSize="30" fontWeight="800">{score}</text>
      <text x="50%" y="65%" textAnchor="middle" fill="#A0A0A0" fontSize="10">EQ SCORE</text>
    </svg>
  );
}

export function TrendChart({ labels, seriesA, seriesB, eq = '', w = 640, h = 230 }) {
  const padL = 8, padB = 22, padT = 10;
  const W = w - padL - 8, H = h - padB - padT;
  const X = (i) => padL + (i / Math.max(labels.length - 1, 1)) * W;
  const Y = (v) => padT + (1 - Math.max(0, Math.min(100, Number(v))) / 100) * H;
  const line = (s) => s.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const last = seriesA.length - 1;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      {[0, 25, 50, 75, 100].map((g) => (
        <line key={g} x1={padL} y1={Y(g)} x2={padL + W} y2={Y(g)} stroke="#2A2A2A" strokeDasharray="4 3" />
      ))}
      {labels.map((l, i) => (
        <text key={i} x={X(i)} y={h - 6} fill="#666666" fontSize="10" textAnchor="middle">{l}</text>
      ))}
      <polyline points={line(seriesB)} fill="none" stroke="#00C853" strokeWidth="2" />
      <polyline points={line(seriesA)} fill="none" stroke="#FFD700" strokeWidth="2" />
      {last >= 0 && (
        <g>
          <rect x={Math.min(X(last) - 150, w - 170)} y={Y(seriesA[last]) - 58} width="160" height="48" rx="6" fill="#1C2330" stroke="#2A2A2A" />
          <text x={Math.min(X(last) - 142, w - 162)} y={Y(seriesA[last]) - 40} fill="#FFD700" fontSize="11" fontWeight="700">Featured (Current)</text>
          <text x={Math.min(X(last) - 142, w - 162)} y={Y(seriesA[last]) - 26} fill="#A0A0A0" fontSize="11">Clear rate: {Number(seriesA[last]).toFixed(0)}%</text>
          <text x={Math.min(X(last) - 142, w - 162)} y={Y(seriesA[last]) - 14} fill="#A0A0A0" fontSize="11">EQ Score: {eq}</text>
        </g>
      )}
    </svg>
  );
}

export function HBar({ value, max, color }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100));
  return <div className="bar"><div style={{ width: `${pct}%`, background: color }} /></div>;
}
