'use client';
import {
  AreaChart, Area, Bar, CartesianGrid, ComposedChart, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CARD } from '../lib/tokens';

const tip = { backgroundColor: '#1C2330', border: '1px solid #2A2A2A', borderRadius: 8, fontSize: 12 };

// Platform throughput: competition rounds (by class date) + imported rows.
// Server component fetches /admin/stats/daily and passes {rows, summary}.
export default function AdminCharts({ rows = [], summary = null }) {
  const data = rows.map((r) => ({
    ...r,
    label: String(r.day || '').slice(0, 10).slice(5).replace('-', '/'),
  }));
  const avg = summary && summary.days ? Math.round(summary.totalRounds / summary.days) : 0;
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-3">
        <h2 className="text-[15px] font-bold">Platform throughput</h2>
        {summary && (
          <span className="text-[12px] text-muted">
            Last {summary.days}d · <b className="text-gold">{summary.totalRounds.toLocaleString()}</b> rounds
            {' · '}<b className="text-sky">{summary.totalImported.toLocaleString()}</b> imported rows
            {' · '}~{avg}/day
          </span>
        )}
      </div>
      {data.length > 1 ? (
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#2A2A2A" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="imported" name="Imported rows" fill="#4FC3F7" opacity={0.55} />
              <Area type="monotone" dataKey="rounds" name="Rounds" stroke="#FFD700" fill="#FFD700" fillOpacity={0.18} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-muted text-sm py-6 text-center">Not enough daily data yet — import results to light up this chart.</p>
      )}
    </section>
  );
}
