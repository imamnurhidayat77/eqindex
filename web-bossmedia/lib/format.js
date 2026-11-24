const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Short NZ day stamp used across receipts, account, library. Bad input
// renders an em dash, never "Invalid Date".
export const fmtDay = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// Event date range: "17 – 20 Mar 2027", "28 Mar – 2 Apr 2027", one day "5 Mar 2027".
export const fmtRange = (startIso, endIso) => {
  const a = new Date(startIso);
  const b = new Date(endIso || startIso);
  if (Number.isNaN(a.getTime())) return '—';
  if (Number.isNaN(b.getTime()) || a.toDateString() === b.toDateString()) return fmtDay(startIso);
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = sameYear && a.getMonth() === b.getMonth() ? `${a.getDate()}`
    : sameYear ? `${a.getDate()} ${MONTHS[a.getMonth()]}` : fmtDay(startIso);
  return `${left} – ${fmtDay(endIso)}`;
};
