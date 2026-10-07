'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY, BTN_DANGER, badge, BADGE } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import Modal, { ConfirmDialog } from '../../../components/Modal';
import { Sec, Fld, Num, Txt, Check, csvGet, csvSet, parsePairs, fmtSliding, parseSliding, fmtMult, parseMult, fmtOverride, parseOverride, MODELB_DEFAULTS, ModelBSummary } from '../../../components/ScoringForms';

const stBadge = (s) => s === 'active' ? badge(BADGE.green) : s === 'draft' ? badge(BADGE.goldfill) : badge(BADGE.gray);

const TABS = [
  ['divisions', 'Divisions'], ['scales', 'Scales'], ['rules', 'Rules'], ['younghorse', 'Young horse'], ['series', 'Series'],
];
const EVENT_KINDS = ['regular', 'national_championship', 'series_final', 'islands', 'hoy', 'national_young_horse'];

// Read-only summary of a rules params object (defaults or any version).
function RulesSummary({ p }) {
  if (!p) return null;
  if ((p.mode || 'eqindex') === 'esnz') return (<>
    <EsnzSummary ez={p.esnz || {}} divisions={p.divisions} />
    {p.modelb && <ModelBSummary mb={p.modelb} />}
  </>);
  const divs = p.divisions || [];
  const pts = p.points || {};
  const bt = p.bestTen || {};
  const st = p.status || {};
  const aw = p.awards || {};
  const row = 'flex justify-between gap-3 py-1 border-b border-rowline/60 last:border-0 text-[12.5px]';
  return (
    <div className="mt-2.5 rounded border border-line bg-card2/40 p-3.5 text-muted">
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {divs.map((d) => (
          <span key={d.key} className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-[3px] text-[11.5px]"
            title={`${d.min ?? '−∞'}–${d.max ?? '+∞'}cm`}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.color || '#888' }} />
            <b className="text-body">{d.label}</b> {d.min ?? '…'}-{d.max ?? '…'}cm
          </span>
        ))}
      </div>
      <div className={row}><span>Points</span><span className="text-body text-right">clear {pts.clear} · double {pts.doubleBonus} · placing {(pts.placing || []).join('/')} · cap {pts.classMax} (2-phase {pts.twoPhaseMax}, 1-round {pts.singleRoundMax})</span></div>
      <div className={row}><span>Best-ten</span><span className="text-body text-right">top {bt.n} · min field {bt.minField}{bt.riderLimitPerClass ? ' · 1 round/rider/class' : ''}</span></div>
      <div className={row}><span>Status routes</span><span className="text-body text-right">{st.clearRoute} clears · {st.consecutiveRoute} consecutive · {st.participationTop}/{st.participationWindow} recent · step {st.stepDownPerSeason}/season</span></div>
      <div className={row}><span>Awards</span><span className="text-body text-right">min {aw.minStarts} starts · tiebreak {aw.tiebreakMinStarts}</span></div>
    </div>
  );
}

function EsnzSummary({ ez, divisions }) {
  const row = 'flex justify-between gap-3 py-1 border-b border-rowline/60 last:border-0 text-[12.5px]';
  const series = ez.series || {};
  return (
    <div className="mt-2.5 rounded border border-line bg-card2/40 p-3.5 text-muted">
      <div className="mb-2"><span className="inline-flex items-center rounded-full bg-goldbg px-2 py-[3px] text-[11px] font-bold text-gold">SERIES SCORING · {ez.scope === 'all_classes' ? 'all classes score' : 'series classes only'}</span></div>
      <div className={row}><span>Divisions</span><span className="text-body text-right">{(divisions || []).map((d) => d.label).join(' · ') || '—'}</span></div>
      <div className={row}><span>Grand Prix scale</span><span className="text-body text-right">{(ez.scales?.grand_prix || []).join(' / ')}</span></div>
      <div className={row}><span>Premier scale</span><span className="text-body text-right">{(ez.scales?.premier || []).join(' / ')}</span></div>
      <div className={row}><span>Rules</span><span className="text-body text-right">top {ez.placesCounted} · zero at {ez.zeroFaultThreshold ?? 'off'} faults · equal share {ez.shareEqualPlacings === false ? 'off' : 'on'} · nomination {ez.nominationRule === false ? 'off' : 'on'}</span></div>
      <div className={row}><span>Young-horse clear</span><span className="text-body text-right">{ez.youngHorse?.enabled === false ? 'off' : `${ez.youngHorse?.firstClear}/${ez.youngHorse?.doubleClearTotal} on ${(ez.youngHorse?.seriesKeys || []).join(', ') || '—'}`}</span></div>
      <div className={row}><span>Series configured</span><span className="text-body text-right">{Object.keys(series).length}</span></div>
    </div>
  );
}

