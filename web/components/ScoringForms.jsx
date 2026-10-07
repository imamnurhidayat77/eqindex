'use client';
// Shared scoring-form primitives + Model B editor, used by both
// /admin/scoring (series rules) and /admin/rating (EQIndex rating).
import { INP } from '../lib/tokens';

export const Sec = ({ title, hint, children }) => (
  <div className="rounded border border-line bg-card2/50 p-3.5 mb-3">
    <div className="text-[13px] font-bold">{title}</div>
    {hint && <div className="text-[12px] text-muted mt-0.5 mb-2">{hint}</div>}
    {children}
  </div>
);
export const Fld = ({ label, children }) => (
  <label className="text-[12px] text-muted flex flex-col gap-1">{label}{children}</label>
);
// Number input that also accepts comma decimals (id locale keyboards).
const parseNumInput = (raw) => {
  if (raw === '') return null;
  const v = Number(String(raw).replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
};
export const Num = ({ value, onChange, min, step = 1, width = 88 }) => (
  <input className={INP} type="number" min={min} step={step} style={{ width, textAlign: 'center', paddingLeft: 6, paddingRight: 6 }}
    value={value ?? ''} onChange={(e) => onChange(parseNumInput(e.target.value))} />
);
export const Txt = ({ value, onChange, placeholder, width }) => (
  <input className={INP} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder} style={width ? { width } : { width: '100%' }} />
);
export const Check = ({ value, onChange, label }) => (
  <label className="text-[12px] text-muted flex items-center gap-2 cursor-pointer">
    <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="accent-gold w-4 h-4" />
    {label}
  </label>
);
export const csvGet = (arr) => (arr || []).join(', ');
export const csvSet = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

// ---- Series draft editor (no raw JSON) ----
export const parsePairs = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
  const [a, b] = x.split(':').map((y) => y.trim());
  return [a, b];
});
export const fmtSliding = (sl) => (sl || []).map(([h, c]) => `${h}:${c}`).join(', ');
export const parseSliding = (s) => parsePairs(s).map(([h, c]) => [Number(h), Number(c)]).filter(([h, c]) => Number.isFinite(h) && Number.isFinite(c));
export const fmtMult = (arr) => (arr || []).map((m) => `${(m.eventKinds || []).join('+')}:${m.mult}`).join(', ');
export const parseMult = (s) => parsePairs(s).map(([k, m]) => ({ eventKinds: k.split('+').map((x) => x.trim()).filter(Boolean), mult: Number(m) })).filter((m) => m.eventKinds.length && Number.isFinite(m.mult));
export const fmtOverride = (arr) => (arr || []).map((o) => `${(o.eventKinds || []).join('+')}:${o.scale}`).join(', ');
export const parseOverride = (s) => parsePairs(s).map(([k, sc]) => ({ eventKinds: k.split('+').map((x) => x.trim()).filter(Boolean), scale: (sc || '').trim() })).filter((o) => o.eventKinds.length && o.scale);

// ---- Model B defaults (Charles calculator — MUST match modelb_cfg() in
// db/migrations/047_modelb_config.sql; DB falls back to the same values).
export const MODELB_DEFAULTS = {
  heightBase: [[80, 10], [85, 12], [90, 14], [95, 17], [100, 20], [105, 24], [110, 28], [115, 33], [120, 40], [125, 47], [130, 56], [135, 66], [140, 80], [145, 95], [150, 112], [155, 132], [160, 155]],
  lowHeight: { fromCm: 60, base: 6, perCm: 0.2 },
  faults: { 0: 1, 1: 0.9, 2: 0.82, 3: 0.75, 4: 0.68, 5: 0.6, 6: 0.52, 7: 0.45, 8: 0.38, 9: 0.33, 10: 0.29, 11: 0.27, 12: 0.25, 13: 0.22, 14: 0.2, 15: 0.17, 16: 0.15, over16: 0.10 },
  elimMult: 0.05,
  placeK: 0.4, placeExp: 1.2, fieldMinBonus: 1.15,
  fieldBase: 0.4, fieldFull: 50,
  diffK: 0.5,
  eventProfiles: { HOY: ['hoy'], Finals: ['series_final', 'national_championship', 'islands'], PremierTiers: ['Premier'] },
  eventMult: { HOY: 1.15, Finals: 1.0, Premier: 0.85, Other: 0.7 },
  dcBonus: 1.1,
  classTypeMult: { Speed: 0.9, 'Faults into Time': 0.9 },
  bestN: 12,
  rankWindows: { horse: { last: 10, drop: 3, min: 10 }, rider: { last: 20, drop: 5, min: 20 } },
};
export const fmtArrPairs = (arr) => (arr || []).map(([a, b]) => `${a}:${b}`).join(', ');
export const parseArrPairs = (s) => parsePairs(s).map(([a, b]) => [Number(String(a).replace(',', '.')), Number(String(b).replace(',', '.'))])
  .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)).sort((x, y) => x[0] - y[0]);
