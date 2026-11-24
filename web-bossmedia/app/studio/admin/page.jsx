'use client';
import { useCallback, useEffect, useState } from 'react';
import StudioShell, { Pager } from '../../../components/studio';
import { useNotify } from '../../../components/Toaster';
import { useConfirm } from '../../../components/ConfirmModal';
import SearchSelect from '../../../components/SearchSelect';
import QrPosterModal from '../../../components/QrPosterModal';
import AdminSponsors from '../../../components/AdminSponsors';
import AdminMerchCatalog from '../../../components/AdminMerchCatalog';
import AdminMerchOrders from '../../../components/AdminMerchOrders';
import { nzdc, studio, studioFetch, useStudioUser } from '../../../lib/studio';
import { fmtDay, payoutBreakdown } from '../../../lib/studio-format.mjs';
import { useDocumentTitle } from '../../../lib/use-document-title';
import formRow from '../../../components/FormRow.module.css';

const SECTIONS = [['commission', 'Commission'], ['orders', 'Merch orders'], ['merch', 'Merch pricing & delivery'], ['catalog', 'Merch catalog'], ['users', 'Users'], ['applications', 'Requests'], ['events', 'Events'], ['sponsors', 'Sponsors']];
// Pickable roles (mirrors the API allowlist — PHOTOGRAPHER and ORGANIZER are
// granted only by approving an application, never picked here).
const ROLES = ['PUBLIC', 'RIDER', 'COACH', 'OWNER', 'BREEDER', 'ADMIN'];

const ROLE_BADGE = {
  ADMIN: { color: '#e08a8a', border: '#6b3a3a' },
  PHOTOGRAPHER: { color: '#e3b95c', border: '#6b5326' },
  ORGANIZER: { color: '#8fc3e8', border: '#2f4d63' },
};
function RoleBadge({ role }) {
  const s = ROLE_BADGE[role];
  if (!s) return null;
  return (
    <span style={{
      display: 'inline-block', marginTop: 4, fontSize: 10, fontWeight: 700,
      letterSpacing: '.07em', color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 999, padding: '2px 8px',
    }}>
      {role}
    </span>
  );
}

export default function AdminPage() {
  useDocumentTitle('Admin');
  return (
    <StudioShell active="admin">
      <AdminBody />
    </StudioShell>
  );
}

function AdminBody() {
  const { user, state } = useStudioUser();
  const [section, setSection] = useState('commission');
  if (state === 'loading') return <p className="empty-note">Loading…</p>;
  if (state !== 'ok' || user?.role !== 'ADMIN') {
    return (
      <div className="event-media-empty">
        <p className="eyebrow">Restricted</p>
        <h3>Media admins only.</h3>
        <p>This console needs an ADMIN account.</p>
      </div>
    );
  }
  return (
    <>
      <div className="st-filters" role="group" aria-label="Admin sections">
        {SECTIONS.map(([key, label]) => (
          <button key={key} className="st-btn-ghost" style={section === key ? { borderColor: '#fff' } : undefined}
            onClick={() => setSection(key)}>{label}</button>
        ))}
      </div>
      {section === 'commission' && <Commission />}
      {section === 'orders' && <AdminMerchOrders />}
      {section === 'merch' && <MerchSettings />}
      {section === 'catalog' && <AdminMerchCatalog />}
      {section === 'users' && <Users selfId={user.id} />}
      {section === 'applications' && <Applications />}
      {section === 'events' && <Events />}
      {section === 'sponsors' && <AdminSponsors />}
    </>
  );
}

