'use client';
import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

const tip = { backgroundColor: '#1C2330', border: '1px solid #2A3342', borderRadius: 8, fontSize: 12 };

export function RiderSeasonChart({ monthly, season, riderName, eq }) {
  const [mode, setMode] = useState('monthly');
  const rows = mode === 'monthly' ? monthly : season;
  return (
    <div>
      <div className="mb-2 flex justify-end gap-1 rounded-lg bg-card2 p-1 text-[12px] w-fit ml-auto">
        {['monthly', 'season'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1 font-semibold capitalize ${mode === m ? 'bg-[#2a3342] text-white' : 'text-muted hover:text-white'}`}
          >
            {m === 'monthly' ? 'Monthly' : 'Season'}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={rows} margin={{ top: 10, right: 12, left: -22, bottom: 0 }}>
          <CartesianGrid stroke="#232B38" strokeDasharray="4 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#5C6675', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: '#5C6675', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tip} labelStyle={{ color: '#fff' }} />
          <Line type="monotone" dataKey="eq" name={`${riderName} (Current)`} stroke="#E8B44A" strokeWidth={2} dot={{ r: 2.5, fill: '#E8B44A' }} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[12px] text-muted">{riderName} (Current) · Rider EQ Score: <b className="text-gold">{eq}</b></p>
    </div>
  );
}

export function RiderMiniTrend({ rows, color = '#3FB96B' }) {
  return (
    <ResponsiveContainer width="100%" height={64}>
      <LineChart data={rows} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <CartesianGrid stroke="#232B38" strokeDasharray="4 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#5C6675', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#5C6675', fontSize: 9 }} axisLine={false} tickLine={false} width={30} domain={['auto', 'auto']} />
        <Tooltip contentStyle={tip} labelStyle={{ color: '#fff' }} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
