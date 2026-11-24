// Show-jumping dates are New Zealand calendar days. The API returns them as
// timestamps whose UTC date depends on the API server's timezone, so never
// slice the raw string. Format in NZ time instead.
const NZ = 'Pacific/Auckland';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ISO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: NZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// 'YYYY-MM-DD' (NZ calendar day) or '' when missing/invalid.
export function nzDay(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : ISO_DAY.format(d);
}

const parts = (v) => {
  const k = nzDay(v);
  if (!k) return null;
  const [y, m, d] = k.split('-').map(Number);
  return { y, m, d };
};

// '10 Oct 2026', or '—'.
export function fmtDay(v) {
  const p = parts(v);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : '—';
}

// '10–11 Oct 2026', '30 Sep – 2 Oct 2026', '30 Dec 2026 – 2 Jan 2027'.
export function fmtRange(start, end) {
  const a = parts(start);
  if (!a) return 'Date TBC';
  const b = parts(end);
  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) return fmtDay(start);
  if (a.y !== b.y) return `${fmtDay(start)} – ${fmtDay(end)}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}