/* ---------- commission: platform/organizer rates + package price + settlement ---------- */
function Commission() {
  const notify = useNotify();
  const [confirmUI, dialog] = useConfirm();
  const [form, setForm] = useState(null); // {platform, organizer, packagePrice} as text
  const [settle, setSettle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settleOffset, setSettleOffset] = useState(0);
  const SETTLE_PAGE = 10;
  const settleSafe = Math.min(settleOffset, Math.max(0, (Math.ceil(((settle || []).length) / SETTLE_PAGE) - 1) * SETTLE_PAGE));

  const load = useCallback(() => {
    studio.get('/admin/settings').then((s) => setForm({
      platform: s.platform_commission_rate === '' ? '' : String(Number(s.platform_commission_rate) * 100),
      organizer: s.organizer_share_rate === '' ? '' : String(Number(s.organizer_share_rate) * 100),
      packagePrice: s.event_package_price_cents === '' ? '' : String(Number(s.event_package_price_cents) / 100),
    })).catch((e) => notify(e.message, true));
    studio.get('/admin/sales/summary').then((d) => setSettle(d.settlement || [])).catch(() => {});
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    const platform = form.platform.trim() === '' ? '' : Number(form.platform) / 100;
    const organizer = form.organizer.trim() === '' ? '' : Number(form.organizer) / 100;
    const cents = form.packagePrice.trim() === '' ? '' : Math.round(Number(form.packagePrice) * 100);
    if ((platform !== '' && !(platform >= 0 && platform <= 1)) ||
        (organizer !== '' && !(organizer >= 0 && organizer <= 1))) {
      return notify('Rates must be 0–100%.', true);
    }
    if (platform !== '' && organizer !== '' && platform + organizer > 1) {
      return notify('Platform + organizer must not exceed 100%.', true);
    }
    if (cents !== '' && (!Number.isInteger(cents) || cents < 0)) {
      return notify('Package price must be a non-negative dollar amount.', true);
    }
    if (!await dialog.confirm({ title: 'Save commission settings?', message: 'Buyers see new prices immediately.' })) return;
    setBusy(true);
    try {
      await studio.patch('/admin/settings', { key: 'platform_commission_rate', value: platform === '' ? '' : String(platform) });
      await studio.patch('/admin/settings', { key: 'organizer_share_rate', value: organizer === '' ? '' : String(organizer) });
      await studio.patch('/admin/settings', { key: 'event_package_price_cents', value: cents === '' ? '' : String(cents) });
      notify('Commission settings saved');
    } catch (e) { notify(e.message, true); }
    setBusy(false);
  }

  if (!form) return <p className="empty-note">Loading…</p>;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <>
      <div className="st-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="st-form">
          <div className={`st-form-row ${formRow.row3}`}>
            <label><span>Platform cut (%)</span>
              <input type="text" inputMode="decimal" value={form.platform} onChange={(e) => set('platform')(e.target.value)} placeholder="e.g. 10" /></label>
            <label><span>Organizer share (%)</span>
              <input type="text" inputMode="decimal" value={form.organizer} onChange={(e) => set('organizer')(e.target.value)} placeholder="e.g. 10" /></label>
            <label><span>Whole-event package (NZ$)</span>
              <input type="text" inputMode="decimal" value={form.packagePrice} onChange={(e) => set('packagePrice')(e.target.value)} placeholder="blank = auto" /></label>
          </div>
          <div><button className="st-btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button></div>
        </div>
      </div>
      <div className="st-card" style={{ padding: '6px 22px' }}>
        <div className="table-scroll"><table className="st-table">
          <thead><tr><th>Photographer</th><th>Sales</th><th>Gross</th><th>Platform</th><th>Organizer</th><th>Card fees</th><th>Payout</th></tr></thead>
          <tbody>
            {(settle || []).slice(settleSafe, settleSafe + SETTLE_PAGE).map((s) => {
              const b = payoutBreakdown(s);
              return (
                <tr key={s.photographer_id}>
                  <td>{s.photographer}</td>
                  <td>{s.sales}</td>
                  <td>{nzdc(b.gross)}</td>
                  <td>{nzdc(b.fee)}</td>
                  <td>{nzdc(b.organizer)}</td>
                  <td>{nzdc(b.cardFees)}</td>
                  <td><b>{nzdc(b.payout)}</b></td>
                </tr>
              );
            })}
          </tbody>
          </table></div>
          {settle && !settle.length && <p className="empty-note">No paid sales yet.</p>}
          <Pager total={(settle || []).length} limit={SETTLE_PAGE} offset={settleSafe} onPage={setSettleOffset} />
        </div>
      {confirmUI}
    </>
  );
}

