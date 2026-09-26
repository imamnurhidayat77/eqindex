'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../../lib/api';
import { briefPoints } from '../../../../lib/eq';
import { CARD, H1, SUB, INP, BTN_PRIMARY, badge, BADGE } from '../../../../lib/tokens';
import Dropdown from '../../../../components/Dropdown';

const CLASS_TYPES = ['Grand Prix', 'Premier', 'Open', 'Standard', 'Young Horse', 'Amateur', 'Pony'];
const STATUSES = ['finished', 'eliminated', 'withdrawn', 'retired', 'disqualified'];

function useLookup(type, q) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!q || q.trim().length < 2) { setRows([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/admin/lookup?type=${type}&q=${encodeURIComponent(q.trim())}`, { credentials: 'include' });
        if (res.ok) setRows((await res.json()).data || []);
      } catch { /* shell */ }
    }, 250);
    return () => clearTimeout(t);
  }, [type, q]);
  return rows;
}

export default function AddResult() {
  const [events, setEvents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [eventId, setEventId] = useState('');
  const [classId, setClassId] = useState('');
  const [newClass, setNewClass] = useState('');
  const [hq, setHq] = useState('');
  const [rq, setRq] = useState('');
  const [horse, setHorse] = useState({ id: '', name: '' });
  const [rider, setRider] = useState({ id: '', name: '' });
  const [f, setF] = useState({ placing: '', jump_faults: '', time_faults: '', time_seconds: '', status: 'finished', notes: '' });
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const horses = useLookup('horse', hq);
  const riders = useLookup('rider', rq);

  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!eventId) { setClasses([]); return; }
    fetch(`${API}/admin/event-classes?event_id=${eventId}`, { credentials: 'include' })
      .then((r) => r.json()).then((j) => setClasses(j.data || [])).catch(() => {});
    setClassId(''); setNewClass('');
  }, [eventId]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const previewPts = briefPoints(f.placing, (classes.find((c) => c.id === classId) || {}).class_type || 'Standard');
  const canSave = eventId && (classId || newClass.trim()) && (horse.id || horse.name.trim()) && (rider.id || rider.name.trim());

  async function save() {
    setErr(''); setSaved(null);
    if (!canSave) { setErr('Event, class, horse and rider are required.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/admin/results`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: classId || undefined, event_id: classId ? undefined : eventId,
          new_class: classId ? undefined : newClass.trim(),
          horse_id: horse.id || undefined, horse_name: horse.id ? undefined : horse.name.trim(),
          rider_id: rider.id || undefined, rider_name: rider.id ? undefined : rider.name.trim(),
          placing: f.placing === '' ? null : Number(f.placing),
          jump_faults: f.jump_faults === '' ? null : Number(f.jump_faults),
          time_faults: f.time_faults === '' ? null : Number(f.time_faults),
          time_seconds: f.time_seconds === '' ? null : Number(f.time_seconds),
          status: f.status, notes: f.notes.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setSaved(j.data);
      setF({ placing: '', jump_faults: '', time_faults: '', time_seconds: '', status: 'finished', notes: '' });
      setHq(''); setRq(''); setHorse({ id: '', name: '' }); setRider({ id: '', name: '' });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const comboBox = (label, q, setQ, val, setVal, rows) => (
    <label className="text-xs text-muted flex flex-col gap-1">{label}
      <span className="relative block">
        <input className={INP} value={val.id ? `${val.name} ✓` : q}
          onChange={(e) => { setQ(e.target.value); setVal({ id: '', name: e.target.value }); }}
          placeholder="type to search, or new name…" />
        {!!rows.length && !val.id && (
          <span className="absolute top-full left-0 mt-1 w-full z-10 block rounded border border-line bg-card2 shadow-xl overflow-hidden">
            {rows.map((r) => (
              <button type="button" key={r.id} onClick={() => { setVal({ id: r.id, name: r.name }); setQ(''); }}
                className="block w-full text-left px-3 py-2 text-[13px] hover:bg-white/5">{r.name}</button>
            ))}
          </span>
        )}
      </span>
    </label>
  );

  return (
    <>
      <h1 className={H1}>Add single result</h1>
      <p className={SUB}>Manual entry with live points preview — audited, duplicate-checked.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      {saved && (
        <section className={CARD}>
          <span className={badge(BADGE.green)}>Saved · {saved.points} pts</span>
          <span className="ml-2 text-sm text-muted">Round {String(saved.id).slice(0, 8)}… recorded. Form cleared for the next entry.</span>
        </section>
      )}
      <section className={CARD}>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-xs text-muted flex flex-col gap-1">Event
            <Dropdown ariaLabel="Event" value={eventId} searchable placeholder="— select —"
              options={[{ value: '', label: '— select —' },
                ...events.map((e) => ({ value: e.id, label: `${e.name} · ${(e.date_start || '').slice(0, 10)}` }))]}
              onSelect={(o) => setEventId(o.value)} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Class
            <Dropdown ariaLabel="Class" value={classId} searchable placeholder="— select or type new below —" disabled={!eventId}
              options={[{ value: '', label: '— select or type new below —' },
                ...classes.map((c) => ({ value: c.id, label: `${c.name}${c.class_date ? ` · ${c.class_date.slice(0, 10)}` : ''}` }))]}
              onSelect={(o) => { setClassId(o.value); setNewClass(''); }} /></label>
          {!classId && (
            <label className="text-xs text-muted flex flex-col gap-1">+ New class name
              <input className={INP} value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="e.g. 1.30m Championship" /></label>
          )}
          {comboBox('Horse', hq, setHq, horse, setHorse, horses)}
          {comboBox('Rider', rq, setRq, rider, setRider, riders)}
          <label className="text-xs text-muted flex flex-col gap-1">Placing
            <input className={INP} inputMode="numeric" value={f.placing} onChange={set('placing')} placeholder="1" /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Jump faults
            <input className={INP} inputMode="decimal" value={f.jump_faults} onChange={set('jump_faults')} placeholder="0" /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Time faults
            <input className={INP} inputMode="decimal" value={f.time_faults} onChange={set('time_faults')} placeholder="0" /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Time (s)
            <input className={INP} inputMode="decimal" value={f.time_seconds} onChange={set('time_seconds')} placeholder="65.42" /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Status
            <Dropdown ariaLabel="Status" value={f.status}
              options={STATUSES.map((s) => ({ value: s, label: s }))}
              onSelect={(o) => setF({ ...f, status: o.value })} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Notes
            <input className={INP} value={f.notes} onChange={set('notes')} placeholder="optional" /></label>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button className={BTN_PRIMARY} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save result'}</button>
          <span className="text-[13px] text-muted">Preview: <b className="text-gold">≈ {previewPts} pts</b></span>
        </div>
      </section>
    </>
  );
}
