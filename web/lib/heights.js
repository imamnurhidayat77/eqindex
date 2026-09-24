// Shared height-band vocabulary — single source of truth.
// Used by dashboard Filters (?height=), rankings chips, and list FilterBars.
// NOTE: keep this module free of 'use client' so server components can import it.
export const HEIGHT_BANDS = [
  { v: '', label: 'All heights' },
  { v: '110-120', label: '1.10m – 1.20m' },
  { v: '120-130', label: '1.20m – 1.30m' },
  { v: '130-140', label: '1.30m – 1.40m' },
  { v: '140-', label: '1.40m+' },
];

export function heightParams(band) {
  if (!band) return {};
  const [lo, hi] = String(band).split('-');
  const p = {};
  if (lo) p.height_min = lo;
  if (hi) p.height_max = hi;
  return p;
}

export function heightLabel(band) {
  return (HEIGHT_BANDS.find((h) => h.v === band) || {}).label || band || 'All heights';
}
