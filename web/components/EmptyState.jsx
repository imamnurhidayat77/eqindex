// Professional empty-state primitives — one visual language for every
// "no data" moment across EQIndex: icon medallion, title, hint, optional action.
// Palette + radii follow the Bloomberg-terminal dark identity (see tailwind.config).

// Inline section empty state (works inside CARD sections and plain blocks).
export function EmptyState({ icon = '◇', title = 'Nothing here yet', hint = null, action = null, compact = false }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'px-4 py-8' : 'px-4 py-10'}`}>
      <span
        aria-hidden="true"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card2 text-lg text-gold/80"
      >
        {icon}
      </span>
      <div className="mt-3 text-[14px] font-bold text-white">{title}</div>
      {hint && <p className="mt-1 max-w-[440px] text-[13px] leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// Table-safe wrapper: <TableEmpty colSpan={n} … /> renders a full-width row.
export function TableEmpty({ colSpan = 99, icon, title, hint, action }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-2">
        <EmptyState icon={icon} title={title} hint={hint} action={action} compact />
      </td>
    </tr>
  );
}

// Professional missing-value glyph for table cells: consistent, with a tooltip.
export function Dash({ label = 'Not recorded' }) {
  return (
    <span className="text-faint" title={label}>
      —
    </span>
  );
}