export const fmtObjPairs = (obj) => Object.entries(obj || {}).map(([a, b]) => `${a}:${b}`).join(', ');
export const parseObjPairs = (s) => {
  const o = {};
  for (const [a, b] of parsePairs(s)) {
    const v = Number(String(b).replace(',', '.'));
    if (a !== '' && Number.isFinite(v)) o[a] = v;
  }
  return o;
};

export function ModelBSummary({ mb }) {
  if (!mb) return null;
  const row = 'flex justify-between gap-3 py-1 border-b border-rowline/60 last:border-0 text-[12.5px]';
  return (
    <div className="mt-2.5 rounded border border-line bg-card2/40 p-3.5 text-muted">
      <div className="mb-2"><span className="inline-flex items-center rounded-full bg-goldbg px-2 py-[3px] text-[11px] font-bold text-gold">MODEL B RATING</span></div>
      <div className={row}><span>Height base</span><span className="text-body text-right">{(mb.heightBase || []).map(([h, v]) => `${h}:${v}`).join(' · ')}</span></div>
      <div className={row}><span>Events</span><span className="text-body text-right">HOY {mb.eventMult?.HOY} · Finals {mb.eventMult?.Finals} · Premier {mb.eventMult?.Premier} · Other {mb.eventMult?.Other}</span></div>
      <div className={row}><span>Rules</span><span className="text-body text-right">best {mb.bestN} · double-clear ×{mb.dcBonus} · elim {mb.elimMult}</span></div>
    </div>
  );
}

