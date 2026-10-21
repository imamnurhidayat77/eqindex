'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import { TableRowsSk } from '../../../components/Skeletons';
import { RowBtn, FilterSelect } from '../../../components/TableBits';
import EntityPicker from '../../../components/EntityPicker';

const nzd = (c) => (c === null || c === undefined || c === '' ? '—' : `NZ$${(Number(c) / 100).toFixed(2)}`);
// Settings display NZD; the API + Stripe stay in integer cents.
const toNZD = (c) => (c === null || c === undefined || c === '' ? '' : (Number(c) / 100).toFixed(2));
const toCents = (s) => {
  if (s === null || s === undefined || String(s).trim() === '') return null;
  const n = Number(String(s).trim().replace(/^\$/, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};

// Pricing Settings — license tiers (what buyers pick on every photo) and
// packages (bundles per event × horse/rider). Prices surface on BuyBox
// (tier picker), package upsells, and Stripe checkout (NZD).
export default function AdminPricing() {
  const call = useAdminApi();
  const [tiers, setTiers] = useState([]);
  const [edits, setEdits] = useState({});
  const [newTier, setNewTier] = useState({ id: '', label: '', price_cents: '', max_resolution: '', printable: true, sort_order: '' });
  const [packages, setPackages] = useState([]);
  const [pkgEdits, setPkgEdits] = useState({});
  const [reels, setReels] = useState([]);
  const [reelEdits, setReelEdits] = useState({});
  const [newReel, setNewReel] = useState({ event_id: '', name: '', scope: 'round', coverage: 'ring', includes_raw: false, description: '', price_cents: '' });
  const [credits, setCredits] = useState([]);
  const [creditEdits, setCreditEdits] = useState({});
  const [newCredit, setNewCredit] = useState({ event_id: '', scope_type: 'rider', slots: '5', price_cents: '' });
  const [events, setEvents] = useState([]);
  const [eventPrice, setEventPrice] = useState('');
  const [pEvent, setPEvent] = useState('');
  const [pHorse, setPHorse] = useState(null);
  const [pRider, setPRider] = useState(null);
  const [pPrice, setPPrice] = useState('');
  const [pTitle, setPTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [initial, setInitial] = useState(true);

  async function load() {
    try {
      const [t, p, r, c, s] = await Promise.all([
        call('/admin/license-tiers'), call('/admin/packages'),
        call('/admin/reel-products'), call('/admin/credit-packs'),
        call('/admin/settings').catch(() => ({})),
      ]);
      setTiers(t || []);
      setEventPrice(toNZD(s?.event_package_price_cents ?? ''));
      setPackages(p || []);
      setReels(r || []);
      setCredits(c || []);
      setEdits({});
      setPkgEdits({});
      setReelEdits({});
      setCreditEdits({});
    } catch (e) { setMsg(e.message); }
    setInitial(false);
  }
  useEffect(() => {
    load();
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEdit = (id, k, v) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const val = (t, k) => (edits[t.id]?.[k] ?? t[k] ?? '');
  const valNZD = (t) => (edits[t.id]?.price_cents ?? toNZD(t.price_cents));

  async function saveTier(t) {
    const e = { ...(edits[t.id] || {}) };
    if (!Object.keys(e).length) { setMsg('No changes to save.'); return; }
    if ('price_cents' in e) {
      e.price_cents = toCents(e.price_cents);
      if (Number.isNaN(e.price_cents)) { setMsg('Price must be a non-negative NZ$ amount.'); return; }
    }
    setBusy(true);
    try {
      await call(`/admin/license-tiers/${t.id}`, { method: 'PATCH', body: JSON.stringify(e) });
      setMsg(`Saved tier "${t.id}".`);
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  async function addTier() {
    if (!newTier.id.trim() || !newTier.label.trim()) { setMsg('New tier needs an id and a label.'); return; }
    const newPrice = toCents(newTier.price_cents);
    if (Number.isNaN(newPrice)) { setMsg('Price must be a non-negative NZ$ amount.'); return; }
    setBusy(true);
    try {
      await call('/admin/license-tiers', {
        method: 'POST',
        body: JSON.stringify({
          id: newTier.id.trim().toLowerCase(), label: newTier.label.trim(),
          price_cents: newPrice,
          max_resolution: newTier.max_resolution.trim() || null,
          printable: !!newTier.printable,
          sort_order: newTier.sort_order === '' ? null : newTier.sort_order,
        }),
      });
      setMsg(`Added tier "${newTier.id.trim().toLowerCase()}".`);
      setNewTier({ id: '', label: '', price_cents: '', max_resolution: '', printable: true, sort_order: '' });
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  async function removeTier(t) {
    if (!window.confirm(`Delete tier "${t.id}"? Blocked while any photo default or purchase uses it.`)) return;
    try {
      await call(`/admin/license-tiers/${t.id}`, { method: 'DELETE' });
      setMsg(`Deleted tier "${t.id}".`);
      load();
    } catch (err) { setMsg(err.message); }
  }

  const setPkg = (id, k, v) => setPkgEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const pval = (p, k) => (pkgEdits[p.id]?.[k] ?? p[k] ?? '');
  const pvalNZD = (p) => (pkgEdits[p.id]?.price_cents ?? toNZD(p.price_cents));

  async function savePackage(p) {
    const e = { ...(pkgEdits[p.id] || {}) };
    if (!Object.keys(e).length) { setMsg('No changes to save.'); return; }
    for (const k of ['price_cents', 'early_price_cents']) {
      if (k in e) {
        e[k] = toCents(e[k]);
        if (Number.isNaN(e[k])) { setMsg('Price must be a non-negative NZ$ amount.'); return; }
      }
    }
    setBusy(true);
    try {
      await call(`/admin/packages/${p.id}`, { method: 'PATCH', body: JSON.stringify(e) });
      setMsg(`Saved package "${p.title}".`);
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  async function togglePackageStatus(p) {
    const next = p.status === 'published' ? 'archived' : 'published';
    if (next === 'archived' && !window.confirm(`Hide package "${p.title}" from buyers? Paid buyers keep their downloads.`)) return;
    setBusy(true);
    try {
      await call(`/admin/packages/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      setMsg(next === 'published' ? `Package "${p.title}" is visible to buyers.` : `Package "${p.title}" hidden from buyers.`);
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  async function removePackage(p) {
    if (!window.confirm(`Delete package "${p.title}"? Blocked while it has paid purchases — archive instead.`)) return;
    try {
      await call(`/admin/packages/${p.id}`, { method: 'DELETE' });
      setMsg(`Deleted package "${p.title}".`);
      load();
    } catch (err) { setMsg(err.message); }
  }

  // ---- Reel products: tiered per-event prices, set here (no deploy). ----
  const setReel = (id, k, v) => setReelEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const rval = (r, k) => (reelEdits[r.id]?.[k] ?? r[k] ?? '');
  const rvalNZD = (r) => (reelEdits[r.id]?.price_cents ?? toNZD(r.price_cents));

  async function saveReel(r) {
    const e = { ...(reelEdits[r.id] || {}) };
    if (!Object.keys(e).length) { setMsg('No changes to save.'); return; }
    if ('price_cents' in e) {
      e.price_cents = toCents(e.price_cents);
      if (Number.isNaN(e.price_cents)) { setMsg('Price must be a non-negative NZ$ amount.'); return; }
    }
    setBusy(true);
    try {
      await call(`/admin/reel-products/${r.id}`, { method: 'PATCH', body: JSON.stringify(e) });
      setMsg(`Saved reel product "${r.name}".`);
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  async function addReel() {
    if (!newReel.name.trim()) { setMsg('New reel product needs a name.'); return; }
    const price = toCents(newReel.price_cents);
    if (Number.isNaN(price)) { setMsg('Price must be a non-negative NZ$ amount.'); return; }
    setBusy(true);
    try {
      const body = {
        name: newReel.name.trim(), scope: newReel.scope, coverage: newReel.coverage,
        includes_raw: !!newReel.includes_raw,
        description: newReel.description.trim() || undefined, price_cents: price,
      };
      if (newReel.event_id) body.event_id = newReel.event_id;
      await call('/admin/reel-products', { method: 'POST', body: JSON.stringify(body) });
      setMsg(`Added reel product "${newReel.name.trim()}" at ${nzd(price)}.`);
      setNewReel({ event_id: '', name: '', scope: 'round', coverage: 'ring', includes_raw: false, description: '', price_cents: '' });
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  async function removeReel(r) {
    if (!window.confirm(`Delete reel product "${r.name}"? Blocked while it has live orders — archive instead.`)) return;
    try {
      await call(`/admin/reel-products/${r.id}`, { method: 'DELETE' });
      setMsg(`Deleted reel product "${r.name}".`);
      load();
    } catch (err) { setMsg(err.message); }
  }

  // ---- Credit packs: 5-pack bundles (pick any N photos in 1 event x subject).
  // Blank event = global default price; per-event rows override it.
  const setCredit = (id, k, v) => setCreditEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const cval = (c, k) => (creditEdits[c.id]?.[k] ?? c[k] ?? '');
  const cvalNZD = (c) => (creditEdits[c.id]?.price_cents ?? toNZD(c.price_cents));

  async function saveCredit(c) {
    const e = { ...(creditEdits[c.id] || {}) };
    if (!Object.keys(e).length) { setMsg('No changes to save.'); return; }
    for (const k of ['price_cents', 'early_price_cents']) {
      if (k in e) {
        e[k] = toCents(e[k]);
        if (Number.isNaN(e[k])) { setMsg('Price must be a non-negative NZ$ amount.'); return; }
      }
    }
    setBusy(true);
    try {
      await call(`/admin/credit-packs/${c.id}`, { method: 'PATCH', body: JSON.stringify(e) });
      setMsg(`Saved ${e.slots || c.slots}-photo credit pack.`);
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  async function addCredit() {
    const slots = parseInt(newCredit.slots, 10);
    if (!Number.isInteger(slots) || slots <= 0) { setMsg('Slots must be a positive integer.'); return; }
    const price = toCents(newCredit.price_cents);
    if (Number.isNaN(price)) { setMsg('Price must be a non-negative NZ$ amount.'); return; }
    setBusy(true);
    try {
      const body = { scope_type: newCredit.scope_type, slots, price_cents: price };
      if (newCredit.event_id) body.event_id = newCredit.event_id;
      await call('/admin/credit-packs', { method: 'POST', body: JSON.stringify(body) });
      setMsg(`Added ${slots}-photo credit pack at ${nzd(price)}.`);
      setNewCredit({ event_id: '', scope_type: 'rider', slots: '5', price_cents: '' });
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  async function removeCredit(c) {
    if (!window.confirm(`Delete this credit pack? Blocked while it has live bundles — archive instead.`)) return;
    try {
      await call(`/admin/credit-packs/${c.id}`, { method: 'DELETE' });
      setMsg('Deleted credit pack.');
      load();
    } catch (err) { setMsg(err.message); }
  }

  async function saveEventPrice() {
    const raw = String(eventPrice).trim();
    let cents = '';
    if (raw !== '') {
      cents = toCents(raw);
      if (Number.isNaN(cents)) { setMsg('Price must be a non-negative NZ$ amount.'); return; }
    }
    setBusy(true);
    try {
      await call('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ key: 'event_package_price_cents', value: cents === '' ? '' : String(cents) }),
      });
      setMsg(cents === ''
        ? 'Whole-event price cleared — auto rule applies.'
        : `Whole-event package price set to ${nzd(cents)} for all events.`);
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  async function createPackage() {
    if (!pEvent) { setMsg('Pick an event first.'); return; }
    if (!!pHorse && !!pRider) { setMsg('Pick at most one: a horse or a rider — leave both blank for the whole event.'); return; }
    setBusy(true);
    try {
      const body = { event_id: pEvent };
      if (pHorse) body.horse_id = pHorse.id;
      if (pRider) body.rider_id = pRider.id;
      if (pPrice.trim() !== '') {
        const pc = toCents(pPrice);
        if (Number.isNaN(pc)) { setMsg('Price must be a non-negative NZ$ amount.'); setBusy(false); return; }
        body.price_cents = pc;
      }
      if (pTitle.trim()) body.title = pTitle.trim();
      const d = await call('/admin/packages', { method: 'POST', body: JSON.stringify(body) });
      setMsg(`Created "${d.title}" with ${d.items} items at ${nzd(d.price_cents)}.`);
      setPHorse(null); setPRider(null); setPPrice(''); setPTitle('');
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  return (
    <>
      <h1 className={H1}>Pricing</h1>
      <p className={SUB}>License tiers buyers pick on every photo, photo packages and 5-pack credits per event × horse/rider, plus reel products. All prices NZD.</p>
      {msg && <section className={CARD} role="alert"><p className="text-sm text-gold">{msg}</p></section>}

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">License tiers</h2>
        <p className="text-[12.5px] text-muted mb-3">Shown in the buy box on every photo. A photo without its own price sells at its default tier (Web unless set). The <span className="font-mono text-[12px]">web</span> tier is the system default and cannot be deleted or hidden. Tick Hidden + Save to remove a tier from the buy box without deleting it (blocked while any photo uses it as default).</p>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>ID</th><th className={TH}>Label</th><th className={TH}>Max resolution</th>
            <th className={TH}>Printable</th><th className={`${TH} ${NUM}`}>Price (NZ$)</th><th className={`${TH} ${NUM}`}>Sort</th>
            <th className={TH}>Hidden</th>
            <th className={TH}><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {initial && <TableRowsSk rows={4} />}
            {tiers.map((t) => {
              const hidden = !!(edits[t.id]?.is_hidden ?? t.is_hidden);
              return (
              <tr key={t.id} className={`border-b border-rowline last:border-0${hidden ? ' opacity-50' : ''}`}>
                <td className={`${TD} font-mono text-[12px]`}>{t.id}</td>
                <td className={TD}><input value={val(t, 'label')} onChange={(e) => setEdit(t.id, 'label', e.target.value)} className={INP} style={{ width: 170 }} /></td>
                <td className={TD}><input value={val(t, 'max_resolution') ?? ''} onChange={(e) => setEdit(t.id, 'max_resolution', e.target.value)} placeholder="e.g. 1417×945" className={INP} style={{ width: 130 }} /></td>
                <td className={TD}><input type="checkbox" checked={!!(edits[t.id]?.printable ?? t.printable)} onChange={(e) => setEdit(t.id, 'printable', e.target.checked)} /></td>
                <td className={`${TD} ${NUM}`}><input value={valNZD(t)} onChange={(e) => setEdit(t.id, 'price_cents', e.target.value)} inputMode="decimal" placeholder="NZ$" className={INP} style={{ width: 90 }} /></td>
                <td className={`${TD} ${NUM}`}><input value={val(t, 'sort_order') ?? ''} onChange={(e) => setEdit(t.id, 'sort_order', e.target.value)} inputMode="numeric" className={INP} style={{ width: 60 }} /></td>
                <td className={TD} title={t.id === 'web' ? 'The system default tier cannot be hidden' : 'Hide from the buy box'}>
                  <input type="checkbox" checked={hidden} disabled={t.id === 'web'}
                    onChange={(e) => setEdit(t.id, 'is_hidden', e.target.checked)} />
                </td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  <span className="inline-flex gap-1.5">
                    <RowBtn onClick={() => saveTier(t)} disabled={busy}>Save</RowBtn>
                    <RowBtn onClick={() => removeTier(t)} tone="danger">Delete</RowBtn>
                  </span>
                </td>
              </tr>
              );
            })}
            <tr className="border-t-2 border-line">
              <td className={TD}><input value={newTier.id} onChange={(e) => setNewTier({ ...newTier, id: e.target.value })} placeholder="new-id" className={INP} style={{ width: 110 }} /></td>
              <td className={TD}><input value={newTier.label} onChange={(e) => setNewTier({ ...newTier, label: e.target.value })} placeholder="Label" className={INP} style={{ width: 170 }} /></td>
              <td className={TD}><input value={newTier.max_resolution} onChange={(e) => setNewTier({ ...newTier, max_resolution: e.target.value })} placeholder="e.g. 1417×945" className={INP} style={{ width: 130 }} /></td>
              <td className={TD}><input type="checkbox" checked={newTier.printable} onChange={(e) => setNewTier({ ...newTier, printable: e.target.checked })} /></td>
                <td className={`${TD} ${NUM}`}><input value={newTier.price_cents} onChange={(e) => setNewTier({ ...newTier, price_cents: e.target.value })} inputMode="decimal" placeholder="NZ$" className={INP} style={{ width: 90 }} /></td>
              <td className={`${TD} ${NUM}`}><input value={newTier.sort_order} onChange={(e) => setNewTier({ ...newTier, sort_order: e.target.value })} inputMode="numeric" className={INP} style={{ width: 60 }} /></td>
              <td className={`${TD} text-right`}><button onClick={addTier} disabled={busy} className={BTN_PRIMARY}>Add</button></td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Whole-event package</h2>
        <p className="text-[12.5px] text-muted mb-3">One price for every event — the FULL EVENT card (all photos of the event in one checkout) shows automatically on all photo pages. No per-event setup needed. Blank = auto rule per event (60% of singles).</p>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Price (NZ$, blank = auto)
            <input value={eventPrice} onChange={(e) => setEventPrice(e.target.value)} inputMode="decimal" placeholder="e.g. 149.00" className={INP} style={{ width: 160 }} /></label>
          <button onClick={saveEventPrice} disabled={busy} className={BTN_PRIMARY}>Save price</button>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Packages</h2>
        <p className="text-[12.5px] text-muted mb-3">Bundles appear automatically on every photo (whole-event + per horse/rider, auto-priced). Create one manually only to override the price/title for a specific scope.</p>
        <div className="grid gap-2.5 md:grid-cols-2 mb-3">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event
            <select value={pEvent} onChange={(e) => setPEvent(e.target.value)} className={INP}>
              <option value="">Pick event…</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Horse
              <EntityPicker kind="horse" value={pHorse} onPick={(h) => { setPHorse(h); setPRider(null); }} placeholder="or pick…" /></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Rider
              <EntityPicker kind="rider" value={pRider} onPick={(r) => { setPRider(r); setPHorse(null); }} placeholder="or pick…" /></label>
          </div>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Price override (NZ$, blank = auto)
            <input value={pPrice} onChange={(e) => setPPrice(e.target.value)} inputMode="decimal" placeholder="e.g. 99.00" className={INP} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Title override (blank = auto)
            <input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="e.g. All finals photos" className={INP} /></label>
        </div>
        <button onClick={createPackage} disabled={busy} className={BTN_PRIMARY}>Create package</button>

        <div className={`${TABLEWRAP} mt-4`}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Title</th><th className={TH}>Event</th><th className={`${TH} ${NUM}`}>Photos</th>
            <th className={`${TH} ${NUM}`}>Price (NZ$)</th><th className={`${TH} ${NUM}`}>Early (NZ$)</th><th className={TH}>Early until</th><th className={TH}>Status</th>
            <th className={TH}><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {initial && <TableRowsSk rows={3} />}
            {packages.map((p) => (
              <tr key={p.id} className="border-b border-rowline last:border-0">
                <td className={TD}><input value={pval(p, 'title')} onChange={(e) => setPkg(p.id, 'title', e.target.value)} className={INP} style={{ minWidth: 220 }} /></td>
                <td className={`${TD} text-muted text-[13px]`}>{p.event_name || '—'}</td>
                <td className={`${TD} ${NUM}`}>{p.items}</td>
                <td className={`${TD} ${NUM}`}><input value={pvalNZD(p)} onChange={(e) => setPkg(p.id, 'price_cents', e.target.value)} inputMode="decimal" placeholder="NZ$" className={INP} style={{ width: 100 }} /></td>
                <td className={`${TD} ${NUM}`}><input value={pkgEdits[p.id]?.early_price_cents ?? toNZD(p.early_price_cents)} onChange={(e) => setPkg(p.id, 'early_price_cents', e.target.value)} inputMode="decimal" placeholder="—" className={INP} style={{ width: 90 }} /></td>
                <td className={TD}><input type="date" value={pkgEdits[p.id]?.early_until ?? (p.early_until || '').slice(0, 10)} onChange={(e) => setPkg(p.id, 'early_until', e.target.value)} className={INP} style={{ width: 140 }} /></td>
                <td className={TD}>
                  <FilterSelect ariaLabel="Package status" value={pval(p, 'status')}
                    onChange={(v) => setPkg(p.id, 'status', v)}
                    options={[['draft', 'Draft'], ['published', 'Published'], ['archived', 'Archived']]} />
                </td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  <span className="inline-flex gap-1.5">
                    <RowBtn onClick={() => togglePackageStatus(p)} disabled={busy}
                      title={p.status === 'published' ? 'Hide from buyers' : 'Show to buyers'}
                      tone={p.status === 'published' ? 'gold' : 'muted'}>
                      {p.status === 'published' ? 'Hide' : 'Show'}
                    </RowBtn>
                    <RowBtn onClick={() => savePackage(p)} disabled={busy}>Save</RowBtn>
                    <RowBtn onClick={() => removePackage(p)} tone="danger">Delete</RowBtn>
                  </span>
                </td>
              </tr>
            ))}
            {!initial && !packages.length && (
              <tr><td colSpan={8} className="px-2 py-4 text-[13px] text-faint">No packages yet — create one above.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Reel products</h2>
        <p className="text-[12.5px] text-muted mb-3">Tiered reel prices per event (Sportfot-style Silver/Gold × raw). Blank event = global default shown on every event. Buyers pick music on the order form (choose for me / track / none).</p>
        <div className="grid gap-2.5 md:grid-cols-3 mb-3">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event (blank = all)
            <select value={newReel.event_id} onChange={(e) => setNewReel({ ...newReel, event_id: e.target.value })} className={INP}>
              <option value="">All events…</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Name
            <input value={newReel.name} onChange={(e) => setNewReel({ ...newReel, name: e.target.value })} placeholder="e.g. Gold + raw" className={INP} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Price (NZ$)
            <input value={newReel.price_cents} onChange={(e) => setNewReel({ ...newReel, price_cents: e.target.value })} inputMode="decimal" placeholder="e.g. 219.00" className={INP} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Scope
            <select value={newReel.scope} onChange={(e) => setNewReel({ ...newReel, scope: e.target.value })} className={INP}>
              <option value="clip">clip (raw ~5s)</option>
              <option value="round">round edit + music</option>
              <option value="event">event edit</option>
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Coverage
            <select value={newReel.coverage} onChange={(e) => setNewReel({ ...newReel, coverage: e.target.value })} className={INP}>
              <option value="ring">ring only</option>
              <option value="full">full (warm-up + ring + BTS)</option>
            </select></label>
          <label className="flex flex-row items-center gap-2 text-[12px] text-muted pt-5">
            <input type="checkbox" checked={newReel.includes_raw} onChange={(e) => setNewReel({ ...newReel, includes_raw: e.target.checked })} /> + raw footage</label>
        </div>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint mb-3">Description
          <input value={newReel.description} onChange={(e) => setNewReel({ ...newReel, description: e.target.value })} placeholder="e.g. Warm-up, ring and behind the scenes, edited with music" className={INP} /></label>
        <button onClick={addReel} disabled={busy} className={BTN_PRIMARY}>Add reel product</button>

        <div className={`${TABLEWRAP} mt-4`}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Name</th><th className={TH}>Event</th><th className={TH}>Scope</th>
            <th className={TH}>Coverage</th><th className={TH}>+Raw</th>
            <th className={`${TH} ${NUM}`}>Price (NZ$)</th><th className={TH}>Status</th>
            <th className={TH}><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {initial && <TableRowsSk rows={3} />}
            {reels.map((r) => (
              <tr key={r.id} className="border-b border-rowline last:border-0">
                <td className={TD}><input value={rval(r, 'name')} onChange={(e) => setReel(r.id, 'name', e.target.value)} className={INP} style={{ minWidth: 140 }} /></td>
                <td className={`${TD} text-muted text-[13px]`}>{r.event_name || 'All'}</td>
                <td className={TD}>
                  <FilterSelect ariaLabel="Reel scope" value={rval(r, 'scope')}
                    onChange={(v) => setReel(r.id, 'scope', v)}
                    options={[['clip', 'Clip'], ['round', 'Round'], ['event', 'Event']]} />
                </td>
                <td className={TD}>
                  <FilterSelect ariaLabel="Reel coverage" value={rval(r, 'coverage')}
                    onChange={(v) => setReel(r.id, 'coverage', v)}
                    options={[['ring', 'Ring'], ['full', 'Full']]} />
                </td>
                <td className={TD}><input type="checkbox" checked={!!(reelEdits[r.id]?.includes_raw ?? r.includes_raw)} onChange={(e) => setReel(r.id, 'includes_raw', e.target.checked)} /></td>
                <td className={`${TD} ${NUM}`}><input value={rvalNZD(r)} onChange={(e) => setReel(r.id, 'price_cents', e.target.value)} inputMode="decimal" placeholder="NZ$" className={INP} style={{ width: 100 }} /></td>
                <td className={TD}>
                  <FilterSelect ariaLabel="Reel status" value={rval(r, 'status')}
                    onChange={(v) => setReel(r.id, 'status', v)}
                    options={[['draft', 'Draft'], ['published', 'Published'], ['archived', 'Archived']]} />
                </td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  <span className="inline-flex gap-1.5">
                    <RowBtn onClick={() => saveReel(r)} disabled={busy}>Save</RowBtn>
                    <RowBtn onClick={() => removeReel(r)} tone="danger">Delete</RowBtn>
                  </span>
                </td>
              </tr>
            ))}
            {!initial && !reels.length && (
              <tr><td colSpan={8} className="px-2 py-4 text-[13px] text-faint">No reel products yet — add one above.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Credit packs (5-pack)</h2>
        <p className="text-[12.5px] text-muted mb-3">Pick-any-N photo credits for 1 event × rider/horse. Blank event = global default; per-event rows override it. Buyers unlock photos one by one, re-downloads free.</p>
        <div className="grid gap-2.5 md:grid-cols-4 mb-3">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event (blank = all)
            <select value={newCredit.event_id} onChange={(e) => setNewCredit({ ...newCredit, event_id: e.target.value })} className={INP}>
              <option value="">All events…</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Applies to
            <select value={newCredit.scope_type} onChange={(e) => setNewCredit({ ...newCredit, scope_type: e.target.value })} className={INP}>
              <option value="rider">rider</option>
              <option value="horse">horse</option>
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Photos (slots)
            <input value={newCredit.slots} onChange={(e) => setNewCredit({ ...newCredit, slots: e.target.value })} inputMode="numeric" placeholder="5" className={INP} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Price (NZ$)
            <input value={newCredit.price_cents} onChange={(e) => setNewCredit({ ...newCredit, price_cents: e.target.value })} inputMode="decimal" placeholder="e.g. 129.00" className={INP} /></label>
        </div>
        <button onClick={addCredit} disabled={busy} className={BTN_PRIMARY}>Add credit pack</button>

        <div className={`${TABLEWRAP} mt-4`}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Event</th><th className={TH}>Applies to</th>
            <th className={`${TH} ${NUM}`}>Photos</th><th className={`${TH} ${NUM}`}>Price (NZ$)</th>
            <th className={`${TH} ${NUM}`}>Early (NZ$)</th><th className={TH}>Early until</th>
            <th className={TH}>Status</th><th className={`${TH} ${NUM}`}>Bundles</th>
            <th className={TH}><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {initial && <TableRowsSk rows={3} />}
            {credits.map((c) => (
              <tr key={c.id} className="border-b border-rowline last:border-0">
                <td className={`${TD} text-muted text-[13px]`}>{c.event_name || 'All'}</td>
                <td className={TD}>
                  <FilterSelect ariaLabel="Credit applies to" value={cval(c, 'scope_type')}
                    onChange={(v) => setCredit(c.id, 'scope_type', v)}
                    options={[['rider', 'Rider'], ['horse', 'Horse']]} />
                </td>
                <td className={`${TD} ${NUM}`}><input value={cval(c, 'slots') ?? ''} onChange={(e) => setCredit(c.id, 'slots', e.target.value)} inputMode="numeric" className={INP} style={{ width: 60 }} /></td>
                <td className={`${TD} ${NUM}`}><input value={cvalNZD(c)} onChange={(e) => setCredit(c.id, 'price_cents', e.target.value)} inputMode="decimal" placeholder="NZ$" className={INP} style={{ width: 100 }} /></td>
                <td className={`${TD} ${NUM}`}><input value={creditEdits[c.id]?.early_price_cents ?? toNZD(c.early_price_cents)} onChange={(e) => setCredit(c.id, 'early_price_cents', e.target.value)} inputMode="decimal" placeholder="—" className={INP} style={{ width: 90 }} /></td>
                <td className={TD}><input type="date" value={creditEdits[c.id]?.early_until ?? (c.early_until || '').slice(0, 10)} onChange={(e) => setCredit(c.id, 'early_until', e.target.value)} className={INP} style={{ width: 140 }} /></td>
                <td className={TD}>
                  <FilterSelect ariaLabel="Credit status" value={cval(c, 'status')}
                    onChange={(v) => setCredit(c.id, 'status', v)}
                    options={[['draft', 'Draft'], ['published', 'Published'], ['archived', 'Archived']]} />
                </td>
                <td className={`${TD} ${NUM}`}>{c.bundles}</td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  <span className="inline-flex gap-1.5">
                    <RowBtn onClick={() => saveCredit(c)} disabled={busy}>Save</RowBtn>
                    <RowBtn onClick={() => removeCredit(c)} tone="danger">Delete</RowBtn>
                  </span>
                </td>
              </tr>
            ))}
            {!initial && !credits.length && (
              <tr><td colSpan={9} className="px-2 py-4 text-[13px] text-faint">No credit packs yet — add one above.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
