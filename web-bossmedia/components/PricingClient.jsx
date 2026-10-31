'use client';
import { useCallback, useEffect, useState } from 'react';
import StudioShell, { Chip, Pager } from './studio';
import { useNotify } from './Toaster';
import { useConfirm } from './ConfirmModal';
import StudioTable from './StudioTable';
import SearchSelect from './SearchSelect';
import { searchSubjects } from '../lib/search-subjects';
import { API } from '../lib/api';
import { nzdc, studio } from '../lib/studio';

const dollars = (c) => (c === null || c === undefined || c === '' ? '' : String(Number(c) / 100));
const cents = (v) => (v === '' || v === null || v === undefined ? null : Math.round(Number(v) * 100));
const STATUS_OPTS = [{ id: 'published', label: 'published' }, { id: 'draft', label: 'draft' }, { id: 'archived', label: 'archived' }];

const slug = (s) => String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40);

function qualityHelp(v) {
  const s = String(v || '').toLowerCase();
  if (!s) return 'Original file — best quality';
  if (s.includes('original')) return 'Original file — best quality';
  if (s.includes('1417') || s.includes('social')) return 'Small file — good for social media';
  if (s.includes('2400') || s.includes('web')) return 'Medium file — good for everyday use';
  return 'Download size buyers receive';
}

