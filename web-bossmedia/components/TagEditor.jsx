'use client';
import s from './TagEditor.module.css';

// Buyer tag editor: class + win flag, direct and instant, design-scoped
// (migration 096). Applies to THIS sponsor design only — preview + baked
// file. The canonical media row is untouched. Empty class = original class.
// Changes report upward live; the parent (or modal) persists the draft.
export default function TagEditor({ value, onChange }) {
  const v = value || { class: '', result: '' };
  const set = (patch) => onChange?.({ ...v, ...patch });
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label className={s.label}>Class
        <input className={s.input} value={v.class} onChange={(e) => set({ class: e.target.value.slice(0, 100) })}
          placeholder="e.g. 1.20m Grand Prix" maxLength={100} />
      </label>
      <label className={s.label}>Result
        <input className={s.input} value={v.result} onChange={(e) => set({ result: e.target.value.slice(0, 40) })}
          placeholder="e.g. Clear, 1st — winners unlock winner posters" maxLength={40} />
      </label>
    </div>
  );
}
