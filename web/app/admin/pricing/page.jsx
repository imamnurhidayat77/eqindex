'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import EntityPicker from '../../../components/EntityPicker';

const nzd = (c) => (c === null || c === undefined || c === '' ? '—' : `NZ$${(Number(c) / 100).toFixed(2)}`);

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
  const [events, setEvents] = useState([]);
  const [pEvent, setPEvent] = useState('');
  const [pHorse, setPHorse] = useState(null);
  const [pRider, setPRider] = useState(null);
  const [pPrice, setPPrice] = useState('');
  const [pTitle, setPTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [t, p] = await Promise.all([call('/admin/license-tiers'), call('/admin/packages')]);
      setTiers(t || []);
      setPackages(p || []);
      setEdits({});
      setPkgEdits({});
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => {
    load();
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEdit = (id, k, v) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const val = (t, k) => (edits[t.id]?.[k] ?? t[k] ?? '');

  async function saveTier(t) {
    const e = edits[t.id] || {};
    if (!Object.keys(e).length) { setMsg('No changes to save.'); return; }
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
    setBusy(true);
    try {
      await call('/admin/license-tiers', {
        method: 'POST',
        body: JSON.stringify({
          id: newTier.id.trim().toLowerCase(), label: newTier.label.trim(),
          price_cents: newTier.price_cents === '' ? null : newTier.price_cents,
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

  async function savePackage(p) {
    const e = pkgEdits[p.id] || {};
    if (!Object.keys(e).length) { setMsg('No changes to save.'); return; }
    setBusy(true);
    try {
      await call(`/admin/packages/${p.id}`, { method: 'PATCH', body: JSON.stringify(e) });
      setMsg(`Saved package "${p.title}".`);
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

  async function createPackage() {
    if (!pEvent) { setMsg('Pick an event first.'); return; }
    if (!!pHorse === !!pRider) { setMsg('Pick exactly one: a horse or a rider.'); return; }
    setBusy(true);
    try {
      const body = { event_id: pEvent };
      if (pHorse) body.horse_id = pHorse.id;
      if (pRider) body.rider_id = pRider.id;
      if (pPrice !== '') body.price_cents = pPrice;
      if (pTitle.trim()) body.title = pTitle.trim();
      const d = await call('/admin/packages', { method: 'POST', body: JSON.stringify(body) });
      setMsg(`Created "${d.title}" with ${d.items} photos at ${nzd(d.price_cents)}.`);
      setPHorse(null); setPRider(null); setPPrice(''); setPTitle('');
      load();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  return (
    <>
      <h1 className={H1}>Pricing</h1>
      <p className={SUB}>License tiers buyers pick on every photo, plus photo packages per event × horse/rider. All prices NZD.</p>
      {msg && <section className={CARD} role="alert"><p className="text-sm text-gold">{msg}</p></section>}

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">License tiers</h2>
        <p className="text-[12.5px] text-muted mb-3">Shown in the buy box on every photo. A photo without its own price sells at its default tier (Web unless set). The <span className="font-mono text-[12px]">web</span> tier is the system default and cannot be deleted.</p>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>ID</th><th className={TH}>Label</th><th className={TH}>Max resolution</th>
            <th className={TH}>Printable</th><th className={`${TH} ${NUM}`}>Price</th><th className={`${TH} ${NUM}`}>Sort</th>
            <th className={TH}><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.id} className="border-b border-rowline last:border-0">
                <td className={`${TD} font-mono text-[12px]`}>{t.id}</td>
                <td className={TD}><input value={val(t, 'label')} onChange={(e) => setEdit(t.id, 'label', e.target.value)} className={INP} style={{ width: 170 }} /></td>
                <td className={TD}><input value={val(t, 'max_resolution') ?? ''} onChange={(e) => setEdit(t.id, 'max_resolution', e.target.value)} placeholder="e.g. 1417×945" className={INP} style={{ width: 130 }} /></td>
                <td className={TD}><input type="checkbox" checked={!!(edits[t.id]?.printable ?? t.printable)} onChange={(e) => setEdit(t.id, 'printable', e.target.checked)} /></td>
                <td className={`${TD} ${NUM}`}><input value={val(t, 'price_cents') ?? ''} onChange={(e) => setEdit(t.id, 'price_cents', e.target.value)} inputMode="numeric" placeholder="cents" className={INP} style={{ width: 90 }} /></td>
                <td className={`${TD} ${NUM}`}><input value={val(t, 'sort_order') ?? ''} onChange={(e) => setEdit(t.id, 'sort_order', e.target.value)} inputMode="numeric" className={INP} style={{ width: 60 }} /></td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  <button onClick={() => saveTier(t)} disabled={busy} className="text-sky text-[13px] hover:underline bg-none border-0 cursor-pointer mr-2">Save</button>
                  <button onClick={() => removeTier(t)} className="text-faint text-[13px] hover:text-blood bg-none border-0 cursor-pointer">Delete</button>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-line">
              <td className={TD}><input value={newTier.id} onChange={(e) => setNewTier({ ...newTier, id: e.target.value })} placeholder="new-id" className={INP} style={{ width: 110 }} /></td>
              <td className={TD}><input value={newTier.label} onChange={(e) => setNewTier({ ...newTier, label: e.target.value })} placeholder="Label" className={INP} style={{ width: 170 }} /></td>
              <td className={TD}><input value={newTier.max_resolution} onChange={(e) => setNewTier({ ...newTier, max_resolution: e.target.value })} placeholder="e.g. 1417×945" className={INP} style={{ width: 130 }} /></td>
              <td className={TD}><input type="checkbox" checked={newTier.printable} onChange={(e) => setNewTier({ ...newTier, printable: e.target.checked })} /></td>
              <td className={`${TD} ${NUM}`}><input value={newTier.price_cents} onChange={(e) => setNewTier({ ...newTier, price_cents: e.target.value })} inputMode="numeric" placeholder="cents" className={INP} style={{ width: 90 }} /></td>
              <td className={`${TD} ${NUM}`}><input value={newTier.sort_order} onChange={(e) => setNewTier({ ...newTier, sort_order: e.target.value })} inputMode="numeric" className={INP} style={{ width: 60 }} /></td>
              <td className={`${TD} text-right`}><button onClick={addTier} disabled={busy} className={BTN_PRIMARY}>Add</button></td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-1">Packages</h2>
        <p className="text-[12.5px] text-muted mb-3">Bundles of one event × horse/rider, sold as one checkout. Auto-priced unless overridden.</p>
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
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Price override (cents, blank = auto)
            <input value={pPrice} onChange={(e) => setPPrice(e.target.value)} inputMode="numeric" placeholder="e.g. 9900" className={INP} /></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Title override (blank = auto)
            <input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="e.g. All finals photos" className={INP} /></label>
        </div>
        <button onClick={createPackage} disabled={busy} className={BTN_PRIMARY}>Create package</button>

        <div className={`${TABLEWRAP} mt-4`}>
        <table className={TABLE}>
          <thead><tr>
            <th className={TH}>Title</th><th className={TH}>Event</th><th className={`${TH} ${NUM}`}>Photos</th>
            <th className={`${TH} ${NUM}`}>Price</th><th className={TH}>Status</th>
            <th className={TH}><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id} className="border-b border-rowline last:border-0">
                <td className={TD}><input value={pval(p, 'title')} onChange={(e) => setPkg(p.id, 'title', e.target.value)} className={INP} style={{ minWidth: 220 }} /></td>
                <td className={`${TD} text-muted text-[13px]`}>{p.event_name || '—'}</td>
                <td className={`${TD} ${NUM}`}>{p.items}</td>
                <td className={`${TD} ${NUM}`}><input value={pval(p, 'price_cents') ?? ''} onChange={(e) => setPkg(p.id, 'price_cents', e.target.value)} inputMode="numeric" className={INP} style={{ width: 100 }} /></td>
                <td className={TD}>
                  <select value={pval(p, 'status')} onChange={(e) => setPkg(p.id, 'status', e.target.value)} className={INP}>
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                    <option value="archived">archived</option>
                  </select>
                </td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  <button onClick={() => savePackage(p)} disabled={busy} className="text-sky text-[13px] hover:underline bg-none border-0 cursor-pointer mr-2">Save</button>
                  <button onClick={() => removePackage(p)} className="text-faint text-[13px] hover:text-blood bg-none border-0 cursor-pointer">Delete</button>
                </td>
              </tr>
            ))}
            {!packages.length && (
              <tr><td colSpan={6} className="px-2 py-4 text-[13px] text-faint">No packages yet — create one above.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </>
  );
}
