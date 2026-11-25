'use client';
// Import Assistant — ChatGPT-style chat, separate from CSV import.
// History sidebar (persisted locally, resumable), centered chat column,
// review panel docked right on wide screens / stacked below on small ones.
// The assistant never writes anything itself: validate → preview → commit.
import { useEffect, useRef, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, BTN_PRIMARY, BTN_DANGER } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import Dropdown from '../../../components/Dropdown';
import { nzDay } from '../../../lib/dates';
import { withRecords, commitLockReason } from '../../../lib/importReview';
import ReviewTable from './ReviewTable';

const LS_KEY = 'eq-assistant-chats';
// Matches the server's ungrounded-names warning (api/src/lib/assist.js).
const NAMES_NOT_FOUND = 'names not found in the source text';
const uid = () => Math.random().toString(36).slice(2);
const QUICK = ['Import an Equipe or EvoEvents link', 'What formats can you read?', 'Why would a row score 0?'];
const HELLO = 'Hi — send me an Equipe or EvoEvents results link, paste results text, or upload a file (PDF, CSV, TXT, JSON). I’ll map it and show a summary before anything is saved.';
const SUGGESTIONS = [
  ['🔗', 'Import a show', 'Paste an Equipe or EvoEvents link and I’ll pull every class — no PDF needed.'],
  ['📄', 'Upload results', 'Drop a PDF or CSV from the organiser.'],
  ['❓', 'Ask about scoring', 'Why a row scores 0, what a series needs…'],
];

// Tiny markdown-lite: **bold**, `code`, line breaks.
function Rich({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <b key={i}>{p.slice(2, -2)}</b>;
        if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
          return <code key={i} className="rounded bg-ink px-1 py-px text-[13px] text-gold">{p.slice(1, -1)}</code>;
        }
        return <span key={i} className="whitespace-pre-wrap">{p}</span>;
      })}
    </>
  );
}

function loadChats() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
// Persist history; records are large so strip them on quota pressure.
function saveChats(chats) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(chats));
  } catch {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(chats.map((c) => ({
        ...c, analysis: c.analysis ? { ...c.analysis, records: [] } : null,
      }))));
    } catch { /* storage full/blocked — chat still works in memory */ }
  }
}

function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button title="Copy" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}
      className="text-faint hover:text-white bg-none border-0 cursor-pointer text-[12px] px-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {ok ? '✓' : '⧉'}
    </button>
  );
}

function freshChat() {
  return { id: uid(), title: 'New conversation', updatedAt: Date.now(), msgs: [{ id: uid(), role: 'assistant', content: HELLO }], analysis: null };
}

