'use client';
import { useCallback, useEffect, useState } from 'react';
import StudioShell, { Pager } from './studio';
import { useNotify } from './Toaster';
import { useConfirm } from './ConfirmModal';
import StudioTable from './StudioTable';
import SearchSelect from './SearchSelect';
import { searchSubjects } from '../lib/search-subjects';
import { API } from '../lib/api';
import { nzdc, studio, useStudioUser } from '../lib/studio';
import styles from './StudioPricing.module.css';

const dollars = (c) => (c === null || c === undefined || c === '' ? '' : String(Number(c) / 100));
const cents = (v) => (v === '' || v === null || v === undefined ? null : Math.round(Number(v) * 100));
const STATUS_OPTS = [{ id: 'published', label: 'Published' }, { id: 'draft', label: 'Draft' }, { id: 'archived', label: 'Archived' }];


export default function PricingClient({ events }) {
  const notify = useNotify();
  const { user } = useStudioUser();
  const isAdmin = user?.role === 'ADMIN';
  const [tiers, setTiers] = useState(null);
  const [my, setMy] = useState(null);
  const [packages, setPackages] = useState(null);
  const [products, setProducts] = useState(null);
  const [packs, setPacks] = useState(null);

  const load = useCallback(() => {
    studio.get('/admin/license-tiers').then((r) => setTiers(r || [])).catch((e) => notify(e.message, true));
    studio.get('/admin/my-prices').then((r) => setMy(r || { prices: [] })).catch((e) => { setMy({ prices: [] }); notify(e.message, true); });
    studio.get('/admin/packages').then((r) => setPackages(r || [])).catch(() => {});
    studio.get('/admin/reel-products').then((r) => setProducts(r || [])).catch(() => {});
    studio.get('/admin/credit-packs').then((r) => setPacks(r || [])).catch(() => {});
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  return (
    <StudioShell active="pricing">
      <div className={styles.page}>
      <nav className={styles.jump} aria-label="Pricing sections">
        {SECTIONS.filter(([id]) => isAdmin || id !== 'prebook').map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>
      <Section
        id="prices"
        title="Download prices"
        hint="What buyers pay to download one of your photos or reels. Leave a price empty to use the platform price."
      >
        <OwnPriceCards my={my} reload={load} />
        {isAdmin && (
          <>
            <h4 className={styles.formTitle}>Platform price · admin only</h4>
            <p className={styles.legacy} style={{ marginTop: 0, marginBottom: 12 }}>The default for every photographer who has not set their own price.</p>
            <PriceCards tiers={tiers} reload={load} />
          </>
        )}
      </Section>
      <Section
        id="bundles"
        title="Photo bundles"
        hint="Sell many photos together for one price: the whole event, all photos of one horse, or all photos of one rider. Bundles are built from your published photos."
        tip="If a bundle has been paid for, it cannot be deleted. Set it to Archived instead so buyers keep what they bought."
      >
        <PackageTable packages={packages} reload={load} />
        <PackageForm events={events} onDone={load} />
      </Section>
      <Section
        id="credits"
        title="Credit packs"
        hint="Pre-paid bundles: the buyer unlocks any N photos for one rider or one horse at one event. Re-downloads are free."
      >
        <PackTable packs={packs} reload={load} />
        <PackForm events={events} onDone={load} />
      </Section>
      {isAdmin && (
      <Section
        id="prebook"
        title="Pre-book reel packages"
        hint="Edited videos buyers order before the show, like a round edit with music. These are made to order, separate from download prices above. Set one to Draft to hide it without losing past orders."
      >
        <ProductTable products={products} reload={load} />
        <ProductForm events={events} onDone={load} />
      </Section>
      )}
      </div>
    </StudioShell>
  );
}

const SECTIONS = [['prices', 'Download prices'], ['bundles', 'Photo bundles'], ['credits', 'Credit packs'], ['prebook', 'Pre-book reel packages']];

function Section({ id, title, hint, tip, children }) {
  return (
    <section id={id} className={`st-card ${styles.section}`} style={{ marginTop: 18 }}>
      <h3>{title}</h3>
      {hint && <p className="st-csub" style={{ marginBottom: tip ? 4 : 18 }}>{hint}</p>}
      {tip && <p className="st-csub" style={{ color: '#999' }}>{tip}</p>}
      {children}
    </section>
  );
}

function MoneyInput({ value, onChange, label, placeholder = '0' }) {
  return (
    <span className={styles.money}>
      <i aria-hidden="true">NZ$</i>
      <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" aria-label={label} placeholder={placeholder} />
    </span>
  );
}

function Money({ cents: c }) { return <span>{c === null || c === undefined ? '—' : nzdc(c)}</span>; }

function StatusSelect({ value, onChange }) {
  return (
    <div className={styles.status}>
      <SearchSelect options={STATUS_OPTS} value={value} clearable={false} onChange={(v) => onChange(v || 'published')} placeholder="Status" />
    </div>
  );
}

function RowActions({ onReprice, onDelete }) {
  return (
    <span className={styles.rowActions}>
      <button type="button" className="st-btn-ghost" onClick={onReprice}>Reprice</button>
      <button type="button" className={styles.deleteLink} onClick={onDelete}>Delete</button>
    </span>
  );
}

// One labelled control in an add form. Labels stay visible, so placeholders can be examples.
function Field({ label, id, wide, children }) {
  return (
    <div className={`${styles.field}${wide ? ` ${styles.fieldWide}` : ''}`}>
      <span id={id}>{label}</span>
      {children}
    </div>
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

/* ---------- download prices: one for photos ('web'), one for reels ('reel') ---------- */
const QUALITY_OPTS = [
  { id: '1417x945', label: 'Small · social media' },
  { id: '2400x1600', label: 'Medium · everyday use' },
  { id: 'original', label: 'Original · best quality' },
];
const PRICE_CARDS = [
  { id: 'web', title: 'Photo', note: 'Every photo in the shop' },
  { id: 'reel', title: 'Reel', note: 'Every finished reel in the shop' },
];
const SPONSOR_TIER = 'sponsor-repost';

const OWN_CARDS = { web: { title: 'Photo', note: 'Each photo you sell' }, reel: { title: 'Reel', note: 'Each finished reel you sell' } };

function OwnPriceCards({ my, reload }) {
  if (my === null) return <p className="empty-note" role="status">Loading your prices…</p>;
  if (!my.prices?.length) return <p className="empty-note">Your prices aren’t available yet. Run database migration 106.</p>;
  return (
    <>
      {my.photographer?.name && <p className={styles.legacy} style={{ marginTop: 0, marginBottom: 12 }}>Selling as <b>{my.photographer.name}</b></p>}
      <div className={styles.priceGrid}>
        {my.prices.map((x) => x.tier_id).filter((id) => OWN_CARDS[id]).map((id) => {
          const p = my.prices.find((x) => x.tier_id === id);
          return p ? <OwnPriceCard key={`${id}-${p.own_cents ?? 'x'}-${p.platform_cents}`} card={OWN_CARDS[id]} p={p} reload={reload} /> : null;
        })}
      </div>
    </>
  );
}

function OwnPriceCard({ card, p, reload }) {
  const notify = useNotify();
  const [price, setPrice] = useState(dollars(p.own_cents));
  const [saving, setSaving] = useState(false);
  const own = p.own_cents != null;
  const dirty = price !== dollars(p.own_cents);
  const put = async (value) => {
    setSaving(true);
    try {
      await studio.put(`/admin/my-prices/${p.tier_id}`, { price_cents: value });
      notify(value == null ? `${card.title} uses the platform price` : `${card.title} price saved`);
      reload();
    } catch (e) { notify(e.message, true); }
    setSaving(false);
  };
  return (
    <div className={styles.priceCard}>
      <div className={styles.priceHead}>
        <h4>{card.title}</h4>
        <small>{card.note}. {own ? 'Your own price.' : `Using the platform price, ${nzdc(p.platform_cents)}.`}</small>
      </div>
      <div className={styles.priceFields}>
        <label className={styles.field}>
          <span>Your price</span>
          <MoneyInput value={price} onChange={setPrice} label={`Your ${card.title.toLowerCase()} price in NZ dollars, empty for the platform price`}
            placeholder={dollars(p.platform_cents) || '0'} />
        </label>
        {own && !dirty && (
          <button type="button" className={styles.inlineLink} style={{ fontSize: 12, alignSelf: 'center' }} disabled={saving} onClick={() => put(null)}>
            Use platform price
          </button>
        )}
        <button className={dirty ? 'st-btn' : 'st-btn-ghost'} disabled={!dirty || saving} onClick={() => put(price === '' ? null : cents(price))}>
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>
    </div>
  );
}

function PriceCards({ tiers, reload }) {
  if (tiers === null) return <p className="empty-note" role="status">Loading prices…</p>;
  const legacy = tiers.filter((t) => !PRICE_CARDS.some((c) => c.id === t.id) && t.id !== SPONSOR_TIER);
  const sponsor = tiers.find((t) => t.id === SPONSOR_TIER);
  return (
    <>
      <div className={styles.priceGrid}>
        {PRICE_CARDS.map((c) => {
          const t = tiers.find((x) => x.id === c.id);
          return t ? <PriceCard key={c.id} card={c} tier={t} reload={reload} />
            : <p key={c.id} className="empty-note">{c.title} price isn’t set up yet. Run database migration 105.</p>;
        })}
      </div>
      {sponsor && <PriceCard card={{ id: SPONSOR_TIER, title: 'Sponsor repost', note: 'Community moments only. Sponsors buy it on the moment page.' }} tier={sponsor} reload={reload} compact />}
      {!!legacy.length && (
        <p className={styles.legacy}>
          Older options ({legacy.map((t) => t.label).join(', ')}) are hidden from the shop and kept only for past orders.
        </p>
      )}
    </>
  );
}

function PriceCard({ card, tier, reload, compact = false }) {
  const notify = useNotify();
  const [price, setPrice] = useState(dollars(tier.price_cents));
  const [res, setRes] = useState(tier.max_resolution || 'original');
  const [printable, setPrintable] = useState(!!tier.printable);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPrice(dollars(tier.price_cents)); setRes(tier.max_resolution || 'original'); setPrintable(!!tier.printable); }, [tier]);
  const dirty = price !== dollars(tier.price_cents) || res !== (tier.max_resolution || 'original') || printable !== !!tier.printable;
  const save = async () => {
    if (price === '' || !(Number(price) > 0)) { notify('Enter a price above 0, e.g. 25.', true); return; }
    setSaving(true);
    try {
      await studio.patch(`/admin/license-tiers/${tier.id}`, { price_cents: cents(price), max_resolution: res, printable });
      notify(`${card.title} price saved`); reload();
    } catch (e) { notify(e.message, true); }
    setSaving(false);
  };
  const showFile = card.id === 'web';
  return (
    <div className={`${styles.priceCard}${compact ? ` ${styles.priceCardCompact}` : ''}`}>
      <div className={styles.priceHead}>
        <h4>{card.title}</h4>
        <small>{card.note}</small>
      </div>
      <div className={styles.priceFields}>
        <label className={styles.field}>
          <span>Price</span>
          <MoneyInput value={price} onChange={setPrice} label={`${card.title} price in NZ dollars`} />
        </label>
        {showFile && (
          <div className={styles.field}>
            <span id={`file-${card.id}`}>File buyers get</span>
            <SearchSelect labelId={`file-${card.id}`} value={QUALITY_OPTS.some((q) => q.id === res) ? res : 'original'} clearable={false}
              options={QUALITY_OPTS} onChange={(id) => setRes(id)} placeholder="File" />
          </div>
        )}
        {showFile && (
          <div className={styles.field}>
            <span>Print-ready</span>
            <Toggle on={printable} label={`${card.title} file is print-ready`} onChange={setPrintable} />
          </div>
        )}
        <button className={dirty ? 'st-btn' : 'st-btn-ghost'} disabled={!dirty || saving} onClick={save}>
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>
    </div>
  );
}

// A real switch: one control for one yes/no, with its state in words.
function Toggle({ on, label, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={styles.toggle} onClick={() => onChange(!on)}>
      <span className={styles.knob} aria-hidden="true" />
      <span className={styles.toggleText}>{on ? 'Yes' : 'No'}</span>
    </button>
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
              <RowActions onReprice={() => reprice(p)} onDelete={() => remove(p)} />
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
      <h4 className={styles.formTitle}>New bundle</h4>
      <div className={styles.form}>
        <Field label="Event" id="pk-event">
          <SearchSelect labelId="pk-event" options={events.map((e) => ({ id: e.id, label: e.name }))}
            value={eventId || null} onChange={(v) => setEventId(v || '')} placeholder="Choose an event" />
        </Field>
        <Field label="Photos of" id="pk-subject">
          <SearchSelect labelId="pk-subject" clearable={false} options={[{ id: '', label: 'Whole event' }, { id: 'horse', label: 'One horse' }, { id: 'rider', label: 'One rider' }]}
            value={subject} onChange={(v) => { setSubject(v || ''); setSubjectId(''); setSubjectName(''); }} placeholder="Whole event" />
        </Field>
        {subject && (
          <Field label={subject === 'horse' ? 'Horse' : 'Rider'} id="pk-who">
            <SearchSelect labelId="pk-who" options={[]} loadOptions={searchSubject}
              value={subjectId || null} selectedOption={subjectId ? { id: subjectId, label: subjectName } : null}
              onChange={(id, o) => { setSubjectId(id || ''); setSubjectName(o?.label || ''); }}
              placeholder={`Search ${subject} name`} />
          </Field>
        )}
        <Field label="Price (optional)">
          <MoneyInput value={price} onChange={setPrice} label="Bundle price in NZ dollars, empty for automatic" placeholder="Automatic" />
        </Field>
        <button className="st-btn" disabled={!eventId || (!!subject && !subjectId)} onClick={submit}>Build bundle</button>
      </div>
    </div>
  );
}

/* ---------- reel products ---------- */
const SCOPE_LABEL = { clip: 'Single clip', round: 'One round', event: 'Whole event' };
const COVERAGE_LABEL = { ring: 'Ring only', full: 'Ring + warm-up' };

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
            <td>{SCOPE_LABEL[p.scope] || p.scope} · {COVERAGE_LABEL[p.coverage] || p.coverage}</td>
            <td><Money cents={p.price_cents} /></td>
            <td>{p.orders ?? '—'}</td>
            <td><StatusSelect value={p.status} onChange={(v) => save(p, { status: v })} /></td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <RowActions onReprice={() => reprice(p)} onDelete={() => remove(p)} />
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
    <div>
      <h4 className={styles.formTitle}>New reel package</h4>
      <div className={styles.form}>
        <Field label="Name" wide>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Round edit + music" aria-label="Name" />
        </Field>
        <Field label="Price">
          <MoneyInput value={f.price} onChange={(v) => set('price', v)} label="Price in NZ dollars" />
        </Field>
        <Field label="Length" id="rp-scope">
          <SearchSelect labelId="rp-scope" clearable={false} options={Object.entries(SCOPE_LABEL).map(([id, label]) => ({ id, label }))} value={f.scope} onChange={(v) => set('scope', v || 'round')} placeholder="Length" />
        </Field>
        <Field label="Coverage" id="rp-cov">
          <SearchSelect labelId="rp-cov" clearable={false} options={Object.entries(COVERAGE_LABEL).map(([id, label]) => ({ id, label }))} value={f.coverage} onChange={(v) => set('coverage', v || 'ring')} placeholder="Coverage" />
        </Field>
        <Field label="Event" id="rp-event">
          <SearchSelect labelId="rp-event" clearable={false} options={[{ id: '', label: 'All events' }, ...events.map((e) => ({ id: e.id, label: e.name }))]} value={f.event_id} onChange={(v) => set('event_id', v || '')} placeholder="All events" />
        </Field>
        <Field label="What the buyer gets (optional)" wide>
          <input value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. 60 second edit with music" aria-label="Description" />
        </Field>
        <button className="st-btn" disabled={!f.name.trim() || f.price === ''} onClick={submit}>Add package</button>
      </div>
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
        { key: 'scope', label: 'For', render: (p) => (p.scope_type === 'horse' ? 'One horse' : p.scope_type === 'rider' ? 'One rider' : p.scope_type) },
        { key: 'slots', label: 'Photos', render: (p) => p.slots },
        { key: 'price', label: 'Price', render: (p) => <Money cents={p.price_cents} /> },
        { key: 'event', label: 'Event', render: (p) => p.event_name || 'All events' },
        { key: 'bundles', label: 'Sold', render: (p) => p.bundles ?? '—' },
        { key: 'status', label: 'Status', render: (p) => <StatusSelect value={p.status} onChange={(v) => save(p, { status: v })} /> },
        { key: 'actions', label: '', render: (p) => (
          <span style={{ whiteSpace: 'nowrap' }}>
            <RowActions onReprice={() => reprice(p)} onDelete={() => remove(p)} />
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
    <div>
      <h4 className={styles.formTitle}>New credit pack</h4>
      <div className={styles.form}>
        <Field label="For" id="cp-for">
          <SearchSelect labelId="cp-for" clearable={false} options={[{ id: 'rider', label: 'One rider' }, { id: 'horse', label: 'One horse' }]} value={f.scope_type} onChange={(v) => set('scope_type', v || 'rider')} placeholder="One rider" />
        </Field>
        <Field label="Photos">
          <input value={f.slots} onChange={(e) => set('slots', e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="5" aria-label="Number of photos" />
        </Field>
        <Field label="Price">
          <MoneyInput value={f.price} onChange={(v) => set('price', v)} label="Price in NZ dollars" />
        </Field>
        <Field label="Event" id="cp-event">
          <SearchSelect labelId="cp-event" clearable={false} options={[{ id: '', label: 'All events' }, ...events.map((e) => ({ id: e.id, label: e.name }))]} value={f.event_id} onChange={(v) => set('event_id', v || '')} placeholder="All events" />
        </Field>
        <button className="st-btn" disabled={!f.slots || f.price === ''} onClick={submit}>Add pack</button>
      </div>
    </div>
  );
}