// Admins work on this week's shows: upcoming events nearest first, then past events newest first.
function sortEventsForAdmin(events, today = new Date().toISOString().slice(0, 10)) {
  const day = (e) => String(e.date_start || '').slice(0, 10);
  const upcoming = events.filter((e) => day(e) >= today).sort((a, b) => day(a).localeCompare(day(b)));
  const past = events.filter((e) => day(e) < today).sort((a, b) => day(b).localeCompare(day(a)));
  return [...upcoming, ...past];
}

/* ---------- merch pricing rules, delivery prices, pickup, sponsor cap ---------- */
const MERCH_FIELDS = [
  ['courierCents', 'Courier, flat (NZ$)', 'NZ-wide flat rate'],
  ['freeOverCents', 'Free courier from (NZ$)', '0 = never free'],
  ['sponsorCapCents', 'Sponsor discount cap per order (NZ$)', 'Max sponsor discount on one order'],
  ['fallbackSponsorDiscountCents', 'Estimated sponsor discount per logo (NZ$)', 'Shown while a sponsor has no funded amount. Orders only use funded amounts'],
  ['uploadLogoCents', 'Extra for the buyer\'s own logo (NZ$)', '0 = free'],
];
function MerchSettings() {
  const notify = useNotify();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    studio.get('/api/merch/settings').then((d) => setForm({
      ...Object.fromEntries(MERCH_FIELDS.map(([k]) => [k, String(Number(d[k]) / 100)])),
      pickupEnabled: !!d.pickupEnabled,
      maxDiscountPct: String(d.maxDiscountPct),
      sponsorDiscountOncePerItem: !!d.sponsorDiscountOncePerItem,
    })).catch((e) => notify(e.message, true));
  }, [notify]);

  async function save(e) {
    e.preventDefault();
    const pct = Number(form.maxDiscountPct);
    if (!Number.isInteger(pct) || pct < 0 || pct > 90) return notify('Max discount per item: enter a whole percent, 0 to 90.', true);
    const body = { pickupEnabled: form.pickupEnabled, maxDiscountPct: pct, sponsorDiscountOncePerItem: form.sponsorDiscountOncePerItem };
    for (const [k, label] of MERCH_FIELDS) {
      const c = Math.round(Number(form[k]) * 100);
      if (form[k].trim() === '' || !Number.isInteger(c) || c < 0 || c > 1000000) return notify(`${label}: enter 0 to 10000.`, true);
      body[k] = c;
    }
    setBusy(true);
    try {
      await studioFetch('/admin/merch/settings', { method: 'PUT', body });
      notify('Merch order settings saved');
    } catch (err) { notify(err.message, true); }
    setBusy(false);
  }

  if (!form) return <p className="empty-note">Loading…</p>;
  return (
    <div className="st-card" style={{ padding: 18 }}>
      <form className="st-form" onSubmit={save}>
        <div className={`st-form-row ${formRow.row3}`}>
          {MERCH_FIELDS.map(([k, label, hint]) => (
            <label key={k}><span>{label}</span>
              <input type="text" inputMode="decimal" value={form[k]} title={hint} placeholder={hint}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} /></label>
          ))}
          <label><span>Max sponsor discount per item (%)</span>
            <input type="text" inputMode="numeric" value={form.maxDiscountPct} title="Never discount more than this share of the base price"
              onChange={(e) => setForm((f) => ({ ...f, maxDiscountPct: e.target.value }))} /></label>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={form.pickupEnabled} style={{ width: 'auto' }}
            onChange={(e) => setForm((f) => ({ ...f, pickupEnabled: e.target.checked }))} />
          <span>Offer free club pickup</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={form.sponsorDiscountOncePerItem} style={{ width: 'auto' }}
            onChange={(e) => setForm((f) => ({ ...f, sponsorDiscountOncePerItem: e.target.checked }))} />
          <span>Count each sponsor once per item (the same logo twice discounts once)</span>
        </label>
        <p style={{ margin: 0, color: "#999", fontSize: 12 }}>Prices include GST. The designer and new orders use these within a minute, orders already sent keep their quote.</p>
        <div><button className="st-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save merch settings'}</button></div>
      </form>
    </div>
  );
}

