'use client';
// Import Assistant — conversational results import, separate from CSV import.
// Chat (link, pasted text, uploaded PDF/CSV/TXT/JSON) → records summary →
// validate & preview → commit. The assistant never writes anything itself.
import { useEffect, useRef, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY, BTN_DANGER, badge, BADGE } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import Dropdown from '../../../components/Dropdown';

const uid = () => Math.random().toString(36).slice(2);
const QUICK = ['Import an Equipe show URL', 'What formats can you read?', 'Why would a row score 0?'];

export default function AdminAssistant() {
  const call = useAdminApi();
  const [session] = useState(() => `chat-${Date.now().toString(36)}`);
  const [msgs, setMsgs] = useState([{
    id: uid(), role: 'assistant',
    content: 'Hi — send me an Equipe show link, paste results text, or upload a file (PDF, CSV, TXT, JSON). I’ll map it and show a summary before anything is saved.',
  }]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [evNew, setEvNew] = useState({ name: '', date_start: '', venue: '' });
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const bottom = useRef(null);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);
  useEffect(() => {
    fetch(`${API}/events?limit=100&include_empty=1`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
  }, []);

  async function send(text, attachment) {
    const userMsg = { id: uid(), role: 'user', content: text + (attachment ? `\n[attached: ${attachment.name}]` : '') };
    const next = [...msgs, userMsg];
    setMsgs(next);
    setInput(''); setFile(null); setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('messages', JSON.stringify(next.filter((m) => m.role !== 'system').map(({ role, content }) => ({ role, content })).slice(-10)));
      fd.append('session', session);
      if (analysis) fd.append('context', JSON.stringify({ rounds: analysis.stats?.rounds, with_series: analysis.stats?.with_series }));
      if (attachment) fd.append('file', attachment);
      const res = await fetch(`${API}/admin/import/chat`, { method: 'POST', credentials: 'include', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setMsgs([...next, { id: uid(), role: 'assistant', content: j.data.reply }]);
      if (j.data.analysis?.records?.length) { setAnalysis(j.data.analysis); setPreview(null); }
    } catch (e) {
      setMsgs([...next, { id: uid(), role: 'assistant', content: `Sorry — ${e.message}`, error: true }]);
    }
    setBusy(false);
  }

  async function run(dry) {
    setErr('');
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
      const res = await fetch(`${API}/admin/import`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setPreview(j.data);
      if (!dry) { setAnalysis(null); setPreview(j.data); }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <>
      <h1 className={H1}>Import Assistant</h1>
      <p className={SUB}>Chat, link or upload results — I map them, you approve. Nothing saves until you commit.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className={CARD}>
          <div className="flex flex-col gap-2.5 max-h-[480px] overflow-y-auto mb-3">
            {msgs.map((m) => (
              <div key={m.id} className={`max-w-[85%] rounded px-3 py-2 text-[13.5px] whitespace-pre-wrap ${m.role === 'user' ? 'ml-auto bg-goldbg/40 text-white' : m.error ? 'bg-redbg/40 text-blood' : 'bg-card2 text-body'}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="bg-card2 rounded px-3 py-2 text-[13px] text-muted w-fit">Working…</div>}
            <div ref={bottom} />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {QUICK.map((q) => (
              <button key={q} disabled={busy} onClick={() => send(q)}
                className="text-[12px] rounded-full border border-line px-2.5 py-1 text-muted hover:text-gold hover:border-gold/50 bg-none cursor-pointer disabled:opacity-50">{q}</button>
            ))}
          </div>
          <div className="flex gap-2 items-end">
            <label title="Upload PDF, CSV, TXT or JSON"
              className="rounded border border-line px-3 py-2 text-[13px] text-muted hover:text-white hover:border-faint cursor-pointer shrink-0">
              📎 {file ? file.name.slice(0, 18) : 'File'}
              <input type="file" accept=".pdf,.csv,.txt,.json,text/*,application/json" className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && (input.trim() || file)) { e.preventDefault(); send(input.trim() || `Please read this file.`, file); } }}
              placeholder="Paste an Equipe link, results text, or a question…"
              className="grow rounded border border-line bg-ink px-3 py-2 text-[13.5px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" />
            <button className={BTN_PRIMARY} disabled={busy || (!input.trim() && !file)}
              onClick={() => send(input.trim() || 'Please read this file.', file)}>Send</button>
          </div>
        </section>
        <div className="flex flex-col gap-4">
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
                <thead><tr><th className={TH}>Rider</th><th className={TH}>Horse</th><th className={TH}>Class</th><th className={`${TH} ${NUM}`}>Pts</th><th className={TH}>Flags</th></tr></thead>
                <tbody>
                  {preview.rows.slice(0, 12).map((r, i) => (
                    <tr key={i}>
                      <td className={TD}>{r.preview?.rider || '–'}</td>
                      <td className={TD}>{r.preview?.horse || '–'}</td>
                      <td className={TD}>{r.preview?.class || '–'}</td>
                      <td className={`${TD} ${NUM}`}><b className={r.ok ? 'text-gold' : 'text-faint'}>{r.ok ? r.preview.points : '–'}</b></td>
                      <td className={TD}>{r.ok
                        ? <>{r.preview.new_horse && <span className={badge(BADGE.blue)}>new horse</span>}{' '}{r.preview.new_class && <span className={badge(BADGE.gray)}>new class</span>}</>
                        : <span className={badge(BADGE.red)}>{(r.errors || []).join('; ')}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {preview.rows.length > 12 && <p className="text-[12px] text-faint mt-1">Showing 12 of {preview.rows.length} rows.</p>}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
