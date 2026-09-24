'use client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function MiniTrend({ points, color = '#E8B44A' }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid stroke="#232B38" strokeDasharray="4 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#5C6675', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: '#5C6675', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
        <Tooltip contentStyle={{ backgroundColor: '#1C2330', border: '1px solid #2A3342', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#fff' }} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
