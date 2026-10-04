'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API } from '../lib/api';
import { H2, LINK } from '../lib/tokens';

const trendStyle = (t) =>
  t === 'Declining'
    ? 'bg-redbg text-blood'
    : t === 'Improving' || t === 'Rising'
      ? 'bg-greenbg text-moss'
      : 'bg-line text-muted';

function FormBalls({ form }) {
  if (!form || !form.length) return <span className="text-faint text-xs">No rounds yet</span>;
  return (
    <span className="inline-flex items-center gap-1" title="Last 5 rounds (left = most recent)">
      {form.map((r, i) => (
        <span
          key={i}
          title={`${r.event} — ${r.clear ? 'clear' : `${r.faults ?? '–'} faults`}${r.place ? ` · #${r.place}` : ''}`}
          className={`inline-block w-3 h-3 rounded-full border ${r.clear
            ? 'bg-moss border-moss'
            : 'bg-transparent border-blood'
            } ${i === 0 ? 'ring-1 ring-white/30' : ''}`}
        />
      ))}
      <span className="text-faint text-[11px] ml-1">last {form.length}</span>
    </span>
  );
}

function ResultPill({ r }) {
  if (r.place !== null && r.place !== undefined) {
    const good = Number(r.place) <= 3;
    return (
      <span className={`text-[11px] font-bold rounded-md px-2 py-[3px] ${good ? 'bg-greenbg text-moss' : 'bg-card2 text-muted border border-line'}`}>
        #{r.place}
      </span>
    );
  }
  return (
    <span className={`text-[11px] font-bold rounded-md px-2 py-[3px] ${r.clear ? 'bg-greenbg text-moss' : 'bg-redbg text-blood'}`}>
      {r.clear ? 'Clear' : `${r.faults ?? '–'} flt`}
    </span>
  );
}

function HeightBars({ bands }) {
  if (!bands || !bands.length) return null;
  const max = Math.max(...bands.map((b) => b.rounds), 1);
  return (
    <div className="mt-2.5">
      <div className="text-[11px] uppercase tracking-wide text-faint font-bold mb-1.5">Height form</div>
      <div className="space-y-1.5">
        {bands.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-[12px]">
            <span className="w-[52px] text-muted shrink-0">{b.label}</span>
            <span className="flex-1 h-1.5 rounded bg-line overflow-hidden">
              <span
                className={`block h-full rounded ${b.clear >= 60 ? 'bg-moss' : b.clear >= 35 ? 'bg-gold' : 'bg-blood'}`}
                style={{ width: `${Math.max(8, (100 * b.rounds) / max)}%` }}
              />
            </span>
            <span className="w-[86px] text-right text-muted tabular-nums shrink-0">
              {b.clear === null ? '–' : `${b.clear.toFixed(0)}%`} · {b.rounds}r
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AthleteCard({ a, kind, selected, onToggle, onRemove, busy }) {
  const profileHref = kind === 'horse' ? `/horses/${a.slug || a.id}` : `/riders/${a.slug || a.id}`;
  return (
    <article className="bg-card border border-line rounded p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={profileHref} className="text-white font-bold text-[15px] no-underline hover:text-gold transition-colors truncate block">
            {a.name}
          </Link>
          <div className="text-faint text-[12px] mt-0.5">
            {a.rank ? <>Ranked <b className={a.rank === 1 ? 'text-gold' : 'text-muted'}>#{a.rank}</b> · </> : null}
            {a.starts} rounds · {Number(a.clear).toFixed(0)}% clear · {Number(a.avg).toFixed(2)} avg flt
          </div>
        </div>
        <span className={`text-[11px] font-bold rounded-md px-2 py-[3px] shrink-0 ${trendStyle(a.trend)}`}>
          {a.trend}
        </span>
      </div>

      <FormBalls form={a.form} />

      {a.outing ? (
        <div className="text-[12.5px] text-muted">
          Last outing:{' '}
          <b className={a.outing.clear ? 'text-moss' : 'text-body'}>
            {a.outing.clear ? 'Clear' : `${a.outing.faults ?? '–'} faults`}
          </b>
          {a.outing.height ? ` · ${(Number(a.outing.height) / 100).toFixed(2)}m` : null}
          {' · '}{a.outing.event} <span className="text-faint">({a.outing.when})</span>
        </div>
      ) : (
        <div className="text-[12.5px] text-faint">No rounds tracked yet.</div>
      )}

      {a.partner ? (
        <div className="text-[12.5px] text-muted">
          {kind === 'horse' ? 'Best with' : 'Best on'} <b className="text-body">{a.partner.name}</b>{' '}
          <span className="text-faint">({a.partner.clear.toFixed(0)}% · {a.partner.rounds}r)</span>
        </div>
      ) : null}

      <HeightBars bands={a.bands} />

      <div className="flex items-center gap-3 mt-1.5 pt-2.5 border-t border-rowline">
        <label className="flex items-center gap-1.5 text-[12px] text-muted cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-gold cursor-pointer"
            checked={selected}
            onChange={() => onToggle({ watchId: a.watchId, kind, id: a.id, name: a.name })}
          />
          Compare
        </label>
        <Link className={`${LINK} text-[12px]`} href={profileHref}>View profile →</Link>
        <span className="flex-1" />
        <button
          className="text-sky bg-none border-0 p-0 text-[12px] cursor-pointer disabled:opacity-40"
          disabled={busy}
          onClick={() => onRemove(a.watchId)}
        >
          Remove
        </button>
      </div>
    </article>
  );
}

export default function WatchlistView({ horses, riders, timeline, pulse }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);

  const matchQ = (s) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (s || '').toLowerCase().includes(t);
  };

  const fHorses = useMemo(
    () => (horses || []).filter((h) => matchQ(`${h.name} ${h.partner?.name || ''}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [horses, q],
  );
  const fRiders = useMemo(
    () => (riders || []).filter((r) => matchQ(`${r.name} ${r.partner?.name || ''}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [riders, q],
  );

  const isSel = (watchId) => sel.some((s) => s.watchId === watchId);
  const toggleSel = (row) =>
    setSel((s) => (isSel(row.watchId) ? s.filter((x) => x.watchId !== row.watchId) : [...s, row]));

  async function removeIds(ids) {
    if (!ids.length) return;
    setBusy(true);
    await Promise.all(ids.map((id) => fetch(`${API}/watchlist/${id}`, { method: 'DELETE' })));
    setSel([]);
    router.refresh();
    setBusy(false);
  }

  const selHorses = sel.filter((s) => s.kind === 'horse');
  const selRiders = sel.filter((s) => s.kind === 'rider');
  const compareHref =
    selHorses.length === 2 && !selRiders.length
      ? `/comparison?type=horse&a=${selHorses[0].id}&b=${selHorses[1].id}`
      : selRiders.length === 2 && !selHorses.length
        ? `/comparison?type=rider&a=${selRiders[0].id}&b=${selRiders[1].id}`
        : null;

  return (
    <>
      {/* stable pulse — what happened while you were away */}
      <div className="bg-card border border-line rounded p-4 mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <div className="text-[11px] text-muted tracking-[0.4px] uppercase">Last 30 days</div>
          <div className="text-[15px] font-bold mt-0.5">
            {pulse.rounds} rounds · <span className="text-moss">{pulse.clears} clears</span>
            {pulse.podiums ? <> · <span className="text-gold">{pulse.podiums} podiums</span></> : null}
            {pulse.wins ? <> · <span className="text-gold">{pulse.wins} {pulse.wins === 1 ? 'win' : 'wins'}</span></> : null}
            {!pulse.rounds ? <span className="text-faint font-normal"> — no tracked rounds yet</span> : null}
          </div>
        </div>
        <div className="flex-1" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter stable… (name or partner)"
          className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-white placeholder:text-faint focus:border-gold/60 focus:outline-none w-full sm:w-[260px]"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-5 items-start">
        <div className="min-w-0 space-y-7">
          {!!fHorses.length && (
            <section>
              <h2 className={H2}>Horses — form watch <span className="text-[11px] font-bold bg-greenbg text-moss rounded-full px-2.5 py-[3px] ml-1.5 align-middle">{fHorses.length}</span></h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {fHorses.map((h) => (
                  <AthleteCard
                    key={h.watchId} a={h} kind="horse"
                    selected={isSel(h.watchId)} onToggle={toggleSel}
                    onRemove={(id) => removeIds([id])} busy={busy}
                  />
                ))}
              </div>
            </section>
          )}

          {!!fRiders.length && (
            <section>
              <h2 className={H2}>Riders — form watch <span className="text-[11px] font-bold bg-bluebg text-sky rounded-full px-2.5 py-[3px] ml-1.5 align-middle">{fRiders.length}</span></h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {fRiders.map((r) => (
                  <AthleteCard
                    key={r.watchId} a={r} kind="rider"
                    selected={isSel(r.watchId)} onToggle={toggleSel}
                    onRemove={(id) => removeIds([id])} busy={busy}
                  />
                ))}
              </div>
            </section>
          )}

          {!fHorses.length && !fRiders.length && (
            <p className="text-faint text-sm">No matches for “{q}”. <button className="text-sky bg-none border-0 p-0 text-sm cursor-pointer" onClick={() => setQ('')}>Clear filter</button></p>
          )}
        </div>

        {/* latest rounds feed */}
        <div className="min-w-0">
          <h2 className={H2}>Latest rounds</h2>
          <div className="relative pl-4 mt-2">
            <div className="absolute left-[3px] top-2 bottom-2 w-px bg-line" />
            <div className="space-y-2.5">
              {(timeline || []).map((r, i) => (
                <div key={i} className="relative bg-card border border-line rounded p-3">
                  <span className={`absolute -left-4 top-4 w-[7px] h-[7px] rounded-full ${r.clear ? 'bg-moss' : 'bg-blood'}`} />
                  <div className="flex justify-between gap-2 items-baseline">
                    <b className="text-[13px] truncate">{r.horse} <span className="text-faint font-normal">× {r.rider}</span></b>
                    <span className="text-[11px] text-faint shrink-0">{r.when}</span>
                  </div>
                  <div className="text-muted text-xs mt-0.5 truncate">{r.event}{r.cls ? ` · ${r.cls}` : ''}</div>
                  <div className="flex justify-between gap-2 items-center mt-1.5">
                    <span className="text-muted text-xs">
                      {r.clear ? 'Clear round' : `${r.faults ?? '–'} faults`}
                    </span>
                    <ResultPill r={r} />
                  </div>
                </div>
              ))}
              {!(timeline || []).length && <p className="text-faint text-xs">No tracked rounds in the last 30 days.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* compare tray */}
      {(sel.length > 0 || compareHref) && (
        <div className="sticky bottom-4 mt-6 bg-card2 border border-line rounded px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <span className="text-[13px] text-muted">
            {sel.length ? `${sel.length} selected` : 'Select 2 horses or 2 riders to compare'}
            {!compareHref && sel.length > 0 ? ' — need exactly 2 of the same kind' : ''}
          </span>
          <span className="flex-1" />
          {!!sel.length && (
            <button
              onClick={() => removeIds(sel.map((s) => s.watchId))}
              disabled={busy}
              className="border border-blood text-blood rounded px-4 py-2 text-sm disabled:opacity-40"
            >
              {busy ? 'Removing…' : 'Remove selected'}
            </button>
          )}
          {compareHref ? (
            <Link href={compareHref} className="bg-sky text-ink font-semibold rounded px-4 py-2 text-sm no-underline">
              Compare now →
            </Link>
          ) : (
            <span className="text-faint text-xs">Tick “Compare” on two cards above</span>
          )}
          {!!sel.length && (
            <button onClick={() => setSel([])} className="text-faint bg-none border-0 text-[12px] cursor-pointer">
              Clear
            </button>
          )}
        </div>
      )}
    </>
  );
}