// ---- Series draft editor (no raw JSON; formatters live in ScoringForms) ----

function EsnzSections({ draft, setDraft, tab }) {
  const set = (fn) => setDraft((prev) => {
    const next = JSON.parse(JSON.stringify(prev || {}));
    next.mode = 'esnz';
    next.esnz ||= {};
    fn(next.esnz);
    return next;
  });
  const ez = (draft || {}).esnz || {};
  const series = ez.series || {};
  if (!draft) return <section className={CARD}><p className={EMPTY}>Loading draft…</p></section>;
  return (
    <>
      {tab === 'divisions' && <DivisionsEditor draft={draft} set={set} />}
      {tab === 'scales' && (<Sec title="Placing scales" hint="Points per placing, 1st → Nth. Length must equal places counted. Edit numbers directly — live on next activation.">
        <div className="flex flex-wrap gap-4 items-end">
          {['grand_prix', 'premier'].map((k) => (
            <Fld key={k} label={k === 'grand_prix' ? 'Grand Prix scale' : 'Premier scale'}>
              <span className="flex gap-1.5">
                {(ez.scales?.[k] || []).map((v, i) => (
                  <Num key={i} value={v} min={0} width={64} onChange={(nv) => set((n) => { n.scales[k][i] = nv ?? 0; })} />
                ))}
              </span>
            </Fld>
          ))}
          <Fld label="Places counted"><Num value={ez.placesCounted} min={1} width={64} onChange={(v) => set((n) => { n.placesCounted = v ?? 6; })} /></Fld>
        </div>
      </Sec>)}
      {tab === 'rules' && (<Sec title="General rules" hint="Scope is the big switch: strict Charles (series classes only) vs pragmatic (every class scores on its show-tier scale).">
        <div className="flex flex-wrap gap-3 items-end">
          <Fld label="Scope">
            <select className={INP} value={ez.scope || 'series_only'}
              onChange={(e) => set((n) => { n.scope = e.target.value; })}>
              <option value="series_only">series_only — strict (only series classes score)</option>
              <option value="all_classes">all_classes — every class scores on show-tier scale</option>
            </select>
          </Fld>
          <Fld label="Zero at faults ≥"><Num value={ez.zeroFaultThreshold} min={1} width={72} onChange={(v) => set((n) => { n.zeroFaultThreshold = v; })} /></Fld>
          <span className="pb-1"><Check value={ez.shareEqualPlacings !== false} label="Equal placings share points (half-up rounding)"
            onChange={(v) => set((n) => { n.shareEqualPlacings = v; })} /></span>
          <span className="pb-1"><Check value={ez.nominationRule !== false} label="First-horse nomination (series points only for the nominated horse)"
            onChange={(v) => set((n) => { n.nominationRule = v; })} /></span>
        </div>
        <div className="text-[11.5px] text-faint mt-2">Event kinds for overrides/multipliers: {EVENT_KINDS.join(', ')}</div>
      </Sec>)}
      {tab === 'younghorse' && (<Sec title="Young-horse clear points" hint="First-round clear and double-clear totals (double = total, not added). Applies to the series keys below, plus any series with clearRound on.">
        <div className="flex flex-wrap gap-3 items-end">
          <span className="pb-1"><Check value={ez.youngHorse?.enabled !== false} label="Enabled"
            onChange={(v) => set((n) => { n.youngHorse.enabled = v; })} /></span>
          <Fld label="First-round clear"><Num value={ez.youngHorse?.firstClear} min={0} width={72} onChange={(v) => set((n) => { n.youngHorse.firstClear = v ?? 4; })} /></Fld>
          <Fld label="Double-clear total"><Num value={ez.youngHorse?.doubleClearTotal} min={0} width={72} onChange={(v) => set((n) => { n.youngHorse.doubleClearTotal = v ?? 6; })} /></Fld>
          <Fld label="Series keys (comma separated)"><Txt value={csvGet(ez.youngHorse?.seriesKeys)} placeholder="young-horse-series"
            onChange={(v) => set((n) => { n.youngHorse.seriesKeys = csvSet(v); })} /></Fld>
        </div>
      </Sec>)}
      {tab === 'series' && (<Sec title="Per-series rules" hint="bestOf XOR sliding table. Scale: show_rating follows the show tier. Multipliers/overrides as kind:mult pairs (kinds joined by +).">
        <div className="flex flex-col gap-3">
          {Object.entries(series).map(([key, cfg]) => (
            <div key={key} className="rounded border border-line p-3">
              <div className="flex items-center gap-2 mb-2">
                <b className="text-[13px]">{key}</b>
                <button onClick={() => set((n) => { delete n.series[key]; })}
                  className="ml-auto text-[12px] text-faint hover:text-blood bg-none border-0 cursor-pointer">Remove</button>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <Fld label="Best of (N)"><Num value={cfg.bestOf} min={1} width={64} onChange={(v) => set((n) => { n.series[key].bestOf = v; })} /></Fld>
                <Fld label="or sliding held:count,…"><Txt value={fmtSliding(cfg.sliding)} placeholder="15:10, 14:9, …" width={220}
                  onChange={(v) => set((n) => { n.series[key].sliding = parseSliding(v).length ? parseSliding(v) : undefined; })} /></Fld>
                <Fld label="Scale">
                  <select className={INP} value={cfg.scale || 'show_rating'}
                    onChange={(e) => set((n) => { n.series[key].scale = e.target.value; })}>
                    {['show_rating', 'grand_prix', 'premier', 'none'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Fld>
                <Fld label="Major scale"><Txt value={cfg.majorScale || ''} placeholder="grand_prix"
                  onChange={(v) => set((n) => { n.series[key].majorScale = v || undefined; })} /></Fld>
                <span className="pb-1"><Check value={!!cfg.clearRound} label="Clear-round points"
                  onChange={(v) => set((n) => { n.series[key].clearRound = v || undefined; })} /></span>
              </div>
              <div className="flex flex-wrap gap-3 items-end mt-2">
                <Fld label="Multipliers kind:mult,…"><Txt value={fmtMult(cfg.multipliers)} placeholder="national_championship:2, series_final+hoy:1.5" width={300}
                  onChange={(v) => set((n) => { n.series[key].multipliers = parseMult(v).length ? parseMult(v) : undefined; })} /></Fld>
                <Fld label="Scale override kind:scale,…"><Txt value={fmtOverride(cfg.scaleOverride)} placeholder="series_final+hoy:premier" width={300}
                  onChange={(v) => set((n) => { n.series[key].scaleOverride = parseOverride(v).length ? parseOverride(v) : undefined; })} /></Fld>
                <Fld label="Sources (aggregate)"><Txt value={csvGet(cfg.sources)} placeholder="grand-prix-series, …"
                  onChange={(v) => set((n) => { n.series[key].sources = csvSet(v).length ? csvSet(v) : undefined; })} /></Fld>
              </div>
            </div>
          ))}
          <AddSeriesKey set={set} />
        </div>
      </Sec>)}
    </>
  );
}

function AddSeriesKey({ set }) {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-2 items-end">
      <Fld label="New series key"><Txt value={v} placeholder="e.g. pro-am-series" width={220} onChange={setV} /></Fld>
      <button onClick={() => { const k = v.trim(); if (k) set((n) => { n.series ||= {}; n.series[k] ||= { bestOf: 12, scale: 'show_rating' }; }); setV(''); }}
        className="rounded border border-line px-3 py-2 text-[13px] text-gold hover:border-gold/60 bg-none cursor-pointer">+ Add series</button>
    </div>
  );
}

// Shared divisions editor (height bands) — used by both modes.
// Divisions are display/award bands; points always follow the series engine.
function DivisionsEditor({ draft, set }) {
  return (
    <Sec title="Divisions" hint="Height bands in cm (empty = open-ended). Colour shows on stars and tables.">
      <div className="flex flex-col gap-2">
        {(draft.divisions || []).map((d, i) => (
          <div key={d.key || i} className="flex flex-wrap items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: d.color || '#888' }} />
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#888888'}
              onChange={(e) => set((n) => { n.divisions[i].color = e.target.value; })}
              className="w-8 h-8 p-0.5 rounded border border-line bg-ink cursor-pointer" title="Division colour" />
            <Txt value={d.label} placeholder="Label" width={130}
              onChange={(v) => set((n) => { n.divisions[i].label = v; })} />
            <Num value={d.min} min={0} width={80} onChange={(v) => set((n) => { n.divisions[i].min = v; })} />
            <span className="text-faint text-[12px]">–</span>
            <Num value={d.max} min={0} width={80} onChange={(v) => set((n) => { n.divisions[i].max = v; })} />
            <span className="text-faint text-[12px]">cm</span>
            <button onClick={() => set((n) => { n.divisions.splice(i, 1); })}
              className="ml-auto text-[12px] text-faint hover:text-blood bg-none border-0 cursor-pointer">Remove</button>
          </div>
        ))}
        <button onClick={() => set((n) => { (n.divisions ||= []).push({ key: `div-${Date.now() % 100000}`, label: 'New division', min: null, max: null, color: '#A0A0A0' }); })}
          className="self-start text-[12px] text-gold hover:text-white bg-none border border-line rounded px-2.5 py-1.5 cursor-pointer">+ Add division</button>
      </div>
    </Sec>
  );
}

export default function AdminScoring() {
  const call = useAdminApi();
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [tab, setTab] = useState('divisions');
  const [season, setSeason] = useState('2026-2027');
  const [label, setLabel] = useState('');
  const [defaults, setDefaults] = useState(null);
  const [showDefaults, setShowDefaults] = useState(false);

  async function load(keepSel) {
    setLoading(true); setErr('');
    try {
      const data = await call('/admin/scoring/versions');
      setRows(data || []);
      if (!keepSel && (data || []).length) await select(data[0].id, data);
      else if (!keepSel) setSel(null);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }
  // List rows omit params — always load the full version before editing.
  async function select(id, list) {
    setErr('');
    try {
      const full = await call(`/admin/scoring/versions/${id}`);
      setSel(full);
      setRows((prev) => {
        const base = list || prev;
        return base.map((r) => (r.id === id ? { ...r, ...full } : r));
      });
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(false); }, []);
  useEffect(() => {
    fetch(`${API}/scoring/defaults`).then((r) => r.json()).then((j) => setDefaults(j.data || null)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setDraft(sel ? JSON.parse(JSON.stringify(sel.params || {})) : null);
    setPreview(null);
  }, [sel?.id]);

  const BLANK = {
    mode: 'esnz',
    divisions: [{ key: 'div-1', label: 'Division 1', min: null, max: null, color: '#FFD700' }],
    esnz: {
      scope: 'series_only',
      scales: { grand_prix: [10, 8, 6, 4, 2, 1], premier: [20, 17, 14, 11, 8, 4] },
      placesCounted: 6, zeroFaultThreshold: 12, shareEqualPlacings: true, defaultScale: 'grand_prix',
      youngHorse: { enabled: true, seriesKeys: ['young-horse-series'], firstClear: 4, doubleClearTotal: 6 },
      majorKinds: [...EVENT_KINDS.slice(1)], series: {},
    },
    modelb: JSON.parse(JSON.stringify(MODELB_DEFAULTS)),
  };
  async function create() {
    if (!sel) return;
    setBusy(true); setErr(''); setNotice('');
    try {
      const created = await call('/admin/scoring/versions', {
        method: 'POST', body: JSON.stringify({ season, label: label || `v${rows.length + 1} (clone)`, cloneFrom: sel.id }),
      });
      setNotice(`Draft v${created.version} created for ${season}.`);
      await load(false);
      await select(created.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function createBlank() {
    setBusy(true); setErr(''); setNotice('');
    try {
      const created = await call('/admin/scoring/versions', {
        method: 'POST', body: JSON.stringify({ season, label: label || 'Blank draft', params: BLANK }),
      });
      setNotice(`Blank draft v${created.version} created for ${season} — fill in the tabs.`);
      await load(false);
      await select(created.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function cloneDefaults(targetSeason) {
    if (!defaults) return;
    setBusy(true); setErr(''); setNotice('');
    try {
      const created = await call('/admin/scoring/versions', {
        method: 'POST', body: JSON.stringify({ season: targetSeason, label: label || 'v0.3 defaults', params: defaults }),
      });
      setNotice(`Draft v${created.version} created for ${targetSeason} from v0.3 defaults — preview, then activate.`);
      await load(false);
      await select(created.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function removeDraft() {
    if (!deleting) return;
    setBusy(true); setErr('');
    try {
      await call(`/admin/scoring/versions/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      setNotice(`Draft v${deleting.version} deleted.`);
      await load(false);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function save() {
    if (!sel || sel.status !== 'draft' || !draft) return;
    setBusy(true); setErr(''); setNotice('');
    try {
      const updated = await call(`/admin/scoring/versions/${sel.id}`, { method: 'PUT', body: JSON.stringify({ params: draft }) });
      setSel(updated);
      setNotice('Draft saved.');
      await load(true);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function runPreview() {
    if (!sel) return;
    setBusy(true); setErr('');
    try {
      setPreview(await call(`/admin/scoring/versions/${sel.id}/preview`, { method: 'POST' }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function activate() {
    if (!sel) return;
    setBusy(true); setErr('');
    try {
      await call(`/admin/scoring/versions/${sel.id}/activate`, { method: 'POST' });
      setConfirming(null);
      setNotice(`v${sel.version} is now ACTIVE for ${sel.season}.`);
      await load(false);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const divs = sel?.params?.divisions || [];
  // Live status per season, derived from the versions list.
  const seasons = [...new Set(rows.map((v) => v.season))].sort().reverse();
  const liveBySeason = Object.fromEntries(
    seasons.map((s) => [s, rows.find((v) => v.season === s && v.status === 'active') || null])
  );
  const fmtDate = (d) => (d || '').slice(0, 16).replace('T', ' ');
  return (
    <>
      <h1 className={H1}>Scoring rules</h1>
      <p className={SUB}>Every scoring number lives here — series scales, rules and per-series setup, plus display divisions. Edit drafts, preview against the real season, then activate. Active versions lock; clone to change.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      {notice && <section className={CARD}><p className="text-moss text-sm">{notice}</p></section>}
      {/* live banner: exactly which rules the public site uses right now */}
      {!loading && !!seasons.length && (
        <section className="rounded border px-5 py-3.5 mb-5 border-line bg-card">
          <div className="text-[11px] uppercase tracking-[0.8px] text-faint font-bold mb-2">Live on site now</div>
          {seasons.map((s) => {
            const live = liveBySeason[s];
            return live ? (
              <div key={s} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-greenbg px-2.5 py-[3px] text-[11px] font-bold text-moss">● LIVE</span>
                <b className="text-[13px]">{s} · v{live.version}</b>
                <span className="text-[12px] text-muted">{live.label || 'unlabeled'}{live.activated_at ? ` · activated ${fmtDate(live.activated_at)}` : ''}</span>
              </div>
            ) : (
              <div key={s} className="py-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-goldbg px-2.5 py-[3px] text-[11px] font-bold text-gold">● NO ACTIVE VERSION</span>
                  <span className="text-[12px] text-muted">{s} runs on built-in v0.3 defaults.</span>
                  <span className="ml-auto flex gap-2">
                    <button onClick={() => setShowDefaults((x) => !x)} disabled={!defaults}
                      className="rounded border border-line px-3 py-1.5 text-[12px] text-muted hover:text-white bg-none cursor-pointer disabled:opacity-40">
                      {showDefaults ? 'Hide defaults ▲' : 'Show defaults ▼'}
                    </button>
                    <button onClick={() => cloneDefaults(s)} disabled={busy || !defaults}
                      className="rounded border border-gold/60 px-3 py-1.5 text-[12px] font-bold text-gold bg-none cursor-pointer hover:bg-goldbg/40 disabled:opacity-40">
                      Clone defaults → draft
                    </button>
                  </span>
                </div>
                {showDefaults && <RulesSummary p={defaults} />}
              </div>
            );
          })}
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-[300px_1fr] items-start">
        <section className={CARD} style={{ marginBottom: 0 }}>
          <h2 className="text-[15px] font-bold mb-2">Versions</h2>
          {!rows.length && !loading && <p className={EMPTY}>No versions yet.</p>}
          {rows.map((v) => (
            <button key={v.id} onClick={() => select(v.id)}
              className={`block w-full text-left rounded border p-3 mb-2 cursor-pointer transition-colors ${sel?.id === v.id ? 'border-gold/60 bg-goldbg/30' : v.status === 'active' ? 'border-moss/50 bg-greenbg/20 hover:border-moss' : 'border-line hover:border-faint bg-transparent'} ${v.status === 'archived' ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2">
                <b className="text-[13px] whitespace-nowrap">{v.season} · v{v.version}</b>
                <span className="ml-auto flex items-center gap-1.5">
                  {v.status === 'active'
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-greenbg px-2 py-[3px] text-[11px] font-bold text-moss">● LIVE</span>
                    : <span className={stBadge(v.status)}>{v.status}</span>}
                  {v.status === 'draft' && (
                    <span role="button" tabIndex={0} title={`Delete draft v${v.version}`}
                      onClick={(e) => { e.stopPropagation(); setDeleting(v); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setDeleting(v); } }}
                      className="w-6 h-6 inline-flex items-center justify-center rounded border border-line text-faint hover:text-blood hover:border-blood/60 text-[12px] cursor-pointer">🗑</span>
                  )}
                </span>
              </div>
              <div className="text-[12px] text-muted mt-0.5 truncate">{v.label || '—'}{v.status === 'active' && v.activated_at ? ` · live since ${fmtDate(v.activated_at)}` : ''}</div>
            </button>
          ))}
          <div className="mt-3 pt-3 border-t border-line">
            <div className="text-[12px] text-muted mb-1.5">New draft for season</div>
            <div className="flex gap-2 mb-2">
              <input className={INP} value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2026-2027" style={{ width: 110 }} />
              <button className={BTN_PRIMARY} disabled={busy || !sel} title={sel ? 'Clone the selected version' : 'Select a version to clone'} onClick={create}>Clone selected → draft</button>
            </div>
            <button className="w-full rounded border border-line px-3 py-2 text-[13px] text-muted hover:text-white hover:border-faint bg-none cursor-pointer disabled:opacity-60" disabled={busy} onClick={createBlank}>+ Blank draft (fill from scratch)</button>
            <input className={`${INP} mt-2 w-full`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" />
          </div>
        </section>
        <div className="min-w-0">
          {!sel ? (
            <section className={CARD}><p className={EMPTY}>{loading ? 'Loading…' : 'Select a version.'}</p></section>
          ) : (
            <>
              <section className={CARD}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h2 className="text-[15px] font-bold mr-auto">{sel.season} · v{sel.version} {sel.label && <span className="text-muted font-normal">— {sel.label}</span>}</h2>
                  {sel.status === 'active'
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-greenbg px-2.5 py-[3px] text-[11px] font-bold text-moss">● LIVE{sel.activated_at ? ` since ${fmtDate(sel.activated_at)}` : ''}</span>
                    : <span className={stBadge(sel.status)}>{sel.status}</span>}
                </div>
                {sel.status !== 'draft' ? (
                  <p className="text-muted text-sm">This version is {sel.status} — clone it to make changes.</p>
                ) : (
                  <>
                    <div className="flex gap-1 bg-card2 border border-line rounded p-1 mb-3 overflow-x-auto items-center">
                      <span className="text-[11px] uppercase tracking-wide text-faint font-bold px-2">Series rules</span>
                      <span className="ml-auto text-[11px] text-faint pr-2">Series scales · every number editable · points follow series scales</span>
                    </div>
                    <div className="flex gap-1 bg-card2 border border-line rounded p-1 mb-3 overflow-x-auto">
                      {TABS.map(([k, lbl]) => (
                        <button key={k} onClick={() => setTab(k)}
                          className={`px-3.5 py-[7px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${tab === k ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <EsnzSections draft={draft} setDraft={setDraft} tab={TABS.some(([k]) => k === tab) ? tab : 'divisions'} />
                    <div className="flex flex-wrap gap-2 mt-4 sticky bottom-0 py-3 border-t border-line" style={{ backgroundColor: '#141414' }}>
                      <button className={BTN_PRIMARY} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save draft'}</button>
                      <button className="rounded border border-line px-4 py-2 text-sm text-muted hover:text-white hover:border-faint bg-none cursor-pointer disabled:opacity-60" disabled={busy} onClick={runPreview}>Preview vs season →</button>
                      <button className={BTN_DANGER} disabled={busy} onClick={() => setConfirming(sel)}>Activate</button>
                    </div>
                  </>
                )}
                {sel.status !== 'draft' && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button className="rounded border border-line px-4 py-2 text-sm text-muted hover:text-white hover:border-faint bg-none cursor-pointer disabled:opacity-60" disabled={busy} onClick={runPreview}>Preview vs season →</button>
                  </div>
                )}
              </section>
              {preview && (
                <section className={CARD}>
                  {preview.mode === 'esnz' ? (
                    <>
                      <h2 className="text-[15px] font-bold mb-1">Preview — series under this draft ({preview.scope === 'all_classes' ? 'all classes score' : 'series classes only'})</h2>
                      <p className="text-muted text-[13px] mb-3">
                        {preview.rounds} season rounds rescored · {preview.scoringRounds} in series classes.
                      </p>
                      {Object.keys(preview.tables || {}).length ? Object.entries(preview.tables).map(([key, t]) => (
                        <div key={key} className="mb-4">
                          <div className="text-[12px] font-bold uppercase tracking-wide text-gold mb-1.5">{key} <span className="text-faint font-semibold normal-case">· {t.held} round{t.held === 1 ? '' : 's'} held → {t.counted ?? 'all'} count</span></div>
                          <div className={TABLEWRAP}>
                          <table className={TABLE}>
                            <thead><tr><th className={TH}>#</th><th className={TH}>Rider</th><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Total</th><th className={`${TH} ${NUM}`}>Dropped</th></tr></thead>
                            <tbody>
                              {t.top.map((c, i) => (
                                <tr key={`${c.rider}-${c.horse}`}>
                                  <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                                  <td className={TD}>{c.rider}</td>
                                  <td className={TD}><b>{c.horse}</b></td>
                                  <td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{c.total}</b></td>
                                  <td className={`${TD} ${NUM} text-muted`}>{c.dropped}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      )) : <p className={EMPTY}>No series scores under these rules — check scope and series keys.</p>}
                    </>
                  ) : (
                    <>
                      <h2 className="text-[15px] font-bold mb-1">Preview — best-ten under this version</h2>
                  <p className="text-muted text-[13px] mb-3">
                    {preview.rounds} season rounds scored
                    {!!preview.excludedSmallField && <> · {preview.excludedSmallField} excluded (field below minimum {preview.minField ?? 3})</>}
                    {!!preview.excludedMissingField && <> · {preview.excludedMissingField} excluded (no starters data)</>}
                    {!preview.excludedSmallField && !preview.excludedMissingField && <> · nothing excluded</>}.
                  </p>
                  {Object.keys(preview.tables || {}).length ? Object.entries(preview.tables).map(([div, leaders]) => (
                    <div key={div} className="mb-4">
                      <div className="text-[12px] font-bold uppercase tracking-wide text-gold mb-1.5">{div}</div>
                      <div className={TABLEWRAP}>
                      <table className={TABLE}>
                        <thead><tr><th className={TH}>#</th><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Best-ten</th><th className={`${TH} ${NUM}`}>Counted</th></tr></thead>
                        <tbody>
                          {leaders.map((h, i) => (
                            <tr key={h.horse_id}>
                              <td className={i === 0 ? 'text-gold font-bold' : 'text-muted'}>#{i + 1}</td>
                              <td className={TD}><b>{h.horse}</b></td>
                              <td className={`${TD} ${NUM}`}><b className={i === 0 ? 'text-gold' : ''}>{h.total}</b></td>
                              <td className={`${TD} ${NUM} text-muted`}>{h.counted} of 10</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>
                   )) : <p className={EMPTY}>No eligible scores under these rules — check the exclusion counts above.</p>}
                    </>
                  )}
                </section>
              )}
              {!!divs.length && (
                <section className={CARD}>
                  <h2 className="text-[15px] font-bold mb-2">Divisions in this version</h2>
                  <div className="flex flex-wrap gap-2">
                    {divs.map((d) => (
                      <span key={d.key} className="inline-flex items-center gap-1.5 rounded border border-line px-2.5 py-1 text-[12px]"
                        title={`${d.min ?? '−∞'}–${d.max ?? '+∞'}cm`}>
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: d.color || '#888' }} />
                        <b>{d.label}</b>
                        <span className="text-muted">{d.min ?? '…'}-{d.max ?? '…'}cm</span>
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
      {deleting && (
        <ConfirmDialog
          title={`Delete draft v${deleting.version}?`}
          body={<>
            <p className="mb-2 text-body font-semibold">{deleting.season} · {deleting.label || 'unlabeled draft'}.</p>
            <p>Only drafts can be deleted. Active and archived versions are history and stay.</p>
          </>}
          confirmLabel="Delete draft"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={removeDraft}
        />
      )}
      {confirming && (
        <Modal title={`Activate v${confirming.version} for ${confirming.season}?`}
          sub={(() => {
            const live = rows.find((v) => v.season === confirming.season && v.status === 'active' && v.id !== confirming.id);
            return live
              ? `This archives v${live.version} (${live.label || 'unlabeled'}). Live displays switch to the new numbers.`
              : 'No version is live for this season yet — this becomes the first. Live displays switch to the new numbers.';
          })()}
          onClose={() => setConfirming(null)}
          footer={[
            <button key="c" onClick={() => setConfirming(null)} disabled={busy}
              className="rounded border border-line px-4 py-2 text-sm text-muted hover:text-white bg-none cursor-pointer">Cancel</button>,
            <button key="a" onClick={activate} disabled={busy}
              className={`${BTN_PRIMARY} disabled:opacity-60`}>{busy ? 'Activating…' : 'Activate version'}</button>,
          ]}>
          <p className="text-sm text-muted">Recommended: run Preview first and check the diff.</p>
        </Modal>
      )}
    </>
  );
}
