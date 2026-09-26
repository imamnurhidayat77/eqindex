'use client';

// Client-side CSV export of a competition history array (briefing §7C).
export default function ExportCsv({ rows, filename }) {
  function download() {
    const cols = ['date', 'event', 'class', 'height_cm', 'partner', 'jump_faults', 'time_faults', 'total_faults', 'placing', 'points', 'status'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')];
    for (const r of rows || []) {
      lines.push([
        (r.class_date || '').slice(0, 10), r.event_name || '', r.class_name || '',
        r.height_cm ?? '', r.rider || r.horse || '',
        r.jump_faults ?? '', r.time_faults ?? '', r.total_faults ?? '',
        r.finish_place ?? '', r.points ?? '', r.status || '',
      ].map(q).join(','));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = filename || 'competition-record.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  if (!rows || !rows.length) return null;
  return (
    <button onClick={download}
      className="rounded border border-line bg-card2 px-2.5 py-1 text-[12px] font-semibold text-muted hover:text-gold hover:border-gold/50">
      ⤓ Export CSV
    </button>
  );
}
