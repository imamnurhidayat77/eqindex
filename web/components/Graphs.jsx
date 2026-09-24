'use client';
import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { eqScore } from '../lib/eq';

const tip = { backgroundColor: '#1C2330', border: '1px solid #2A3342', borderRadius: 8, fontSize: 12 };

function seasonOf(m) {
  const d = new Date(m);
  const y = d.getFullYear(), mo = d.getMonth() + 1;
  return mo >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export function Spark({ data, color = '#E8B44A' }) {
  const rows = data.map((v, i) => ({ i, v: Number(v) }));
  return (
    <ResponsiveContainer width={80} height={28}>
      <LineChart data={rows} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TrendPanel({ monthly, horseName, eq }) {
  const [mode, setMode] = useState('monthly');
  const [hidden, setHidden] = useState({});
  let rows = monthly.map((x) => ({
    label: x.month,
    clear: Number(x.clear_pct),
    dev: Math.min(100, eqScore(x.clear_pct, x.avg_faults, x.starts)),
  }));
  if (mode === 'season' && monthly.length) {
    const byS = {};
    monthly.forEach((x) => {
      const s = seasonOf(x.m);
      (byS[s] ||= { label: s.replace('-', '/'), cw: 0, cs: 0, dw: 0, ds: 0 });
      byS[s].cw += Number(x.clear_pct) * Number(x.starts);
      byS[s].cs += Number(x.starts);
      const dev = Math.min(100, eqScore(x.clear_pct, x.avg_faults, x.starts));
      byS[s].dw += dev * Number(x.starts);
      byS[s].ds += Number(x.starts);
    });
    rows = Object.values(byS).map((g) => ({
      label: g.label, clear: g.cs ? g.cw / g.cs : 0, dev: g.ds ? g.dw / g.ds : 0,
    }));
  }
  const toggle = (k) => setHidden((h) => ({ ...h, [k]: !h[k] }));
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div className="flex gap-1 bg-card2 rounded-lg p-[3px] text-xs">
          <span className={`px-2.5 py-1 rounded-md ${mode === 'monthly' ? 'bg-line text-body' : 'text-muted'}`} style={{ cursor: 'pointer' }} onClick={() => setMode('monthly')}>Monthly</span>
          <span className={`px-2.5 py-1 rounded-md ${mode === 'season' ? 'bg-line text-body' : 'text-muted'}`} style={{ cursor: 'pointer' }} onClick={() => setMode('season')}>Season</span>
        </div>
      </div>
      <div className="flex gap-4 text-xs text-muted mb-2">
        <span><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: '#E8B44A' }} />Clear Round %</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: '#3FB96B' }} />EQ Development</span>
        <span style={{ marginLeft: 'auto' }}>Click metric to isolate</span>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={rows} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#232B38" strokeDasharray="4 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#5C6675', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: '#5C6675', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tip} labelStyle={{ color: '#fff' }} />
          <Legend onClick={(e) => toggle(e.dataKey)} wrapperStyle={{ cursor: 'pointer', fontSize: 12 }} />
          {!hidden.clear && <Line type="monotone" dataKey="clear" name={`${horseName} clear %`} stroke="#E8B44A" strokeWidth={2} dot={{ r: 2 }} />}
          {!hidden.dev && <Line type="monotone" dataKey="dev" name="EQ Development" stroke="#3FB96B" strokeWidth={2} dot={{ r: 2 }} />}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-muted text-xs">Featured EQ Score: <b className="text-gold">{eq}</b></p>
    </>
  );
}

export function BenchChart({ items }) {
  // items: [{label, short, mine, avg, text, color}] — one scaled mini-chart per metric
  return (
    <>
      {items.map((x) => {
        const mx = Math.max(Number(x.mine), Number(x.avg), 0.01);
        const rows = [
          { who: x.short, v: Number(x.mine) },
          { who: 'Avg.', v: Number(x.avg) },
        ];
        return (
          <div className="my-3" key={x.label}>
            <div className="flex justify-between text-[13px] mb-[5px]"><span>{x.label}</span><span className="text-muted">{x.text}</span></div>
            <ResponsiveContainer width="100%" height={64}>
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                <XAxis type="number" hide domain={[0, mx]} />
                <YAxis type="category" dataKey="who" tick={{ fill: '#8B94A3', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                <Tooltip contentStyle={tip} cursor={{ fill: '#1C2330' }} />
                <Bar dataKey="v" radius={[0, 4, 4, 0]} background={{ fill: '#232B38', radius: 4 }} isAnimationActive={false}>
                  <Cell fill={x.color} />
                  <Cell fill="#3a4356" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </>
  );
}