export function ModelBSections({ draft, setDraft }) {
  const set = (fn) => setDraft((prev) => {
    const next = JSON.parse(JSON.stringify(prev || {}));
    next.modelb ||= JSON.parse(JSON.stringify(MODELB_DEFAULTS));
    fn(next.modelb);
    return next;
  });
  // Show effective values: draft override, else the built-in default the DB uses.
  const mb = draft?.modelb || MODELB_DEFAULTS;
  const lh = mb.lowHeight || {};
  const em = mb.eventMult || {};
  const ep = mb.eventProfiles || {};
  return (
    <>
      <Sec title="Height base points" hint="Base points per fence height (cm:pts). Below the table the linear extension applies.">
        <div className="flex flex-wrap gap-3 items-end">
          <Fld label="Height table (cm:pts, …)"><Txt value={fmtArrPairs(mb.heightBase)} placeholder="80:10, 85:12, …" width={420}
            onChange={(v) => set((n) => { const p = parseArrPairs(v); if (p.length) n.heightBase = p; })} /></Fld>
          <Fld label="Extend from (cm)"><Num value={lh.fromCm} width={72} onChange={(v) => set((n) => { n.lowHeight.fromCm = v ?? 60; })} /></Fld>
          <Fld label="Base at from"><Num value={lh.base} width={72} onChange={(v) => set((n) => { n.lowHeight.base = v ?? 6; })} /></Fld>
          <Fld label="Per cm"><Num value={lh.perCm} step={0.05} width={72} onChange={(v) => set((n) => { n.lowHeight.perCm = v ?? 0.2; })} /></Fld>
        </div>
      </Sec>
      <Sec title="Fault multipliers" hint="Round-1 total faults → multiplier. Non-finishers always take elim (status-based, not faults=99).">
        <div className="flex flex-wrap gap-3 items-end">
          <Fld label="Faults (faults:mult, …)"><Txt value={fmtObjPairs(mb.faults)} placeholder="0:1, 1:0.9, …" width={420}
            onChange={(v) => set((n) => { const p = parseObjPairs(v); if (Object.keys(p).length) n.faults = p; })} /></Fld>
          <Fld label=">16 faults"><Num value={mb.faults?.over16} step={0.05} width={72} onChange={(v) => set((n) => { n.faults.over16 = v ?? 0.1; })} /></Fld>
          <Fld label="Elim / retire"><Num value={mb.elimMult} step={0.01} width={72} onChange={(v) => set((n) => { n.elimMult = v ?? 0.05; })} /></Fld>
        </div>
      </Sec>
      <Sec title="Formula constants" hint="Placing / field / difficulty shape. Standings count the best-N rounds per combination.">
        <div className="flex flex-wrap gap-3 items-end">
          <Fld label="Placing K"><Num value={mb.placeK} step={0.05} width={72} onChange={(v) => set((n) => { n.placeK = v ?? 0.4; })} /></Fld>
          <Fld label="Placing exp"><Num value={mb.placeExp} step={0.1} width={72} onChange={(v) => set((n) => { n.placeExp = v ?? 1.2; })} /></Fld>
          <Fld label="Tiny-field bonus"><Num value={mb.fieldMinBonus} step={0.05} width={72} onChange={(v) => set((n) => { n.fieldMinBonus = v ?? 1.15; })} /></Fld>
          <Fld label="Field base"><Num value={mb.fieldBase} step={0.05} width={72} onChange={(v) => set((n) => { n.fieldBase = v ?? 0.4; })} /></Fld>
          <Fld label="Full at starters"><Num value={mb.fieldFull} min={2} width={72} onChange={(v) => set((n) => { n.fieldFull = v ?? 50; })} /></Fld>
          <Fld label="Difficulty K"><Num value={mb.diffK} step={0.05} width={72} onChange={(v) => set((n) => { n.diffK = v ?? 0.5; })} /></Fld>
          <Fld label="Double-clear ×"><Num value={mb.dcBonus} step={0.05} width={72} onChange={(v) => set((n) => { n.dcBonus = v ?? 1.1; })} /></Fld>
          <Fld label="Best N"><Num value={mb.bestN} min={1} width={72} onChange={(v) => set((n) => { n.bestN = v ?? 12; })} /></Fld>
        </div>
      </Sec>
      <Sec title="Event profile" hint="Which event kinds map to each profile, and each profile's multiplier.">
        <div className="flex flex-wrap gap-3 items-end">
          <Fld label="HOY ×"><Num value={em.HOY} step={0.05} width={72} onChange={(v) => set((n) => { n.eventMult.HOY = v ?? 1.15; })} /></Fld>
          <Fld label="Finals ×"><Num value={em.Finals} step={0.05} width={72} onChange={(v) => set((n) => { n.eventMult.Finals = v ?? 1.0; })} /></Fld>
          <Fld label="Premier ×"><Num value={em.Premier} step={0.05} width={72} onChange={(v) => set((n) => { n.eventMult.Premier = v ?? 0.85; })} /></Fld>
          <Fld label="Other ×"><Num value={em.Other} step={0.05} width={72} onChange={(v) => set((n) => { n.eventMult.Other = v ?? 0.7; })} /></Fld>
          <Fld label="HOY kinds"><Txt value={csvGet(ep.HOY)} placeholder="hoy" width={200}
            onChange={(v) => set((n) => { n.eventProfiles.HOY = csvSet(v); })} /></Fld>
          <Fld label="Finals kinds"><Txt value={csvGet(ep.Finals)} placeholder="series_final, …" width={260}
            onChange={(v) => set((n) => { n.eventProfiles.Finals = csvSet(v); })} /></Fld>
          <Fld label="Premier tiers"><Txt value={csvGet(ep.PremierTiers)} placeholder="Premier" width={160}
            onChange={(v) => set((n) => { n.eventProfiles.PremierTiers = csvSet(v); })} /></Fld>
        </div>
      </Sec>
      <Sec title="Rank windows" hint="Form-guide ranking gates. Horse: last-N rounds, drop-D worst, min-M to rank. Rider: same across all horses.">
        <div className="flex flex-wrap gap-3 items-end">
          <Fld label="Horse last"><Num value={mb.rankWindows?.horse?.last} min={1} width={72} onChange={(v) => set((n) => { n.rankWindows ||= JSON.parse(JSON.stringify(MODELB_DEFAULTS.rankWindows)); n.rankWindows.horse.last = v ?? 10; })} /></Fld>
          <Fld label="Horse drop"><Num value={mb.rankWindows?.horse?.drop} min={0} width={72} onChange={(v) => set((n) => { n.rankWindows ||= JSON.parse(JSON.stringify(MODELB_DEFAULTS.rankWindows)); n.rankWindows.horse.drop = v ?? 3; })} /></Fld>
          <Fld label="Horse min"><Num value={mb.rankWindows?.horse?.min} min={1} width={72} onChange={(v) => set((n) => { n.rankWindows ||= JSON.parse(JSON.stringify(MODELB_DEFAULTS.rankWindows)); n.rankWindows.horse.min = v ?? 10; })} /></Fld>
          <Fld label="Rider last"><Num value={mb.rankWindows?.rider?.last} min={1} width={72} onChange={(v) => set((n) => { n.rankWindows ||= JSON.parse(JSON.stringify(MODELB_DEFAULTS.rankWindows)); n.rankWindows.rider.last = v ?? 20; })} /></Fld>
          <Fld label="Rider drop"><Num value={mb.rankWindows?.rider?.drop} min={0} width={72} onChange={(v) => set((n) => { n.rankWindows ||= JSON.parse(JSON.stringify(MODELB_DEFAULTS.rankWindows)); n.rankWindows.rider.drop = v ?? 5; })} /></Fld>
          <Fld label="Rider min"><Num value={mb.rankWindows?.rider?.min} min={1} width={72} onChange={(v) => set((n) => { n.rankWindows ||= JSON.parse(JSON.stringify(MODELB_DEFAULTS.rankWindows)); n.rankWindows.rider.min = v ?? 20; })} /></Fld>
        </div>
      </Sec>
      <Sec title="Class-type multipliers" hint="Format → multiplier (×1 when blank). No class in the DB currently uses these formats, so edits are dormant until such classes import.">
        <div className="flex flex-wrap gap-3 items-end">
          <Fld label="Format:mult, …"><Txt value={fmtObjPairs(mb.classTypeMult)} placeholder="Speed:0.9, …" width={300}
            onChange={(v) => set((n) => { n.classTypeMult = parseObjPairs(v); })} /></Fld>
        </div>
      </Sec>
    </>
  );
}