/* ---------- users: search, role change, session revoke ---------- */
function Users({ selfId }) {
  const notify = useNotify();
  const [confirmUI, dialog] = useConfirm();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);

  const search = useCallback((term) => {
    studio.get(`/admin/users${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ''}`)
      .then(setRows).catch((e) => notify(e.message, true));
  }, [notify]);
  useEffect(() => { search(''); }, [search]);

  async function setRole(u, role) {
    if (role === u.role) return;
    if (!await dialog.confirm({ title: `Set ${u.email} to ${role}?`, message: role === 'ADMIN' ? 'Admins can approve photographers and change money settings.' : undefined, danger: role === 'ADMIN' })) return;
    try {
      const updated = await studio.patch(`/admin/users/${u.id}`, { role });
      setRows((xs) => (xs || []).map((x) => (x.id === u.id ? { ...x, role: updated.role } : x)));
      notify(`Role → ${updated.role}`);
    } catch (e) { notify(e.message, true); }
  }

  async function revoke(u) {
    if (!await dialog.confirm({ title: `Sign out ${u.email} everywhere?`, danger: true })) return;
    try {
      const r = await studio.del(`/admin/users/${u.id}/sessions`);
      setRows((xs) => (xs || []).map((x) => (x.id === u.id ? { ...x, active_sessions: 0 } : x)));
      notify(`Revoked ${r.revoked} session(s)`);
    } catch (e) { notify(e.message, true); }
  }

  return (
    <>
      <form className="st-form" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); search(q); }}>
        <label><span>Search name or email</span>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" autoComplete="off" /></label>
      </form>
      {rows === null ? <p className="empty-note">Loading…</p> : !rows.length ? (
        <p className="empty-note">No users found.</p>
      ) : (
        <UserTable rows={rows} selfId={selfId} setRole={setRole} revoke={revoke} />
      )}
      {confirmUI}
    </>
  );
}

const ROLE_FILTERS = [['', 'All'], ['PHOTOGRAPHER', 'Photographers'], ['ORGANIZER', 'Organizers'], ['ADMIN', 'Admins']];

