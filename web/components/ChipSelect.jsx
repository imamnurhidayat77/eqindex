'use client';
import { useRouter } from 'next/navigation';
import Dropdown from './Dropdown';

// Navigating pill-dropdown for server-rendered filter chips (rankings).
// options: [{ value, label, href }].
export default function ChipSelect({ label, value, options, clearHref, active }) {
  const router = useRouter();
  return (
    <span className={`inline-flex items-center gap-1 bg-card2 border rounded-full pl-3 pr-1.5 py-[4px] text-xs whitespace-nowrap ${active ? 'border-gold/60' : 'border-line'}`}>
      <span className="text-faint">{label}</span>
      <Dropdown
        variant="bare" ariaLabel={label} value={value} options={options}
        onSelect={(o) => { if (o.href) router.push(o.href); }}
        menuClassName="min-w-[170px]"
      />
      {clearHref && (
        <a href={clearHref} className="ml-0.5 w-[18px] h-[18px] rounded-full bg-line text-muted hover:text-white text-[11px] leading-none inline-flex items-center justify-center no-underline">×</a>
      )}
    </span>
  );
}
