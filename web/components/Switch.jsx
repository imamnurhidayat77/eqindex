// Canonical on/off switch — the one sliding control for every toggle in the
// app (admin tables, class/event switches, alert prefs, privacy opt-out).
// role="switch" + keyboard-focusable; moss = on, neutral = off.

export default function Switch({ on, onFlip, label, disabled = false, size = 'md' }) {
  const track = size === 'sm' ? 'w-8 h-[18px]' : 'w-10 h-[22px]';
  const knob = size === 'sm' ? 'w-[14px] h-[14px]' : 'w-[18px] h-[18px]';
  const slide = size === 'sm' ? 'ml-[16px]' : 'ml-[20px]';
  return (
    <button
      type="button" role="switch" aria-checked={!!on} aria-label={label}
      aria-disabled={disabled} disabled={disabled} onClick={onFlip}
      className={`${track} rounded-full shrink-0 transition-colors disabled:opacity-40 disabled:cursor-wait ${
        on ? 'bg-moss' : 'bg-barbg hover:bg-line'
      }`}
    >
      <span className={`block ${knob} rounded-full bg-white mt-[2px] transition-all ${on ? slide : 'ml-[2px]'}`} />
    </button>
  );
}

// Switch with a small ON/OFF caption — for table cells and settings rows.
export function LabeledSwitch({ on, onFlip, label, disabled = false, size = 'md', onText = 'ON', offText = 'OFF' }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Switch on={on} onFlip={onFlip} label={label} disabled={disabled} size={size} />
      <span className={`text-[11px] font-bold tabular-nums ${on ? 'text-moss' : 'text-faint'}`}>
        {disabled ? '…' : on ? onText : offText}
      </span>
    </span>
  );
}
