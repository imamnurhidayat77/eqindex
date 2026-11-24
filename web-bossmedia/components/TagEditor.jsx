'use client';
import s from './TagEditor.module.css';

// Buyer tag editor: class + moment, direct and instant, design-scoped
// (migrations 096/097). Applies to THIS sponsor design only — preview +
// baked file. The canonical media row is untouched. Empty = original.
// The moment is stored as the design's `result` text (max 40 chars).
// Changes report upward live; the parent (or modal) persists the draft.
const MOMENT_PRESETS = ['Winner', 'Clear round', '2nd place', '3rd place', 'Personal best', 'First show'];

// hint: what the photo already says (shown as the placeholder, used when
// the field stays empty).
export default function TagEditor({ value, onChange, hint = {} }) {
  const v = value || { class: '', result: '' };
  const set = (patch) => onChange?.({ ...v, ...patch });
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label className={s.label}>Class
        <input className={s.input} value={v.class} onChange={(e) => set({ class: e.target.value.slice(0, 100) })}
          placeholder={hint.class ? `${hint.class} (from photo)` : 'e.g. 1.20m Grand Prix'} maxLength={100} />
      </label>
      <label className={s.label}>Moment
        <input className={s.input} value={v.result} onChange={(e) => set({ result: e.target.value.slice(0, 40) })}
          placeholder={hint.result ? `${hint.result} (from photo)` : 'e.g. Winner, Clear round, 2nd place'} maxLength={40} />
      </label>
      <div className={s.presets} role="group" aria-label="Quick moments">
        {MOMENT_PRESETS.map((m) => (
          <button key={m} type="button" className={s.preset} aria-pressed={v.result === m}
            onClick={() => set({ result: v.result === m ? '' : m })}>
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