function UserTable({ rows, selfId, setRole, revoke }) {
  const [offset, setOffset] = useState(0);
  const [roleFilter, setRoleFilter] = useState('');
  const PAGE = 15;
  const list = roleFilter ? rows.filter((u) => u.role === roleFilter) : rows;
  const safe = Math.min(offset, Math.max(0, (Math.ceil(list.length / PAGE) - 1) * PAGE));
  return (
        <div className="st-card" style={{ padding: '6px 22px' }}>
          <div className="st-filters" role="group" aria-label="Filter by role" style={{ margin: '14px 0 4px' }}>
            {ROLE_FILTERS.map(([v, label]) => {
              const n = v ? rows.filter((u) => u.role === v).length : rows.length;
              return (
                <button key={v} aria-pressed={roleFilter === v} className="st-btn-ghost"
                  style={{ minHeight: 34, ...(roleFilter === v ? { borderColor: '#fff' } : undefined) }}
                  onClick={() => { setRoleFilter(v); setOffset(0); }}>
                  {label + (n > 0 ? ' (' + n + ')' : '')}
                </button>
              );
            })}
          </div>
          <div className="table-scroll"><table className="st-table">
            <thead><tr><th>User</th><th>Role</th><th>Sessions</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {list.slice(safe, safe + PAGE).map((u) => (
                <tr key={u.id}>
                  <td><div style={{ fontWeight: 600 }}>{u.name}</div>
                    <div style={{ color: '#777', fontSize: 11 }}>{u.email}</div>
                    <RoleBadge role={u.role} /></td>
                  <td>
                    <SearchSelect value={u.role} disabled={u.id === selfId} onChange={(id) => setRole(u, id)}
                      placeholder="Role" clearable={false}
                      options={(ROLES.includes(u.role) ? ROLES : [...ROLES, u.role]).map((r) => ({ id: r, label: r }))} />
                    {u.id === selfId && <div style={{ color: '#777', fontSize: 11, marginTop: 4 }}>That’s you</div>}
                  </td>
                  <td>{u.active_sessions}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(u.created_at)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="st-btn-ghost" style={{ minHeight: 36 }} disabled={u.id === selfId || !u.active_sessions}
                      onClick={() => revoke(u)}>Sign out</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {!list.length && <p className="empty-note">No users with this role.</p>}
          <Pager total={list.length} limit={PAGE} offset={safe} onPage={setOffset} />
            <p style={{ color: '#777', fontSize: 12, padding: '0 0 12px' }}>
              PHOTOGRAPHER and ORGANIZER are granted only by approving an application — they can’t be picked here.
            </p>
        </div>
  );
}

/* ---------- applications: photographer queue (corrections entity_type 'other') ---------- */
// Photographer applications follow a fixed template (see PhotographerRegisterClient);
// parse it into labeled fields, fall back to raw lines for anything else.
const APP_LABELS = ['portfolio', 'region', 'social', 'gear', 'events covered', 'organization', 'events', 'contact', 'brand', 'website', 'interested in'];
function parseApplication(message) {
  const fields = [];
  let cur = null;
  for (const raw of String(message || '').split('\n')) {
    const line = raw.trim();
    // Header line ("…application from Name <email>") repeats the modal
    // header — skip it so it doesn't render as a redundant Notes row.
    if (!line || /^(photographer|organizer|sponsor) application from/i.test(line)) continue;
    const m = line.match(/^([^:]{2,30}):\s*(.*)$/);
    if (m && APP_LABELS.includes(m[1].toLowerCase())) {
      cur = { label: m[1], value: m[2] };
      fields.push(cur);
      continue;
    }
    if (cur) cur.value += `\n${line}`;
    else fields.push({ label: '', value: line });
  }
  return fields.filter((f) => f.value && f.value.trim());
}

const APPLICATION_KIND = { other: 'Photographer application', organizer: 'Organizer application', sponsor: 'Sponsor application' };
const APPROVE_PATH = { other: '/admin/photographers/approve', organizer: '/admin/organizers/approve', sponsor: '/admin/sponsors/approve' };
const ROLE_NOUN = { other: 'a photographer', organizer: 'an organizer', sponsor: 'a sponsor' };
const APPROVE_NOTE = {
  other: 'Creates a photographer profile and grants upload access.',
  organizer: 'Creates an organizer profile: event dashboard, revenue share, volunteer grants.',
  sponsor: 'Creates a sponsor profile. Add their pre-agreed budget under Sponsors next.',
};
const isApplication = (c) => !!APPLICATION_KIND[c.entity_type];
const requestKind = (c) => APPLICATION_KIND[c.entity_type] || 'Correction report';

function AppDetail({ c }) {
  const kindLabel = requestKind(c);
  const fields = isApplication(c)
    ? parseApplication(c.message) : [{ label: '', value: c.message }];
  return (
    <>
            <p className="eyebrow">{kindLabel} · {fmtDay(c.created_at)}</p>
      <h3>{c.name || '—'}</h3>
      <p style={{ color: '#999', fontSize: 13 }}>{c.email}</p>
      <dl style={{ display: 'grid', gap: 0, margin: '16px 0 4px', borderTop: '1px solid #2c2c2c', fontSize: 13 }}>
        {fields.map((f, i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #2c2c2c' }}>
            <dt style={{ color: '#777', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {f.label || 'Notes'}
            </dt>
            <dd style={{ margin: '5px 0 0', color: '#eee', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {f.label.toLowerCase() === 'portfolio' && /^https?:\/\//i.test(f.value.trim()) ? (
                <a href={f.value.trim()} target="_blank" rel="noreferrer" style={{ color: '#fff', borderBottom: '1px solid #666' }}>
                  {f.value.trim()}
                </a>
              ) : f.value}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
function Applications() {
  const notify = useNotify();
  const [confirmUI, dialog] = useConfirm();
  const [status, setStatus] = useState('open');
  const [kind, setKind] = useState('apps'); // applications grant access, so they come first
  const [allRows, setRows] = useState(null);
  const rows = allRows && allRows.filter((c) => (kind === 'apps' ? isApplication(c) : !isApplication(c)));
  const appCount = (allRows || []).filter(isApplication).length;
  const [viewing, setViewing] = useState(null);
  const [offset, setOffset] = useState(0);
  const PAGE = 10;

  const load = useCallback((s = status) => {
    setOffset(0);
    studio.get(`/admin/corrections?status=${s}`).then(setRows).catch((e) => notify(e.message, true));
  }, [status, notify]);
  useEffect(() => { load(); }, [load]);
  const safe = Math.min(offset, Math.max(0, (Math.ceil(((rows || []).length) / PAGE) - 1) * PAGE));

  async function decide(c, to) {
    const note = await dialog.prompt({
      title: `${to === 'resolved' ? 'Resolve' : 'Reject'} application from ${c.name || c.email}?`,
      placeholder: 'Note for the record (optional)', confirmLabel: to === 'resolved' ? 'Resolve' : 'Reject',
      danger: to === 'rejected',
    });
    if (note === null) return;
    try {
      await studio.post(`/admin/corrections/${c.id}`, { status: to, resolved_note: note || undefined });
      setRows((xs) => (xs || []).filter((x) => x.id !== c.id));
      setViewing(null);
      notify(`Application ${to}`);
    } catch (e) { notify(e.message, true); }
  }

  async function approve(c) {
    const k = c.entity_type;
    if (!await dialog.confirm({
      title: `Approve ${c.name || c.email} as ${ROLE_NOUN[k]}?`,
      message: APPROVE_NOTE[k],
    })) return;
    try {
      const r = await studio.post(APPROVE_PATH[k], { correction_id: c.id });
      setRows((xs) => (xs || []).filter((x) => x.id !== c.id));
      setViewing(null);
      // studio.post returns the raw body ({ data }) — unlike studio.get.
      const approved = (r.data || r).user || {};
      notify(`Approved: ${approved.email || c.email} is now ${ROLE_NOUN[k]}`);
    } catch (e) { notify(e.message, true); }
  }

  return (
    <>
      <div className="st-filters" role="group" aria-label="Application status">
        {['open', 'in_review'].map((s) => (
          <button key={s} className="st-btn-ghost" style={status === s ? { borderColor: '#fff' } : undefined}
            onClick={() => setStatus(s)}>{s === 'open' ? 'Open' : 'In review'}</button>
        ))}
        <span aria-hidden="true" style={{ width: 1, background: '#333', margin: '6px 4px' }} />
        {[['apps', 'Applications', appCount], ['corrections', 'Correction reports', (allRows || []).length - appCount]].map(([k, label, n]) => (
          <button key={k} className="st-btn-ghost" style={kind === k ? { borderColor: '#fff' } : undefined}
            onClick={() => { setKind(k); setOffset(0); }}>{label} ({n})</button>
        ))}
      </div>
      {rows === null ? <p className="empty-note">Loading…</p> : !rows.length ? (
        <p className="empty-note">{kind === 'apps' ? 'No applications waiting.' : 'No correction reports waiting.'}</p>
      ) : (
        <div className="st-card" style={{ padding: '6px 22px' }}>
          <div className="table-scroll"><table className="st-table">
            <thead><tr><th>From</th><th>Type</th><th>Subject</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {rows.slice(safe, safe + PAGE).map((c) => (
                <tr key={c.id}>
                  <td><div style={{ fontWeight: 600 }}>{c.name || '—'}</div>
                    <div style={{ color: '#9a9a9a', fontSize: 11 }}>{c.email}</div></td>
                  <td style={{ fontSize: 13 }}>{requestKind(c)}</td>
                  <td style={{ fontSize: 13 }}>{c.subject || '—'}</td>
                  <td>{fmtDay(c.created_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="st-btn-ghost" style={{ minHeight: 36 }} onClick={() => setViewing(c)}>Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pager total={rows.length} limit={PAGE} offset={safe} onPage={setOffset} />
        </div>
      )}
      {viewing && (
        <div className="st-modal" role="dialog" aria-modal="true" aria-label={`Application from ${viewing.name || viewing.email}`}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setViewing(null); }}>
          <div className="st-modal-card" role="document" style={{ maxWidth: 640 }}>
            <AppDetail c={viewing} />
            <div className="st-modal-actions" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="st-btn-ghost" onClick={() => setViewing(null)}>Close</button>
                <button className="st-btn-ghost" title="Mark as handled without granting access"
                  onClick={() => decide(viewing, 'resolved')}>Resolve</button>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="st-btn-ghost st-btn-danger" onClick={() => decide(viewing, 'rejected')}>Reject</button>
                {isApplication(viewing) && status === 'open' && (
                  <button className="st-btn" onClick={() => approve(viewing)}>Approve</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmUI}
    </>
  );
}

/* ---------- events: link results events to organizers (claim) ---------- */
function Events() {
  const notify = useNotify();
  const [confirmUI, dialog] = useConfirm();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [offset, setOffset] = useState(0);
  const PAGE = 15;
  const safe = Math.min(offset, Math.max(0, (Math.ceil(((rows || []).length) / PAGE) - 1) * PAGE));

  const search = useCallback((term) => {
    studio.get(`/admin/events${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ''}`)
      .then((r) => setRows(sortEventsForAdmin(r || []))).catch((e) => notify(e.message, true));
  }, [notify]);
  useEffect(() => {
    search('');
    studio.get('/admin/organizers').then(setOrgs).catch(() => {});
  }, [search]);

  async function link(ev, organizerId) {
    const org = orgs.find((o) => o.id === organizerId);
    const verb = organizerId ? `Link “${ev.name}” to ${org?.name || 'organizer'}?` : `Unlink “${ev.name}” from its organizer?`;
    if (!await dialog.confirm({
      title: verb,
      message: organizerId ? 'Their dashboard, revenue share and pre-book listing follow this event.' : undefined,
    })) return;
    try {
      const j = await studio.patch(`/admin/events/${ev.id}/organizer`, { organizer_id: organizerId || null });
      const updated = j.data || j;
      setRows((xs) => (xs || []).map((x) => (x.id === ev.id
        ? { ...x, organizer_id: updated.organizer_id, organizer_name: org?.name || null } : x)));
      notify(organizerId ? 'Event linked' : 'Event unlinked');
    } catch (e) { notify(e.message, true); }
  }

  const [qr, setQr] = useState(null); // { event, code }
  const [qrBusy, setQrBusy] = useState(false);

  // Venue QR for any event (results events included): mints the upload code
  // on first use, same minter the organizer dashboard uses.
  async function showQr(ev) {
    if (qrBusy) return;
    if (ev.upload_code) return setQr({ event: ev, code: ev.upload_code });
    setQrBusy(true);
    try {
      const j = await studio.post(`/admin/events/${ev.id}/upload-code`, {});
      const code = j?.upload_code || j?.data?.upload_code;
      if (!code) throw new Error('no code returned');
      setRows((xs) => (xs || []).map((x) => (x.id === ev.id ? { ...x, upload_code: code } : x)));
      setQr({ event: ev, code });
    } catch (e) { notify(e.message, true); }
    setQrBusy(false);
  }

  // Pre-book visibility: hidden by default, only enabled events show.
  const pbVal = (ev) => (ev.prebook_open === true ? 'show' : 'hide');
  async function setPrebook(ev, v) {
    try {
      const j = await studio.patch(`/admin/events/${ev.id}`, { prebook_open: v === 'show' });
      const updated = j.data || j;
      setRows((xs) => (xs || []).map((x) => (x.id === ev.id ? { ...x, prebook_open: updated.prebook_open } : x)));
      notify(v === 'show' ? 'Shown in pre-book' : 'Hidden from pre-book');
    } catch (e) { notify(e.message, true); }
  }

  return (
    <>
      <form className="st-form" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); search(q); }}>
        <label><span>Search events</span>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type event name…" autoComplete="off" /></label>
      </form>
      <NewEventForm onCreated={(ev) => { setRows((xs) => [ev, ...(xs || [])]); search(''); }} />
      {rows === null ? <p className="empty-note">Loading…</p> : !rows.length ? (
        <p className="empty-note">No events found.</p>
      ) : (
        <div className="st-card" style={{ padding: '6px 22px' }}>
          <div className="table-scroll"><table className="st-table">
            <thead><tr><th>Event</th><th>Date</th><th>Data</th><th>Pre-book</th><th>Organizer</th><th style={{ textAlign: 'right' }}>QR</th></tr></thead>
            <tbody>
              {rows.slice(safe, safe + PAGE).map((ev) => (
                <tr key={ev.id}>
                  <td><div style={{ fontWeight: 600 }}>{ev.name}</div>
                    <div style={{ color: '#777', fontSize: 11 }}>{[ev.venue, ev.region].filter(Boolean).join(' · ')}</div></td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDay(ev.date_start)}</td>
                  <td style={{ fontSize: 12, color: '#9a9a9a' }}>
                    {ev.class_count ? `${ev.class_count} classes` : 'No results yet'}
                  </td>
                  <td style={{ minWidth: 130 }}>
                    <SearchSelect value={pbVal(ev)} clearable={false} placeholder="Pre-book"
                      options={[{ id: 'show', label: 'Show' }, { id: 'hide', label: 'Hide' }]}
                      onChange={(id) => setPrebook(ev, id)} />
                  </td>
                  <td style={{ minWidth: 170 }}>
                    <SearchSelect value={ev.organizer_id || ''} clearable={false} placeholder="Organizer"
                      options={[{ id: '', label: '— none —' }, ...orgs.map((o) => ({ id: o.id, label: o.name }))]}
                      onChange={(id) => link(ev, id)} />
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="st-btn-ghost" style={{ minHeight: 36 }} onClick={() => showQr(ev)} disabled={qrBusy}
                      title="Venue QR poster for spectator uploads">
                      {ev.upload_code ? 'Show QR' : 'Create QR'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pager total={rows.length} limit={PAGE} offset={safe} onPage={setOffset} />
          <p style={{ color: '#777', fontSize: 12, padding: '0 0 12px' }}>
            Pre-book is opt-in: only events set to Show appear on the pre-book page. Linking gives the organizer this event — no cloning, no name clashes.
          </p>
        </div>
      )}
      {qr && <QrPosterModal qr={qr} onClose={() => setQr(null)} />}
      {confirmUI}
    </>
  );
}

function NewEventForm({ onCreated }) {
  const notify = useNotify();
  const [f, setF] = useState({ name: '', venue: '', region: '', date_start: '', date_end: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || !f.date_start) { notify('Name and start date are required.', true); return; }
    try {
      const j = await studio.post('/admin/events', {
        name: f.name.trim(), venue: f.venue.trim(), region: f.region.trim(),
        date_start: f.date_start, date_end: f.date_end || f.date_start,
      });
      const ev = j.data || j;
      if (!ev?.id) throw new Error('Event created — refresh the list to see it.');
      setF({ name: '', venue: '', region: '', date_start: '', date_end: '' });
      notify(`“${ev.name}” created`);
      onCreated(ev);
    } catch (err) { notify(err.message, true); }
  }
  const input = { minHeight: 44, padding: '0 12px', color: '#fff', background: '#0b0b0b', border: '1px solid #333', outline: 0, fontSize: 13 };
  return (
    <form onSubmit={submit} className="st-card" style={{ marginBottom: 16, display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>New event</p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 1fr auto', gap: 10 }}>
        <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Event name" aria-label="Event name" style={input} />
        <input value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Venue" aria-label="Venue" style={input} />
        <input value={f.region} onChange={(e) => set('region', e.target.value)} placeholder="Region" aria-label="Region" style={input} />
        <input type="date" value={f.date_start} onChange={(e) => set('date_start', e.target.value)} aria-label="Start date" style={{ ...input, colorScheme: 'dark' }} />
        <input type="date" value={f.date_end} onChange={(e) => set('date_end', e.target.value)} aria-label="End date" style={{ ...input, colorScheme: 'dark' }} />
        <button type="submit" className="st-btn" style={{ minHeight: 44, whiteSpace: 'nowrap' }}>Add event</button>
      </div>
    </form>
  );
}
