'use client';
// Import Assistant — ChatGPT-style chat, separate from CSV import.
// Sidebar holds conversation history (persisted locally, resumable).
// Chat, link or upload results → records summary → validate & preview →
// commit on the side panel. The assistant never writes anything itself.
import { useEffect, useRef, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, BTN_PRIMARY, BTN_DANGER, badge, BADGE } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import Dropdown from '../../../components/Dropdown';

const LS_KEY = 'eq-assistant-chats';
const uid = () => Math.random().toString(36).slice(2);
const QUICK = ['Import an Equipe show URL', 'What formats can you read?', 'Why would a row score 0?'];
const HELLO = 'Hi — send me an Equipe show link, paste results text, or upload a file (PDF, CSV, TXT, JSON). I’ll map it and show a summary before anything is saved.';

// Tiny markdown-lite: **bold**, `code`, line breaks.
function Rich({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <b key={i}>{p.slice(2, -2)}</b>;
        if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
          return <code key={i} className="rounded bg-ink px-1 py-px text-[12.5px] text-gold">{p.slice(1, -1)}</code>;
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

export default function AdminAssistant() {
  const call = useAdminApi();
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [evNew, setEvNew] = useState({ name: '', date_start: '', venue: '' });
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const [sideOpen, setSideOpen] = useState(false);
  const bottom = useRef(null);
  const ta = useRef(null);

  useEffect(() => {
    const saved = loadChats();
    if (saved.length) {
      setChats(saved);
      setActiveId(saved[0].id);
    } else {
      const first = { id: uid(), title: 'New conversation', updatedAt: Date.now(), msgs: [{ id: uid(), role: 'assistant', content: HELLO }], analysis: null };
      setChats([first]);
      setActiveId(first.id);
    }
    fetch(`${API}/events?limit=100&include_empty=1`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
  }, []);
  useEffect(() => { saveChats(chats); }, [chats]);
  const active = chats.find((c) => c.id === activeId) || null;
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [active?.msgs?.length, busy]);
  useEffect(() => { setPreview(null); }, [activeId]);

  function patchActive(fn) {
    setChats((prev) => prev.map((c) => (c.id === activeId ? fn(c) : c)));
  }
  function newChat() {
    const c = { id: uid(), title: 'New conversation', updatedAt: Date.now(), msgs: [{ id: uid(), role: 'assistant', content: HELLO }], analysis: null };
    setChats((prev) => [c, ...prev]);
    setActiveId(c.id);
    setSideOpen(false);
  }
  function removeChat(id) {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeId === id) setActiveId(next[0]?.id || null);
      if (!next.length) {
        const c = { id: uid(), title: 'New conversation', updatedAt: Date.now(), msgs: [{ id: uid(), role: 'assistant', content: HELLO }], analysis: null };
        return [c];
      }
      return next;
    });
  }

  async function send(text, attachment) {
    if (!active) return;
    const userMsg = { id: uid(), role: 'user', content: text + (attachment ? `\n[attached: ${attachment.name}]` : '') };
    const base = [...active.msgs, userMsg];
    const title = active.msgs.filter((m) => m.role === 'user').length === 0
      ? text.slice(0, 42) || (attachment ? `File: ${attachment.name}` : 'New conversation')
      : active.title;
    patchActive((c) => ({ ...c, title, updatedAt: Date.now(), msgs: base }));
    setInput(''); setFile(null); setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('messages', JSON.stringify(base.map(({ role, content }) => ({ role, content })).slice(-12)));
      fd.append('session', active.id);
      const a = active.analysis;
      if (a) fd.append('context', JSON.stringify({ rounds: a.stats?.rounds, with_series: a.stats?.with_series }));
      if (attachment) fd.append('file', attachment);
      const res = await fetch(`${API}/admin/import/chat`, { method: 'POST', credentials: 'include', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      patchActive((c) => ({
        ...c, updatedAt: Date.now(),
        msgs: [...base, { id: uid(), role: 'assistant', content: j.data.reply }],
        analysis: j.data.analysis?.records?.length ? j.data.analysis : c.analysis,
      }));
    } catch (e) {
      patchActive((c) => ({ ...c, msgs: [...base, { id: uid(), role: 'assistant', content: `Sorry — ${e.message}`, error: true }] }));
    }
    setBusy(false);
  }

  async function run(dry) {
    setErr('');
    const analysis = active?.analysis;
    if (!analysis?.records?.length) { setErr('Nothing to import yet — ask me to read a link or file first.'); return; }
    if (eventId !== '__new__' && !eventId) { setErr('Pick a target event (rows without their own event need one).'); return; }
    if (eventId === '__new__' && (!evNew.name.trim() || !evNew.date_start)) { setErr('New event needs a name and start date.'); return; }
    setBusy(true);
    try {
      const body = { records: analysis.records, dry_run: dry };
      if (eventId === '__new__') {
        body.event = { name: evNew.name.trim(), date_start: evNew.date_start, date_end: evNew.date_start, venue: evNew.venue.trim() };
      } else {
        body.event_id = eventId;
      }
      const d = await call('/admin/import', { method: 'POST', body: JSON.stringify(body) });
      setPreview(d);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const analysis = active?.analysis || null;
  const timeFmt = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div>
          <h1 className={H1}>Import Assistant</h1>
          <p className={SUB}>Chat, link or upload results — I map them, you approve. Nothing saves until you commit.</p>
        </div>
        <span className="flex-1" />
        <button onClick={() => setSideOpen((o) => !o)}
          className="lg:hidden rounded border border-line px-3 py-2 text-[13px] text-muted hover:text-white bg-none cursor-pointer">☰ Chats</button>
      </div>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <div className="flex gap-4 items-start">
        {/* history sidebar */}
        <aside className={`${sideOpen ? 'block' : 'hidden'} lg:block w-60 shrink-0 rounded border border-line bg-card p-2`}>
          <button onClick={newChat}
            className="w-full rounded border border-gold/60 px-3 py-2 text-[13px] font-bold text-gold bg-none cursor-pointer hover:bg-goldbg/40 mb-2">＋ New chat</button>
          <div className="flex flex-col gap-1 max-h-[520px] overflow-y-auto">
            {chats.map((c) => (
              <div key={c.id}
                onClick={() => { setActiveId(c.id); setSideOpen(false); }}
                className={`group flex items-center gap-1.5 rounded px-2.5 py-2 cursor-pointer ${c.id === activeId ? 'bg-goldbg/40 text-white' : 'text-muted hover:bg-white/5 hover:text-white'}`}>
                <span className="grow truncate text-[13px]">{c.title}</span>
                <span className="text-[11px] text-faint shrink-0">{timeFmt(c.updatedAt)}</span>
                <button title="Delete" onClick={(e) => { e.stopPropagation(); removeChat(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-faint hover:text-blood bg-none border-0 cursor-pointer text-[13px] px-1">×</button>
              </div>
            ))}
          </div>
        </aside>
        {/* chat column */}
        <section className={`${CARD} grow min-w-0 flex flex-col`} style={{ minHeight: 560 }}>
          <div className="flex flex-col gap-3 overflow-y-auto grow pr-1" style={{ maxHeight: 520 }}>
            {(active?.msgs || []).map((m) => (
              m.role === 'user' ? (
                <div key={m.id} className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-goldbg/50 px-3.5 py-2.5 text-[13.5px] text-white">
                  <Rich text={m.content} />
                </div>
              ) : (
                <div key={m.id} className="flex gap-2.5 items-start">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-[13px] font-extrabold text-black">✨</span>
                  <div className={`max-w-[92%] rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[13.5px] leading-relaxed ${m.error ? 'bg-redbg/40 text-blood' : 'bg-card2 text-body'}`}>
                    <Rich text={m.content} />
                  </div>
                </div>
              )
            ))}
            {busy && (
              <div className="flex gap-2.5 items-center">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-[13px] font-extrabold text-black">✨</span>
                <div className="flex gap-1 rounded-2xl rounded-tl-md bg-card2 px-3.5 py-3">
                  {[0, 1, 2].map((i) => <span key={i} className="sk h-2 w-2 rounded-full" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
            <div ref={bottom} />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3 mb-2">
            {QUICK.map((q) => (
              <button key={q} disabled={busy} onClick={() => send(q)}
                className="text-[12px] rounded-full border border-line px-2.5 py-1 text-muted hover:text-gold hover:border-gold/50 bg-none cursor-pointer disabled:opacity-50">{q}</button>
            ))}
          </div>
          <div className="flex gap-2 items-end border-t border-line pt-3">
            <label title="Upload PDF, CSV, TXT or JSON"
              className="rounded-xl border border-line px-3 py-2.5 text-[13px] text-muted hover:text-white hover:border-faint cursor-pointer shrink-0">
              📎
              <input type="file" accept=".pdf,.csv,.txt,.json,text/*,application/json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />
            </label>
            <div className="flex flex-col grow gap-1">
              {file && (
                <span className="text-[12px] text-gold">📎 {file.name} <button onClick={() => setFile(null)} className="text-faint hover:text-blood bg-none border-0 cursor-pointer ml-1">×</button></span>
              )}
              <textarea ref={ta} rows={1} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && (input.trim() || file)) { e.preventDefault(); send(input.trim() || 'Please read this file.', file); } }}
                onInput={() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; } }}
                placeholder="Message the assistant… (Enter to send, Shift+Enter for new line)"
                className="rounded-xl border border-line bg-ink px-3.5 py-2.5 text-[13.5px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none resize-none" />
            </div>
            <button disabled={busy || (!input.trim() && !file)} onClick={() => send(input.trim() || 'Please read this file.', file)}
              className="rounded-xl bg-gold px-5 py-2.5 text-[14px] font-bold text-black cursor-pointer disabled:opacity-50 shrink-0">↑</button>
          </div>
        </section>
        {/* review panel */}
        {(analysis || preview) && (
          <div className="w-[340px] shrink-0 flex flex-col gap-4 max-lg:hidden">
            {analysis && (
              <section className={CARD}>
                <h2 className="text-[15px] font-bold mb-1">Mapped: {analysis.detected.type}
                  <span className="ml-2 text-[12px] text-muted font-semibold">{analysis.stats.rounds} rounds · {analysis.stats.with_series} with series</span></h2>
                {!!analysis.warnings.length && (
                  <ul className="text-[12.5px] text-gold mb-2">{analysis.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}</ul>
                )}
                <label className="text-xs text-muted flex flex-col gap-1 mb-2">Target event
                  <Dropdown ariaLabel="Target event" value={eventId} searchable placeholder="— select —"
                    options={[{ value: '', label: '— select —' }, { value: '__new__', label: '＋ New event…' },
                      ...events.map((e) => ({ value: e.id, label: `${e.name} · ${(e.date_start || '').slice(0, 10)}` }))]}
                    onSelect={(o) => setEventId(o.value)} /></label>
                {eventId === '__new__' && (
                  <div className="grid gap-2 mb-2">
                    {[['name', 'Event name*'], ['date_start', 'Start date* (YYYY-MM-DD)'], ['venue', 'Venue']].map(([k, lbl]) => (
                      <input key={k} value={evNew[k]} onChange={(e) => setEvNew({ ...evNew, [k]: e.target.value })} placeholder={lbl}
                        className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" />
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button className={BTN_PRIMARY} disabled={busy} onClick={() => run(true)}>{busy ? 'Working…' : 'Validate & preview →'}</button>
                  <button className={BTN_DANGER} disabled={busy || !preview || preview.dry_run === false} onClick={() => run(false)}>Commit</button>
                </div>
              </section>
            )}
            {preview && (
              <section className={CARD}>
                <h2 className="text-[15px] font-bold mb-1">{preview.dry_run ? 'Preview (nothing saved)' : 'Import result'}
                  <span className="ml-2 text-[12px] text-muted font-semibold">{preview.summary.ok} ok · {preview.summary.failed} failed</span></h2>
                <div className={TABLEWRAP}>
                <table className={TABLE}>
                  <thead><tr><th className={TH}>Rider</th><th className={TH}>Horse</th><th className={`${TH} ${NUM}`}>Pts</th><th className={TH}>Flags</th></tr></thead>
                  <tbody>
                    {preview.rows.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        <td className={TD}>{r.preview?.rider || '–'}</td>
                        <td className={TD}>{r.preview?.horse || '–'}</td>
                        <td className={`${TD} ${NUM}`}><b className={r.ok ? 'text-gold' : 'text-faint'}>{r.ok ? r.preview.points : '–'}</b></td>
                        <td className={TD}>{r.ok
                          ? <>{r.preview.new_horse && <span className={badge(BADGE.blue)}>new</span>}</>
                          : <span className={badge(BADGE.red)}>{(r.errors || []).join('; ')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {preview.rows.length > 10 && <p className="text-[12px] text-faint mt-1">Showing 10 of {preview.rows.length} rows.</p>}
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}
