'use client';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IconSearch = ({ className } = {}) => (
  <svg className={className} viewBox="0 0 24 24" {...P} aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.8-3.8" />
  </svg>
);
export const IconHeart = ({ className, filled = false } = {}) => (
  <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20.5C7 16.5 3 13.2 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.5 0 4.7 1.9 4.7 4.8 0 3.9-4 7.2-9 11.2z" />
  </svg>
);
export const IconUser = ({ className } = {}) => (
  <svg className={className} viewBox="0 0 24 24" {...P} aria-hidden="true">
    <circle cx="12" cy="8" r="4" /><path d="M4 20.5c0-3.9 3.6-6.5 8-6.5s8 2.6 8 6.5" />
  </svg>
);
export const IconBell = ({ className } = {}) => (
  <svg className={className} viewBox="0 0 24 24" {...P} aria-hidden="true">
    <path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15C6 15 6 13.5 6 9.5" />
    <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
  </svg>
);
export const IconArrow = ({ className } = {}) => (
  <svg className={className} viewBox="0 0 24 24" {...P} aria-hidden="true">
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);
export const IconClose = ({ className } = {}) => (
  <svg className={className} viewBox="0 0 24 24" {...P} aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconPin = ({ className } = {}) => (
  <svg className={className} viewBox="0 0 24 24" {...P} aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 12 3a7 7 0 0 1 7 6.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
export const IconCal = ({ className } = {}) => (
  <svg className={className} viewBox="0 0 24 24" {...P} aria-hidden="true">
    <rect x="4" y="5.5" width="16" height="15" rx="2" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </svg>
);
export const IconHome = ({ className } = {}) => (
  <svg className={className} viewBox="0 0 24 24" {...P} aria-hidden="true">
    <path d="M4 11.5L12 4l8 7.5M6 10v9.5h12V10" />
  </svg>
);
export const IconGrid = ({ className } = {}) => (
  <svg className={className} viewBox="0 0 24 24" {...P} aria-hidden="true">
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);
