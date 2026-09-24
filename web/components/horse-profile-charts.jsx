'use client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

const tip = { backgroundColor: '#1C2330', border: '1px solid #2A2A2A', borderRadius: 8, fontSize: 12 };

export function Spark({ data, color = '#FFD700' }) {
  if (!data || data.length < 2) {
    return (
      <svg width="72" height="26" className="overflow-visible">
        <line x1="0" y1="13" x2="72" y2="13" stroke={color} strokeWidth="1.5" opacity="0.7" />
      </svg>
    );
  }
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const w = 72, h = 26;
  const pts = data.map((v, i) =>
    `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function EQMonthlyChart({ rows }) {
  const data = (rows || []).map((r) => ({
    label: r.month,
    EQ: Number(r.eq),
    Circuit: Number(r.baseline ?? 62),
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: -22, bottom: 0 }}>
        <CartesianGrid stroke="#2A2A2A" strokeDasharray="4 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#666666', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: '#666666', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tip} labelStyle={{ color: '#fff' }} />
        <Line type="monotone" dataKey="EQ" stroke="#FFD700" strokeWidth={2} dot={{ r: 2.5, fill: '#FFD700' }} />
        <Line type="monotone" dataKey="Circuit" stroke="#2A2A2A" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MiniTrend({ rows, dataKey = 'v', color = '#00C853' }) {
  const data = (rows || []).map((r, i) => ({ i: r.label ?? i, v: Number(r[dataKey] ?? r.v ?? 0) }));
  return (
    <ResponsiveContainer width="100%" height={64}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <CartesianGrid stroke="#2A2A2A" strokeDasharray="4 3" vertical={false} />
        <XAxis dataKey="i" hide />
        <YAxis tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} width={30} domain={['auto', 'auto']} />
        <Tooltip contentStyle={tip} labelStyle={{ color: '#fff' }} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
