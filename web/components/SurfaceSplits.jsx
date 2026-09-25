// Server component: arena × surface performance splits.
export default function SurfaceSplits({ rows, subject }) {
  const list = (rows || []).filter((r) => Number(r.starts) > 0);
  if (!list.length) return null;
  const known = list.filter((r) => r.surface && r.surface !== 'Unknown');
  return (
    <>
      <h2 className="text-[15px] font-bold">Surface Splits</h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted">
        How {subject} performs by arena type and surface — one venue can host many arenas.
      </p>
      <section className="mb-6 overflow-x-auto rounded border border-line bg-card">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="border-b border-line px-3 py-2.5 font-semibold">Arena</th>
              <th className="border-b border-line px-3 py-2.5 font-semibold">Surface</th>
              <th className="border-b border-line px-3 py-2.5 text-right font-semibold">Rounds</th>
              <th className="border-b border-line px-3 py-2.5 text-right font-semibold">Clear %</th>
              <th className="border-b border-line px-3 py-2.5 text-right font-semibold">Avg Faults</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i} className="border-b border-line/50 last:border-0 hover:bg-white/[0.02]">
                <td className="px-3 py-2.5">{r.arena_type}</td>
                <td className="px-3 py-2.5 text-muted">{r.surface}</td>
                <td className="px-3 py-2.5 text-right text-muted">{r.starts}</td>
                <td className={`px-3 py-2.5 text-right font-bold ${Number(r.clear_pct) >= 60 ? 'text-mint' : ''}`}>{Number(r.clear_pct).toFixed(0)}%</td>
                <td className="px-3 py-2.5 text-right text-muted">{Number(r.avg_faults).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {!known.length && (
        <p className="-mt-3 mb-6 text-[12px] text-faint">Surfaces not yet recorded for these classes — organisers can add them per class.</p>
      )}
    </>
  );
}