export default function AdminAssistant() {
  const call = useAdminApi();
  // Deterministic first render (server == client), then hydrate from
  // storage client-side. Saves are gated on `ready` so the initial empty
  // state can never wipe saved chats.
  const [chats, setChats] = useState([]);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [fileText, setFileText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [busy, setBusy] = useState(null);
  const [events, setEvents] = useState([]);
  const [seriesKeys, setSeriesKeys] = useState([]);
  const [eventId, setEventId] = useState('');
  const [evNew, setEvNew] = useState({ name: '', date_start: '', venue: '' });
  const [preview, setPreview] = useState(null);
  // Admin confirmed the flagged series-like classes are not series classes.
  const [seriesAck, setSeriesAck] = useState(false);
  // Admin confirmed the AI-mapped names that were not found in the source.
  const [namesAck, setNamesAck] = useState(false);
  // Admin chose to import classes the organiser has not approved yet.
  const [provisionalAck, setProvisionalAck] = useState(false);
  // Partial commit: { from, saved, failed, error, batchId } — rows before `from` were committed.
  // One batch id per Commit run (all chunks + Resume) so it can be undone as one import.
  const [resume, setResume] = useState(null);
  const [err, setErr] = useState('');
  const [drawer, setDrawer] = useState(true);
  const bottom = useRef(null);
  const ta = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const saved = loadChats();
    if (saved.length) {
      setChats(saved);
      setActiveId(saved[0].id);
    } else {
      const first = freshChat();
      setChats([first]);
      setActiveId(first.id);
    }
    setReady(true);
    fetch(`${API}/events?limit=100&include_empty=1`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
    // Series picker for the review table; without it the select only offers "none".
    call('/admin/series').then((d) => setSeriesKeys((d || []).map((x) => x.series_key).filter(Boolean))).catch(() => {});
  }, []);
  useEffect(() => { if (ready) saveChats(chats); }, [chats, ready]);
  // Self-heal: the active id must always name an existing chat, or send()
  // silently does nothing while the empty welcome screen looks normal.
  useEffect(() => {
    if (ready && chats.length && !chats.some((c) => c.id === activeId)) setActiveId(chats[0].id);
  }, [ready, chats, activeId]);
  const active = chats.find((c) => c.id === activeId) || null;
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [active?.msgs?.length, busy]);
  // A preview belongs to the records it checked. A new mapping, chat switch
  // or row delete drops it (and the acks/resume); an in-place edit only
  // marks it stale — issues stay visible, Commit waits for a new Validate.
  const keepStalePreview = useRef(false);
  useEffect(() => {
    if (keepStalePreview.current) {
      keepStalePreview.current = false;
      setPreview((p) => (p ? { ...p, stale: true } : p));
      return;
    }
    setPreview(null); setSeriesAck(false); setNamesAck(false); setProvisionalAck(false); setResume(null);
  }, [activeId, active?.analysis]);

  function patchActive(fn) {
    setChats((prev) => prev.map((c) => (c.id === activeId ? fn(c) : c)));
  }
  function newChat() {
    const c = { id: uid(), title: 'New conversation', updatedAt: Date.now(), msgs: [{ id: uid(), role: 'assistant', content: HELLO }], analysis: null };
    setChats((prev) => [c, ...prev]);
    setActiveId(c.id);
    setDrawer(false);
    setTimeout(() => ta.current?.focus(), 50);
  }
  // The self-heal effect above re-points activeId when the active chat goes.
  function removeChat(id) {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      return next.length ? next : [freshChat()];
    });
  }

  // Text is extracted in the browser (PDF via local worker) so only KBs
  // of text cross the Vercel proxy — raw multi-MB uploads get a 502 there.
  async function pickFile(f) {
    if (!f) return;
    setFile(f); setFileText(''); setErr('');
    if (!/\.pdf$/i.test(f.name || '')) return;
    setExtracting(true);
    try {
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const buf = await f.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      // Line-aware extraction: group items by y-coordinate so table rows
      // survive as lines (a flat join turns results into unreadable soup).
      // Tolerance is 6px: EvoEvents prints the horse and rider columns at
      // slightly different baselines, and 2px left them on separate lines.
      // Single-item lines keep their column as a tab prefix (rider column
      // is right of the header midpoint) so the server can tell a lone
      // horse fragment from a lone rider fragment.
      let out = '';
      for (let p = 1; p <= pdf.numPages && out.length < 400000; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        // Column boundary from the table header row itself (a class title
        // elsewhere on the page may also contain standalone Horse/Rider
        // words at unrelated x positions — never use those).
        const yBack = (tc.items.find((it) => (it.str || '').trim() === 'Back No')?.transform?.[5]) ?? null;
        const atHeader = (it) => yBack === null || Math.abs((it.transform?.[5] || 0) - yBack) < 8;
        const xHorse = tc.items.find((it) => (it.str || '').trim() === 'Horse' && atHeader(it))?.transform?.[4] || 0;
        const xRider = tc.items.find((it) => (it.str || '').trim() === 'Rider' && atHeader(it))?.transform?.[4] || 0;
        const boundary = xHorse && xRider ? (xHorse + xRider) / 2 : 0;
        const lines = new Map();
        for (const it of tc.items) {
          // Blank items (inter-word spacing) would fake multi-item lines
          // and break the single-fragment column detection — drop them;
          // the join below re-inserts spacing.
          if (!(it.str || '').trim()) continue;
          const y = Math.round((it.transform?.[5] || 0) / 6) * 6;
          if (!lines.has(y)) lines.set(y, []);
          lines.get(y).push({ x: it.transform?.[4] || 0, s: it.str });
        }
        const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0]);
        for (const [, items] of sorted) {
          items.sort((a, b) => a.x - b.x);
          const prefix = items.length === 1 && boundary && items[0].x > boundary ? '\t' : '';
          out += prefix + items.map((i) => i.s).join('  ') + '\n';
        }
        out += '\n';
      }
      if (!out.trim()) throw new Error('no text found (scanned images cannot be read)');
      setFileText(out);
    } catch (e) {
      setErr(`Could not read ${f.name}: ${e.message}. Try a CSV or pasted text instead.`);
      setFile(null);
    }
    setExtracting(false);
  }

  async function send(text, attachment) {
    if (!active || busy) return;
    // Text files are read locally; PDFs were pre-extracted at pick time —
    // only KBs of text travel, never the raw multi-MB binary.
    let attachedText = '';
    if (attachment) {
      if (/\.pdf$/i.test(attachment.name || '')) attachedText = fileText;
      else attachedText = await attachment.text().catch(() => '');
    }
    const userMsg = { id: uid(), role: 'user', content: text + (attachment ? `\n[attached: ${attachment.name}]` : '') };
    const base = [...active.msgs, userMsg];
    const isFirst = active.msgs.filter((m) => m.role === 'user').length === 0;
    const title = isFirst ? (text.slice(0, 44) || (attachment ? `File: ${attachment.name}` : 'New conversation')) : active.title;
    patchActive((c) => ({ ...c, title, updatedAt: Date.now(), msgs: base }));
    setInput(''); setFile(null); setFileText('');
    if (ta.current) ta.current.style.height = 'auto';
    setBusy('chat'); setErr('');
    try {
      // Text travels inside the chat transcript (no binary upload at all).
      const withText = attachedText
        ? [...base, { id: uid(), role: 'user', content: `File contents (${attachment.name}):\n${attachedText}` }]
        : base;
      const fd = new FormData();
      if (attachment) fd.append('filename', attachment.name);
      fd.append('messages', JSON.stringify(withText.map(({ role, content }) => ({ role, content })).slice(-12)));
      fd.append('session', active.id);
      const a = active.analysis;
      if (a) fd.append('context', JSON.stringify({ rounds: a.stats?.rounds, with_series: a.stats?.with_series }));
      // NOTE: the raw file is never uploaded — text was extracted in the
      // browser (PDF via worker, others via .text()). The 15MB server cap
      // and the ~4.5MB proxy cap only ever see KBs of text.
      const res = await fetch(`${API}/admin/import/chat`, { method: 'POST', credentials: 'include', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      const assistantMsg = { id: uid(), role: 'assistant', content: j.data.reply };
      patchActive((c) => ({
        ...c, updatedAt: Date.now(),
        msgs: [...base, assistantMsg],
        analysis: j.data.analysis?.records?.length ? j.data.analysis : c.analysis,
      }));
      // Background mapping jobs (AI path): poll until done, then swap the
      // placeholder message for the real summary + review panel. Polling
      // runs detached so the admin can keep chatting meanwhile; updates
      // land in the chat where the job started.
      if (j.data.job?.id) pollJob(j.data.job.id, assistantMsg.id, active.id);
    } catch (e) {
      patchActive((c) => ({ ...c, msgs: [...base, { id: uid(), role: 'assistant', content: `Sorry — ${e.message}`, error: true }] }));
    }
    setBusy(null);
  }

  async function pollJob(jobId, msgId, chatId) {
    const patchMsg = (fn) => setChats((prev) => prev.map((c) => (
      c.id === chatId ? { ...c, updatedAt: Date.now(), msgs: c.msgs.map((m) => (m.id === msgId ? fn(m) : m)) } : c
    )));
    for (let i = 0; i < 150; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      let d = null;
      try {
        const res = await fetch(`${API}/admin/import/jobs/${jobId}`, { credentials: 'include' });
        const j = await res.json().catch(() => ({}));
        if (res.ok) d = j.data;
      } catch { /* transient network blip — keep polling */ }
      if (!d) continue;
      if (d.status === 'done') {
        patchMsg((m) => ({ ...m, content: d.reply }));
        if (d.analysis?.records?.length) {
          setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, analysis: d.analysis } : c)));
        }
        return;
      }
      if (d.status === 'error') {
        patchMsg((m) => ({ ...m, content: `Mapping failed: ${d.error || 'unknown error'}. Try a smaller file or paste the results text.`, error: true }));
        return;
      }
      const n = d.progress?.done;
      if (n) patchMsg((m) => ({ ...m, content: `Mapping in the background… (${n} part${n > 1 ? 's' : ''} done, nothing saved yet)` }));
    }
    patchMsg((m) => ({ ...m, content: 'Mapping is taking unusually long — it may still finish. Resend the file if no summary appears.', error: true }));
  }

  // Chunked runs: the Vercel proxy kills requests past ~30s, and prod
  // rows cost ~0.5s each over the ocean link — so big files go in ~50-row
  // chunks with a progress readout. Each chunk is its own transaction, so
  // a commit can stop part-way: it then returns failedAt (first unsaved
  // record index) and the admin resumes from there. The server dup check
  // reads committed rows, so a retried chunk never double-imports.
  const CHUNK = 50;
  const [progress, setProgress] = useState(null);
  async function runChunked(records, dry, from = 0, batchId = null) {
    const rows = [];
    const evAgg = {};
    const blocking = new Map();
    const phase = dry ? 'Validating' : 'Committing';
    const result = (extra) => {
      const ok = rows.filter((r) => r.ok).length;
      return {
        dry_run: dry, rows, ...extra,
        summary: {
          total: records.length - from, ok, failed: rows.length - ok, enriched: 0, events: Object.values(evAgg),
          series_blocking: [...blocking].map(([name, n]) => ({ name, rows: n })),
        },
      };
    };
    for (let i = from; i < records.length; i += CHUNK) {
      setProgress({ done: i, total: records.length, phase });
      // `ungrounded` travels so the server can enforce the same name gate.
      const body = { records: records.slice(i, i + CHUNK), dry_run: dry };
      if (!dry) {
        body.batch_id = batchId;
        if (seriesAck) body.series_ack = true;
        if (namesAck) body.names_ack = true;
        if (provisionalAck) body.provisional_ack = true;
      }
      if (eventId === '__new__') {
        body.event = { name: evNew.name.trim(), date_start: evNew.date_start, date_end: evNew.date_start, venue: evNew.venue.trim() };
      } else {
        body.event_id = eventId;
      }
      let d;
      try {
        d = await call('/admin/import', { method: 'POST', body: JSON.stringify(body) });
      } catch (e) {
        if (dry) throw e;
        return result({ failedAt: i, error: e.message });
      }
      for (const r of d.rows) rows.push({ ...r, line: i + r.line - 1 });
      for (const e of d.summary.events || []) {
        (evAgg[e.id] ||= { ...e, ok: 0, failed: 0 }).ok += e.ok;
        evAgg[e.id].failed += e.failed;
      }
      for (const b of d.summary.series_blocking || []) blocking.set(b.name, (blocking.get(b.name) || 0) + b.rows);
    }
    setProgress({ done: records.length, total: records.length, phase });
    return result({});
  }

  async function run(dry, from = 0) {
    setErr('');
    const analysis = active?.analysis;
    if (!analysis?.records?.length) { setErr('Nothing to import yet — ask me to read a link or file first.'); return; }
    if (analysis.blocking) { setErr('This file could not be read reliably — import the EvoEvents results link instead.'); return; }
    if (eventId !== '__new__' && !eventId) { setErr('Pick a target event (rows without their own event need one).'); return; }
    if (eventId === '__new__' && (!evNew.name.trim() || !evNew.date_start)) { setErr('New event needs a name and start date.'); return; }
    setBusy(dry ? 'validate' : 'commit');
    try {
      const batchId = dry ? null : (resume?.batchId || crypto.randomUUID());
      const d = await runChunked(analysis.records, dry, from, batchId);
      if (dry) {
        setPreview(d);
      } else {
        // Saved/failed counts carry over from earlier partial runs.
        const saved = (resume?.saved || 0) + d.summary.ok;
        const failed = (resume?.failed || 0) + d.summary.failed;
        if (d.failedAt !== undefined) {
          setResume({ from: d.failedAt, saved, failed, error: d.error, batchId });
        } else {
          const evNames = (d.summary.events || []).map((e) => e.name).join(', ');
          patchActive((c) => ({
            ...c, updatedAt: Date.now(),
            msgs: [...c.msgs, { id: uid(), role: 'assistant', content: `✅ Imported **${saved}** rounds${evNames ? ` into ${evNames}` : ''}${failed ? ` (${failed} failed and were not saved)` : ''}. The review form is cleared; send a new link or file whenever ready. Made a mistake? Undo this import from **Admin → Import → Undoable imports**.` }],
            analysis: null,
          }));
        }
      }
    } catch (e) { setErr(e.message); }
    setBusy(null);
    setProgress(null);
  }

  const analysis = active?.analysis || null;
  const seriesBlocking = (preview?.dry_run && preview.summary.series_blocking) || [];
  const ungroundedRows = (analysis?.records || []).filter((r) => r.ungrounded?.length);
  const provisionalClasses = analysis?.provisional || [];
  // Parser could not read the file reliably: nothing from it may be saved.
  const fileBlocked = analysis?.blocking || null;
  const lockReason = commitLockReason({
    fileBlocked, preview, resume, seriesBlockingCount: seriesBlocking.length, seriesAck,
    ungroundedCount: ungroundedRows.length, namesAck,
    provisionalCount: provisionalClasses.length, provisionalAck,
  });
  const commitBlocked = !!lockReason;
  // Edits keep the (now stale) preview; deletes shift row positions, so the
  // preview is dropped entirely (effect above).
  function setRecords(fn, { edit = false } = {}) {
    keepStalePreview.current = edit;
    patchActive((c) => (c.analysis ? { ...c, updatedAt: Date.now(), analysis: withRecords(c.analysis, fn(c.analysis.records)) } : c));
  }
  // Source text is not kept client-side, so an edited name keeps its
  // ungrounded flag; the "I checked these names" ack covers it.
  function editRecord(index, field, value) {
    setRecords((records) => records.map((r, i) => {
      if (i !== index) return r;
      const next = { ...r, [field]: value };
      if (value === '') delete next[field];
      return next;
    }), { edit: true });
  }
  // "Use <existing name>": fix every row that carries the same new name.
  function replaceName(field, from, to) {
    setRecords((records) => records.map((r) => (r[field] === from ? { ...r, [field]: to } : r)), { edit: true });
  }
  function deleteRecord(index) {
    setRecords((records) => records.filter((_, i) => i !== index));
  }
  function removeUngrounded() {
    patchActive((c) => {
      const next = withRecords(c.analysis, c.analysis.records.filter((r) => !r.ungrounded?.length));
      return { ...c, updatedAt: Date.now(), analysis: { ...next, warnings: next.warnings.filter((w) => !w.includes(NAMES_NOT_FOUND)) } };
    });
  }
  const isFresh = (active?.msgs || []).filter((m) => m.role === 'user').length === 0;
  const timeFmt = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div>
          <h1 className={H1}>Import Assistant</h1>
          <p className={SUB}>Chat, link or upload results — I map them, you approve. Nothing saves until you commit.</p>
        </div>
        <span className="flex-1" />
        <button onClick={() => setDrawer((o) => !o)}
          className="rounded border border-line px-3 py-2 text-[13px] text-muted hover:text-white bg-none cursor-pointer">☰ History</button>
      </div>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <div className="flex gap-4 items-start">
        {/* history */}
        <aside className={`${drawer ? 'block' : 'hidden'} fixed inset-y-0 left-0 z-40 w-72 p-3 bg-card border-r border-line overflow-y-auto lg:static lg:z-auto lg:w-60 lg:shrink-0 lg:rounded lg:border lg:border-line lg:bg-card lg:p-2`}>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={newChat}
              className="grow rounded-lg border border-gold/60 px-3 py-2 text-[13px] font-bold text-gold bg-none cursor-pointer hover:bg-goldbg/40">＋ New chat</button>
            <button onClick={() => setDrawer(false)} aria-label="Close history"
              className="lg:hidden rounded-lg border border-line px-2.5 py-2 text-muted bg-none cursor-pointer">×</button>
          </div>
          <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
            {chats.map((c) => (
              <div key={c.id}
                onClick={() => { setActiveId(c.id); setDrawer(false); }}
                className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-2 cursor-pointer ${c.id === activeId ? 'bg-goldbg/40 text-white' : 'text-muted hover:bg-white/5 hover:text-white'}`}>
                <span className="grow truncate text-[13px]">{c.title}</span>
                <span className="text-[11px] text-faint shrink-0">{timeFmt(c.updatedAt)}</span>
                <button title="Delete" onClick={(e) => { e.stopPropagation(); removeChat(c.id); }}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-faint hover:text-blood bg-none border-0 cursor-pointer text-[14px] px-1">×</button>
              </div>
            ))}
          </div>
        </aside>
        {drawer && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setDrawer(false)} />}
        {/* chat */}
        <section className="grow min-w-0 flex flex-col" style={{ minHeight: 600 }}>
          <div className="mx-auto w-full max-w-[780px] flex flex-col grow">
            {isFresh ? (
              <div className="flex flex-col items-center justify-center text-center py-14">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold text-[20px] font-extrabold text-black mb-4">✦</span>
                <h2 className="text-[22px] font-extrabold">What are we importing today?</h2>
                <p className="text-muted text-[14px] mt-1 mb-6">A show link, a results file, or just a question.</p>
                <div className="grid gap-2.5 sm:grid-cols-3 w-full max-w-[640px]">
                  {SUGGESTIONS.map(([icon, t, d]) => (
                    <button key={t} disabled={!!busy} onClick={() => send(t === 'Ask about scoring' ? 'Why would a row score 0?' : t === 'Upload results' ? 'What formats can you read?' : 'Import an Equipe show URL')}
                      className="rounded-xl border border-line bg-card p-3.5 text-left hover:border-gold/50 bg-none cursor-pointer disabled:opacity-50">
                      <div className="text-[20px]">{icon}</div>
                      <div className="text-[14px] font-bold text-white mt-1.5">{t}</div>
                      <div className="text-[12px] text-muted mt-0.5">{d}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5 overflow-y-auto grow pr-1 py-2" style={{ maxHeight: 560 }}>
                {(active?.msgs || []).map((m) => (
                  m.role === 'user' ? (
                    <div key={m.id} className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-goldbg/50 px-4 py-2.5 text-[14px] leading-relaxed text-white [overflow-wrap:anywhere]">
                      <Rich text={m.content} />
                    </div>
                  ) : (
                    <div key={m.id} className="group flex gap-3 items-start">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-[13px] font-extrabold text-black">✦</span>
                      <div className="min-w-0 grow">
                        <div className={`text-[14px] leading-relaxed ${m.error ? 'text-blood' : 'text-body'}`}>
                          <Rich text={m.content} />
                        </div>
                        {!m.error && <div className="mt-1"><CopyBtn text={m.content} /></div>}
                      </div>
                    </div>
                  )
                ))}
                {busy === 'chat' && (
                  <div className="flex gap-3 items-center">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-[13px] font-extrabold text-black">✦</span>
                    <div className="flex gap-1.5 py-2">
                      {[0, 1, 2].map((i) => <span key={i} className="sk h-2 w-2 rounded-full" style={{ animationDelay: `${i * 0.15}s` }} />)}
                    </div>
                  </div>
                )}
                <div ref={bottom} />
              </div>
            )}
            <div className="mt-auto pt-3">
              {(analysis || preview) && (
                <div className="mb-3 rounded-2xl border border-gold/40 bg-goldbg/20 p-3.5">
                  {analysis && (
                    <>
                      <div className="mb-1 text-[14px] font-bold">Mapped: {analysis.detected.type}
                        <span className="ml-2 text-[12px] text-muted font-semibold">{analysis.stats.rounds} rounds · {analysis.stats.with_series} with series</span></div>
                      {!!analysis.warnings.length && (
                        <ul className="text-[13px] text-gold mb-2">{analysis.warnings.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}</ul>
                      )}
                      {fileBlocked && (
                        <div role="alert" className="mb-2 rounded-md border border-blood/60 bg-redbg p-2.5 text-[13px] text-body [overflow-wrap:anywhere]">
                          <p className="font-bold text-blood">This file cannot be imported as read</p>
                          <p className="mt-1">{fileBlocked}</p>
                        </div>
                      )}
                      {provisionalClasses.length > 0 && (
                        <div className="mb-2 rounded-md border border-gold/50 bg-ink p-2.5 text-[13px]">
                          <p className="font-bold text-gold">{provisionalClasses.length} class(es) are provisional — the organiser has not approved these results yet</p>
                          <p className="mt-0.5 text-faint">Placings and times may still change. Importing now means re-checking later (or undoing and importing again).</p>
                          <ul className="mt-1 text-muted">
                            {provisionalClasses.slice(0, 6).map((c) => <li key={c.name} className="[overflow-wrap:anywhere]">{c.name} · {c.rows} row(s)</li>)}
                            {provisionalClasses.length > 6 && <li>…and {provisionalClasses.length - 6} more</li>}
                          </ul>
                          <label className="mt-2 flex items-center gap-2 text-body cursor-pointer">
                            <input type="checkbox" checked={provisionalAck} onChange={(e) => setProvisionalAck(e.target.checked)} className="h-4 w-4 accent-gold" />
                            Import provisional results anyway
                          </label>
                        </div>
                      )}
                      {ungroundedRows.length > 0 && (
                        <div className="mb-2 rounded-md border border-gold/50 bg-ink p-2.5 text-[13px]">
                          <p className="font-bold text-gold">{ungroundedRows.length} row(s) have names not found in the source text</p>
                          <p className="mt-0.5 text-faint">The AI may have misread or invented these. Check them against the file.</p>
                          <ul className="mt-1 text-muted">
                            {ungroundedRows.slice(0, 8).map((r, i) => (
                              <li key={i} className="[overflow-wrap:anywhere]">{r.class_name || '–'} · <span className={r.ungrounded.includes('rider') ? 'text-blood' : ''}>{r.rider_name || '–'}</span> · <span className={r.ungrounded.includes('horse') ? 'text-blood' : ''}>{r.horse_name || '–'}</span></li>
                            ))}
                            {ungroundedRows.length > 8 && <li>…and {ungroundedRows.length - 8} more</li>}
                          </ul>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <button className={BTN_DANGER} disabled={!!busy} onClick={removeUngrounded}>Remove these rows</button>
                            <label className="flex items-center gap-2 text-body cursor-pointer">
                              <input type="checkbox" checked={namesAck} onChange={(e) => setNamesAck(e.target.checked)} className="h-4 w-4 accent-gold" />
                              I checked these names
                            </label>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 items-end">
                        <label className="text-xs text-muted flex flex-col gap-1 grow min-w-[200px]">Target event
                          <Dropdown ariaLabel="Target event" value={eventId} searchable placeholder="— select —"
                            options={[{ value: '', label: '— select —' }, { value: '__new__', label: '＋ New event…' },
                              ...events.map((e) => ({ value: e.id, label: `${e.name} · ${nzDay(e.date_start)}` }))]}
                            onSelect={(o) => setEventId(o.value)} /></label>
                        <button className={BTN_PRIMARY} disabled={!!busy || !!fileBlocked} onClick={() => run(true)}>{busy === 'validate' ? `Validating… ${progress ? `${progress.done}/${progress.total}` : ''}` : 'Validate & preview →'}</button>
                        <button className={BTN_DANGER} disabled={!!busy || commitBlocked} onClick={() => run(false)}>{busy === 'commit' ? `Committing… ${progress ? `${progress.done}/${progress.total}` : ''}` : 'Commit'}</button>
                      </div>
                      {lockReason && !busy && (
                        <p className="mt-1 text-right text-[12px] text-faint" aria-live="polite">Commit locked: {lockReason}</p>
                      )}
                      {resume && (
                        <div role="alert" className="mt-2 rounded-md border border-blood/50 bg-ink p-2.5 text-[13px] text-body">
                          <p><b className="text-blood">Commit stopped at row {resume.from + 1}.</b> {resume.error}</p>
                          <p className="mt-1 text-muted">{resume.from === 0
                            ? 'Nothing was saved.'
                            : `${resume.saved} row(s) saved from rows 1–${resume.from}${resume.failed ? ` (${resume.failed} of those failed and were not saved)` : ''}. Nothing from row ${resume.from + 1} onward was saved. Resume to finish, or undo the saved part from Admin → Import → Undoable imports.`}</p>
                          <button className={`${BTN_DANGER} mt-2`} disabled={!!busy} onClick={() => run(false, resume.from)}>
                            {busy === 'commit' ? `Resuming… ${progress ? `${progress.done}/${progress.total}` : ''}` : `Resume commit from row ${resume.from + 1}`}</button>
                        </div>
                      )}
                      {!!progress && progress.total > 0 && (
                        <div className="mt-2 h-1.5 rounded bg-[#2A2A2A]"><div className="h-1.5 rounded bg-gold transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${Math.round((100 * progress.done) / progress.total)}%` }} /></div>
                      )}
                      {eventId === '__new__' && (
                        <div className="grid sm:grid-cols-3 gap-2 mt-2">
                          {[['name', 'Event name*'], ['date_start', 'Start date* (YYYY-MM-DD)'], ['venue', 'Venue']].map(([k, lbl]) => (
                            <input key={k} value={evNew[k]} onChange={(e) => setEvNew({ ...evNew, [k]: e.target.value })} placeholder={lbl}
                              className="rounded-md border border-line bg-ink px-2.5 py-2 text-[13px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {preview && (
                    <div className="mt-2 border-t border-gold/30 pt-2">
                      <div className="mb-1 text-[14px] font-bold">{preview.dry_run ? 'Preview (nothing saved)' : 'Import result'}
                        <span className="ml-2 text-[12px] text-muted font-semibold">{preview.summary.ok} ok · {preview.summary.failed} failed</span></div>
                      {preview.stale && (
                        <p role="status" className="mb-1.5 rounded-md border border-gold/50 bg-ink px-2.5 py-1.5 text-[13px] text-gold">
                          You changed rows since this preview — the checks below are from the last Validate. Validate again before Commit.{' '}
                          <button type="button" className="font-bold underline underline-offset-2 bg-transparent border-0 p-0 text-gold cursor-pointer disabled:opacity-50" disabled={!!busy} onClick={() => run(true)}>Validate now</button>
                        </p>
                      )}
                      {seriesBlocking.length > 0 && (
                        <div className="mt-2 rounded-md border border-gold/50 bg-ink p-2.5 text-[13px]">
                          <p className="font-bold text-gold">{seriesBlocking.length} class(es) look like series classes but have no series tag</p>
                          <ul className="mt-1 text-muted">
                            {seriesBlocking.slice(0, 6).map((b) => <li key={b.name} className="[overflow-wrap:anywhere]">{b.name} · {b.rows} row(s)</li>)}
                            {seriesBlocking.length > 6 && <li>…and {seriesBlocking.length - 6} more</li>}
                          </ul>
                          <p className="mt-1 text-faint">Pick a series for them in the table below and validate again, or confirm here.</p>
                          <label className="mt-2 flex items-center gap-2 text-body cursor-pointer">
                            <input type="checkbox" checked={seriesAck} onChange={(e) => setSeriesAck(e.target.checked)} className="h-4 w-4 accent-gold" />
                            These classes are not series classes
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                  {analysis?.records?.length > 0 && (
                    <ReviewTable key={activeId} records={analysis.records} preview={preview} seriesKeys={seriesKeys}
                      disabled={!!busy} onEdit={editRecord} onReplace={replaceName} onDelete={deleteRecord}
                      seriesAck={seriesAck} namesAck={namesAck} />
                  )}
                </div>
              )}
              {!isFresh && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {QUICK.map((q) => (
                    <button key={q} disabled={!!busy} onClick={() => send(q)}
                      className="text-[12px] rounded-full border border-line px-2.5 py-1 text-muted hover:text-gold hover:border-gold/50 bg-none cursor-pointer disabled:opacity-50">{q}</button>
                  ))}
                </div>
              )}
              <div className="rounded-2xl border border-line bg-card p-2 focus-within:border-gold/60">
                {file && (
                  <div className="flex items-center gap-2 px-2 pt-1 text-[13px] text-gold">
                    <span className="truncate">📎 {file.name} ({(file.size / 1024).toFixed(0)} KB{/\.pdf$/i.test(file.name) && fileText ? ` → ${(fileText.length / 1024).toFixed(0)} KB text` : ''})</span>
                    <button onClick={() => { setFile(null); setFileText(''); }} className="text-faint hover:text-blood bg-none border-0 cursor-pointer">×</button>
                  </div>
                )}
                <div className="flex gap-2 items-end p-1">
                  <button title="Attach PDF, CSV, TXT or JSON" onClick={() => fileRef.current?.click()}
                    className="rounded-xl px-2.5 py-2 text-[16px] text-muted hover:text-white hover:bg-white/5 bg-none border-0 cursor-pointer shrink-0">📎</button>
                  <input ref={fileRef} type="file" accept=".pdf,.csv,.txt,.json,text/*,application/json" className="hidden"
                    onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
                  <textarea ref={ta} rows={1} value={extracting ? 'Reading PDF…' : input} disabled={extracting} onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && (input.trim() || file)) { e.preventDefault(); send(input.trim() || 'Please read this file.', file); } }}
                    onInput={() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; } }}
                    placeholder="Message…"
                    className="grow bg-transparent px-1 py-2 text-[14px] text-body placeholder:text-faint focus:outline-none resize-none" />
                  <button disabled={!!busy || (!input.trim() && !file)} onClick={() => send(input.trim() || 'Please read this file.', file)}
                    aria-label="Send"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-[16px] font-bold text-black cursor-pointer disabled:opacity-40">↑</button>
                </div>
              </div>
              <p className="mt-1.5 text-center text-[12px] text-faint">Assistant maps results only — Validate & preview, then Commit, before anything is saved.</p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