export default function PricingClient({ events }) {
  const notify = useNotify();
  const [tiers, setTiers] = useState(null);
  const [packages, setPackages] = useState(null);
  const [products, setProducts] = useState(null);
  const [packs, setPacks] = useState(null);
  const [settings, setSettings] = useState(null);

  const load = useCallback(() => {
    studio.get('/admin/license-tiers').then((r) => setTiers(r || [])).catch((e) => notify(e.message, true));
    studio.get('/admin/packages').then((r) => setPackages(r || [])).catch(() => {});
    studio.get('/admin/reel-products').then((r) => setProducts(r || [])).catch(() => {});
    studio.get('/admin/credit-packs').then((r) => setPacks(r || [])).catch(() => {});
    studio.get('/admin/settings').then(setSettings).catch(() => {});
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  return (
    <StudioShell active="pricing">
      <Section
        title="Photo prices"
        hint="What a buyer pays for one photo. They pick one option at checkout — for example Social for sharing, Web for everyday use, or High Resolution for printing."
        tip="‘Web’ is the default option. It is always available and cannot be hidden or deleted."
      >
        <TierTable kind="photo" tiers={tiers} reload={load} />
        <TierForm kind="photo" onDone={load} />
      </Section>
      <Section
        title="Reel prices"
        hint="What a buyer pays for one finished reel. Separate from photo prices — add reel-only options below, or keep using the shared ones."
        tip="Options marked ‘Photo + reel’ are shared with photo checkout. Edit them under Photo prices."
      >
        <TierTable kind="reel" tiers={tiers} reload={load} />
        <TierForm kind="reel" onDone={load} />
      </Section>
      <Section
        title="Photo bundles"
        hint="Sell many photos together for one price: the whole event, all photos of one horse, or all photos of one rider. Bundles are built from your published photos."
        tip="If a bundle has been paid for, it cannot be deleted — set it to Archived instead so buyers keep what they bought."
      >
        <PackageTable packages={packages} reload={load} />
        <PackageForm events={events} onDone={load} />
      </Section>
      <Section
        title="Reel products"
        hint="Video options buyers can pre-book, e.g. a round edit with music. Set to Draft to hide it from the shop without losing past orders."
      >
        <ProductTable products={products} reload={load} />
        <ProductForm events={events} onDone={load} />
      </Section>
      <Section
        title="Credit packs"
        hint="Pre-paid bundles: the buyer unlocks any N photos for one rider or one horse at one event. Re-downloads are free."
      >
        <PackTable packs={packs} reload={load} />
        <PackForm events={events} onDone={load} />
      </Section>
      <Section title="Shop settings" hint="Defaults used across your shop.">
        <SettingsForm settings={settings} onDone={load} />
      </Section>
    </StudioShell>
  );
}

function Section({ title, hint, tip, children }) {
  return (
    <section className="st-card" style={{ marginTop: 18 }}>
      <h3>{title}</h3>
      {hint && <p className="st-csub" style={{ marginBottom: tip ? 4 : 18 }}>{hint}</p>}
      {tip && <p className="st-csub" style={{ color: '#999' }}>{tip}</p>}
      {children}
    </section>
  );
}

function Money({ cents: c }) { return <span>{c === null || c === undefined ? '—' : nzdc(c)}</span>; }

function StatusSelect({ value, onChange }) {
  return (
    <SearchSelect options={STATUS_OPTS} value={value} onChange={(v) => onChange(v || 'published')} placeholder="Status" />
  );
}

function useReprice(applyPrice, dialog) {
  return async (item) => {
    const v = await dialog.prompt({
      title: 'Set a new price',
      message: 'Whole dollars, NZ$.',
      initial: item.price_cents != null ? String(Number(item.price_cents) / 100) : '',
      numeric: true,
      confirmLabel: 'Save price',
    });
    if (v === null || v.trim() === '') return;
    applyPrice(item, cents(v));
  };
}

/* ---------- license tiers (split photo / reel by applies_to) ---------- */
function TierTable({ kind, tiers, reload }) {
  const notify = useNotify();
  const [confirmUI, dialog] = useConfirm();
  const [edits, setEdits] = useState({});
  const [offset, setOffset] = useState(0);
  const PAGE = 10;
  if (tiers === null) return <p className="empty-note" role="status">Loading prices…</p>;
  const list = tiers.filter((t) => (t.applies_to || 'both') === kind || (t.applies_to || 'both') === 'both');
  if (!list.length) return <p className="empty-note" role="status">No {kind} price options yet — add your first one below.</p>;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const safe = Math.min(offset, Math.max(0, (pages - 1) * PAGE));
  const set = (id, k, v) => setEdits((e) => ({ ...e, [id]: { ...(e[id] || {}), [k]: v } }));
  const save = async (t) => {
    const e = edits[t.id] || {};
    try {
      await studio.patch(`/admin/license-tiers/${t.id}`, {
        ...(e.label !== undefined ? { label: e.label } : {}),
        ...(e.price !== undefined ? { price_cents: e.price === '' ? null : cents(e.price) } : {}),
        ...(e.res !== undefined ? { max_resolution: e.res || null } : {}),
      });
      setEdits({}); notify('Tier saved'); reload();
    } catch (err) { notify(err.message, true); }
  };
  const remove = async (t) => {
    const ok = await dialog.confirm({ title: `Delete “${t.label}”?`, message: 'Photos using it fall back to the Web price.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await studio.del(`/admin/license-tiers/${t.id}`); notify('Price deleted'); reload(); }
    catch (err) { notify(err.message, true); }
  };
  return (
    <>
    <div className="table-scroll"><table className="st-table">
      <thead><tr><th>Buyer option</th><th>Price (NZ$)</th><th>File quality</th><th>Print-ready</th><th>In shop</th><th></th></tr></thead>
      <tbody>
        {list.slice(safe, safe + PAGE).map((t) => {
          const e = edits[t.id] || {};
          const hidden = e.hidden ?? t.is_hidden;
          const printable = e.printable ?? t.printable;
          const res = e.res ?? t.max_resolution ?? '';
          const isDefault = t.id === 'web';
          return (
          <tr key={t.id}>
            <td>
              <input value={e.label ?? t.label} onChange={(ev) => set(t.id, 'label', ev.target.value)} aria-label={`Option name for ${t.label}`} style={inp} />
              <div style={{ color: '#777', fontSize: 11, marginTop: 4 }}>
                {isDefault ? 'Default option — always in the shop' : 'Shows at checkout as “' + (e.label ?? t.label) + '”'}
                {(t.applies_to || 'both') === 'both' ? ' · Photo + reel' : ''}
              </div>
            </td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#777' }}>$</span>
                <input value={e.price ?? dollars(t.price_cents)} onChange={(ev) => set(t.id, 'price', ev.target.value)} placeholder="0" inputMode="decimal" aria-label={`Price in NZ dollars for ${t.label}`} style={{ ...inp, width: 80 }} />
              </div>
            </td>
            <td>
              <input value={e.res ?? (t.max_resolution || '')} onChange={(ev) => set(t.id, 'res', ev.target.value)} placeholder="original" aria-label={`File quality for ${t.label}`} style={{ ...inp, width: 130 }} />
              <div style={{ color: '#777', fontSize: 11, marginTop: 4 }}>{qualityHelp(res)}</div>
            </td>
            <td>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: printable ? '#ddd' : '#777' }}>
                <input type="checkbox" checked={!!printable} onChange={(ev) => set(t.id, 'printable', ev.target.checked)} aria-label={`Print-ready for ${t.label}`} />
                {printable ? 'Yes' : 'No'}
              </label>
            </td>
            <td>
              {isDefault ? (
                <span style={{ fontSize: 13, color: '#999' }}>Always shown</span>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={!hidden} onChange={(ev) => set(t.id, 'hidden', !ev.target.checked)} aria-label={`Show ${t.label} in shop`} />
                  {hidden ? <Chip status="hidden" /> : 'Shown'}
                </label>
              )}
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="st-btn-ghost" style={{ minHeight: 34 }} onClick={() => save(t)}>Save</button>{' '}
              {!isDefault && <button className="st-btn-ghost st-btn-danger" style={{ minHeight: 34 }} onClick={() => remove(t)}>Delete</button>}
            </td>
          </tr>
          );
        })}
      </tbody>
    </table></div>
    <Pager total={list.length} limit={PAGE} offset={safe} onPage={setOffset} />
    {confirmUI}
    </>
  );
}
const inp = { background: '#0b0b0b', border: '1px solid #333', color: '#fff', fontSize: 13, minHeight: 36, padding: '0 8px' };

function TierForm({ kind, onDone }) {
  const notify = useNotify();
  const [f, setF] = useState({ label: '', price: '', quality: 'original' });
  const previewId = slug(f.label);
  const submit = async () => {
    const id = previewId;
    if (!f.label.trim()) { notify('Give the option a name first, e.g. Social.', true); return; }
    if (!/^[a-z0-9_-]+$/.test(id)) { notify('Use letters and numbers for the name so we can save it.', true); return; }
    if (f.price === '' || Number.isNaN(Number(f.price)) || Number(f.price) < 0) { notify('Enter a price of 0 or more, e.g. 15.', true); return; }
    const max_resolution = f.quality === 'original' ? null : f.quality;
    try {
      await studio.post('/admin/license-tiers', {
        id, label: f.label.trim(), price_cents: cents(f.price), max_resolution,
        printable: f.quality === 'original', applies_to: kind,
      });
      setF({ label: '', price: '', quality: 'original' }); notify(`“${f.label.trim()}” added to the shop`); onDone();
    } catch (e) { notify(e.message, true); }
  };
  return (
    <div>
      <p style={{ color: '#999', fontSize: 12, margin: '18px 0 8px' }}>Add a new buyer option</p>
      <div className="st-filters" style={{ margin: '0 0 8px' }}>
        <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Option name, e.g. Social" aria-label="New option name" style={{ width: 200 }} />
        <input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="$ price, e.g. 15" aria-label="New option price in NZ dollars" inputMode="decimal" style={{ width: 140 }} />
        <div style={{ minWidth: 240 }}>
          <SearchSelect value={f.quality} onChange={(id) => setF({ ...f, quality: id })} clearable={false}
            placeholder="File quality"
            options={[
              { id: '1417x945', label: 'Small file — social media' },
              { id: '2400x1600', label: 'Medium file — everyday use' },
              { id: 'original', label: 'Original — best quality + print' },
            ]} />
        </div>
        <button className="st-btn" disabled={!f.label.trim() || f.price === ''} onClick={submit}>Add option</button>
      </div>
      {previewId && <p style={{ color: '#666', fontSize: 11 }}>Buyers will see “{f.label}” at checkout{Number(f.price) >= 0 && f.price !== '' ? ` for NZ$${f.price}` : ''}.</p>}
    </div>
  );
}

/* ---------- packages ---------- */
function PackageTable({ packages, reload }) {
  const notify = useNotify();
  const [confirmUI, dialog] = useConfirm();
  const [offset, setOffset] = useState(0);
  const PAGE = 10;
  const safe = Math.min(offset, Math.max(0, (Math.ceil(((packages || []).length) / PAGE) - 1) * PAGE));
  const reprice = useReprice((p, price_cents) => save(p, { price_cents }), dialog);
  if (packages === null) return <p className="empty-note" role="status">Loading bundles…</p>;
  if (!packages.length) return <p className="empty-note" role="status">No bundles yet — make one below and it will appear in the shop.</p>;
  const save = async (p, body) => {
    try { await studio.patch(`/admin/packages/${p.id}`, body); notify('Bundle saved'); reload(); }
    catch (e) { notify(e.message, true); }
  };
  const remove = async (p) => {
    const ok = await dialog.confirm({ title: `Delete “${p.title}”?`, message: 'If anyone has paid for it, it cannot be deleted — set it to Archived instead.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await studio.del(`/admin/packages/${p.id}`); notify('Bundle deleted'); reload(); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <>
    <div className="table-scroll"><table className="st-table">
      <thead><tr><th>Bundle</th><th>Event</th><th>Photos</th><th>Price</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {packages.slice(safe, safe + PAGE).map((p) => (
          <tr key={p.id}>
            <td>{p.title}</td>
            <td>{p.event_name || '—'}</td>
            <td>{p.items ?? '—'}</td>
            <td><Money cents={p.price_cents} /></td>
            <td><StatusSelect value={p.status} onChange={(v) => save(p, { status: v })} /></td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="st-btn-ghost" style={{ minHeight: 34 }} onClick={() => reprice(p)}>Reprice</button>{' '}
              <button className="st-btn-ghost st-btn-danger" style={{ minHeight: 34 }} onClick={() => remove(p)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
    <Pager total={(packages || []).length} limit={PAGE} offset={safe} onPage={setOffset} />
    {confirmUI}
    </>
  );
}

function PackageForm({ events, onDone }) {
  const notify = useNotify();
  const [eventId, setEventId] = useState('');
  const [subject, setSubject] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [price, setPrice] = useState('');
  const searchSubject = async (v) => {
    if (!subject) return [];
    return searchSubjects(subject, v);
  };
  const submit = async () => {
    try {
      await studio.post('/admin/packages', {
        event_id: eventId,
        ...(subject === 'horse' && subjectId ? { horse_id: subjectId } : {}),
        ...(subject === 'rider' && subjectId ? { rider_id: subjectId } : {}),
        ...(price !== '' ? { price_cents: cents(price) } : {}),
      });
      setEventId(''); setSubject(''); setSubjectId(''); setSubjectName(''); setPrice('');
      notify('Bundle created from published photos'); onDone();
    } catch (e) { notify(e.message, true); }
  };
  return (
    <div>
      <p style={{ color: '#999', fontSize: 12, margin: '18px 0 8px' }}>Build a bundle from published photos</p>
      <div className="st-filters" style={{ marginTop: 0 }}>
        <SearchSelect options={[{ id: '', label: '1. Choose event…' }, ...events.map((e) => ({ id: e.id, label: e.name }))]}
          value={eventId || ''} onChange={(v) => setEventId(v || '')} placeholder="1. Choose event…" />
        <SearchSelect options={[{ id: '', label: '2. Whole event' }, { id: 'horse', label: '2. One horse' }, { id: 'rider', label: '2. One rider' }]}
          value={subject} onChange={(v) => { setSubject(v || ''); setSubjectId(''); setSubjectName(''); }} placeholder="Who is it for?" />
        {subject && (
          <SearchSelect options={[]} loadOptions={searchSubject}
            value={subjectId || null} selectedOption={subjectId ? { id: subjectId, label: subjectName } : null}
            onChange={(id, o) => { setSubjectId(id || ''); setSubjectName(o?.label || ''); }}
            placeholder={`3. Type ${subject} name…`} />
        )}
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$ price (empty = automatic)" aria-label="Bundle price in NZ dollars, empty for automatic" style={{ width: 220 }} />
        <button className="st-btn" disabled={!eventId || (!!subject && !subjectId)} onClick={submit}>Build bundle</button>
      </div>
    </div>
  );
}

/* ---------- reel products ---------- */
function ProductTable({ products, reload }) {
  const notify = useNotify();
  const [confirmUI, dialog] = useConfirm();
  const [offset, setOffset] = useState(0);
  const PAGE = 10;
  const safe = Math.min(offset, Math.max(0, (Math.ceil(((products || []).length) / PAGE) - 1) * PAGE));
  const reprice = useReprice((p, price_cents) => save(p, { price_cents }), dialog);
  if (products === null) return <p className="empty-note" role="status">Loading reel options…</p>;
  if (!products.length) return <p className="empty-note" role="status">No reel options yet — add one below.</p>;
  const save = async (p, body) => {
    try { await studio.patch(`/admin/reel-products/${p.id}`, body); notify('Saved'); reload(); }
    catch (e) { notify(e.message, true); }
  };
  const remove = async (p) => {
    const ok = await dialog.confirm({ title: `Delete “${p.name}”?`, message: 'Past orders keep their history.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await studio.del(`/admin/reel-products/${p.id}`); notify('Deleted'); reload(); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <>
    <div className="table-scroll"><table className="st-table">
      <thead><tr><th>Reel option</th><th>Covers</th><th>Price</th><th>Orders</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {products.slice(safe, safe + PAGE).map((p) => (
          <tr key={p.id}>
            <td><b>{p.name}</b><div style={{ color: '#777', fontSize: 11 }}>{p.event_name || 'All events'}{p.description ? ` · ${p.description}` : ''}{p.includes_raw ? ' · + raw footage' : ''}</div></td>
            <td>{p.scope} / {p.coverage}</td>
            <td><Money cents={p.price_cents} /></td>
            <td>{p.orders ?? '—'}</td>
            <td><StatusSelect value={p.status} onChange={(v) => save(p, { status: v })} /></td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="st-btn-ghost" style={{ minHeight: 34 }} onClick={() => reprice(p)}>Reprice</button>{' '}
              <button className="st-btn-ghost st-btn-danger" style={{ minHeight: 34 }} onClick={() => remove(p)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
    <Pager total={(products || []).length} limit={PAGE} offset={safe} onPage={setOffset} />
    {confirmUI}
    </>
  );
}

function ProductForm({ events, onDone }) {
  const notify = useNotify();
  const [f, setF] = useState({ name: '', price: '', scope: 'round', coverage: 'ring', event_id: '', description: '' });
  const submit = async () => {
    try {
      await studio.post('/admin/reel-products', {
        name: f.name.trim(), price_cents: cents(f.price), scope: f.scope, coverage: f.coverage,
        ...(f.event_id ? { event_id: f.event_id } : {}), ...(f.description.trim() ? { description: f.description.trim() } : {}),
      });
      setF({ name: '', price: '', scope: 'round', coverage: 'ring', event_id: '', description: '' });
      notify('Reel option created'); onDone();
    } catch (e) { notify(e.message, true); }
  };
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="st-filters">
      <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Name, e.g. Round edit + music" aria-label="Name" style={{ minWidth: 220 }} />
      <input value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="$ price" aria-label="Price" style={{ width: 110 }} />
      <SearchSelect options={['round', 'clip', 'event'].map((s) => ({ id: s, label: s }))} value={f.scope} onChange={(v) => set('scope', v || 'round')} placeholder="Type" />
      <SearchSelect options={['ring', 'full'].map((s) => ({ id: s, label: s }))} value={f.coverage} onChange={(v) => set('coverage', v || 'ring')} placeholder="Coverage" />
      <SearchSelect options={[{ id: '', label: 'All events' }, ...events.map((e) => ({ id: e.id, label: e.name }))]} value={f.event_id} onChange={(v) => set('event_id', v || '')} placeholder="Event" />
      <input value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="What the buyer gets (optional)" aria-label="Description" style={{ minWidth: 220 }} />
      <button className="st-btn" disabled={!f.name.trim() || f.price === ''} onClick={submit}>Add reel option</button>
    </div>
  );
}

/* ---------- credit packs ---------- */
function PackTable({ packs, reload }) {
  const notify = useNotify();
  const [confirmUI, dialog] = useConfirm();
  const reprice = useReprice((p, price_cents) => save(p, { price_cents }), dialog);
  if (packs === null) return <p className="empty-note" role="status">Loading credit packs…</p>;
  if (!packs.length) return <p className="empty-note" role="status">No credit packs yet — add one below.</p>;
  const save = async (p, body) => {
    try { await studio.patch(`/admin/credit-packs/${p.id}`, body); notify('Saved'); reload(); }
    catch (e) { notify(e.message, true); }
  };
  const remove = async (p) => {
    const ok = await dialog.confirm({ title: `Delete this ${p.slots}-photo pack?`, message: 'Packs buyers already own keep working.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await studio.del(`/admin/credit-packs/${p.id}`); notify('Deleted'); reload(); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <>
    {confirmUI}
    <StudioTable
      rows={packs}
      loading={packs === null}
      empty="No credit packs yet — add one below."
      rowKey={(p) => p.id}
      columns={[
        { key: 'scope', label: 'Scope', render: (p) => p.scope_type },
        { key: 'slots', label: 'Slots', render: (p) => p.slots },
        { key: 'price', label: 'Price', render: (p) => <Money cents={p.price_cents} /> },
        { key: 'event', label: 'Event', render: (p) => p.event_name || 'Any' },
        { key: 'bundles', label: 'Bundles', render: (p) => p.bundles ?? '—' },
        { key: 'status', label: 'Status', render: (p) => <StatusSelect value={p.status} onChange={(v) => save(p, { status: v })} /> },
        { key: 'actions', label: '', render: (p) => (
          <span style={{ whiteSpace: 'nowrap' }}>
            <button className="st-btn-ghost" style={{ minHeight: 34 }} onClick={() => reprice(p)}>Reprice</button>{' '}
            <button className="st-btn-ghost st-btn-danger" style={{ minHeight: 34 }} onClick={() => remove(p)}>Delete</button>
          </span>
        ) },
      ]}
    />
    </>
  );
}

function PackForm({ events, onDone }) {
  const notify = useNotify();
  const [f, setF] = useState({ scope_type: 'rider', slots: '5', price: '', event_id: '' });
  const submit = async () => {
    try {
      await studio.post('/admin/credit-packs', {
        scope_type: f.scope_type, slots: parseInt(f.slots, 10), price_cents: cents(f.price),
        ...(f.event_id ? { event_id: f.event_id } : {}),
      });
      setF({ scope_type: 'rider', slots: '5', price: '', event_id: '' });
      notify('Credit pack created'); onDone();
    } catch (e) { notify(e.message, true); }
  };
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="st-filters">
      <SearchSelect options={[{ id: 'rider', label: 'One rider' }, { id: 'horse', label: 'One horse' }]} value={f.scope_type} onChange={(v) => set('scope_type', v || 'rider')} placeholder="Who is it for?" />
      <input value={f.slots} onChange={(e) => set('slots', e.target.value)} placeholder="Photos, e.g. 5" aria-label="Slots" style={{ width: 130 }} />
      <input value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="$ price" aria-label="Price" style={{ width: 110 }} />
      <SearchSelect options={[{ id: '', label: 'All events' }, ...events.map((e) => ({ id: e.id, label: e.name }))]} value={f.event_id} onChange={(v) => set('event_id', v || '')} placeholder="Event" />
      <button className="st-btn" disabled={!f.slots || f.price === ''} onClick={submit}>Add pack</button>
    </div>
  );
}

/* ---------- settings ---------- */
function SettingsForm({ settings, onDone }) {
  const notify = useNotify();
  const [val, setVal] = useState(null);
  useEffect(() => {
    if (!settings) return;
    const raw = settings.event_package_price_cents;
    setVal(raw === null || raw === undefined || raw === '' ? '' : dollars(raw));
  }, [settings]);
  if (!settings) return <p className="empty-note" role="status">Loading…</p>;
  const save = async () => {
    try {
      await studio.patch('/admin/settings', { key: 'event_package_price_cents', value: val === '' ? '' : String(cents(val)) });
      notify('Setting saved'); onDone();
    } catch (e) { notify(e.message, true); }
  };
  return (
    <div className="st-filters">
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: '#777', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Whole-event bundle price (NZ$) — empty = automatic</span>
        <input value={val ?? ''} onChange={(e) => setVal(e.target.value)} placeholder="Empty = automatic" style={{ width: 200 }} />
      </label>
      <button className="st-btn" style={{ alignSelf: 'end' }} onClick={save}>Save</button>
    </div>
  );
}
