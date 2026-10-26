'use client';
import { useEffect, useState } from 'react';
import StudioShell, { Pager, useDialog, useToast } from '../../../components/studio';
import SearchSelect from '../../../components/SearchSelect';
import { dayOf, nzdc, studio, useStudioUser } from '../../../lib/studio';

const SECTIONS = [['commission', 'Commission'], ['users', 'Users'], ['applications', 'Applications'], ['events', 'Events']];
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
      <div className="st-filters" role="tablist" aria-label="Admin sections">
        {SECTIONS.map(([key, label]) => (
          <button key={key} className="st-btn-ghost" style={section === key ? { borderColor: '#fff' } : undefined}
            onClick={() => setSection(key)}>{label}</button>
        ))}
      </div>
      {section === 'commission' && <Commission />}
      {section === 'users' && <Users selfId={user.id} />}
      {section === 'applications' && <Applications />}
      {section === 'events' && <Events />}
    </>
  );
}

/* ---------- commission: platform/organizer rates + package price + settlement ---------- */
function Commission() {
  const notify = useToast();
  const dialog = useDialog();
  const [form, setForm] = useState(null); // {platform, organizer, packagePrice} as text
  const [settle, setSettle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settleOffset, setSettleOffset] = useState(0);
  const SETTLE_PAGE = 10;
  const settleSafe = Math.min(settleOffset, Math.max(0, (Math.ceil(((settle || []).length) / SETTLE_PAGE) - 1) * SETTLE_PAGE));

  const load = () => {
    studio.get('/admin/settings').then((s) => setForm({
      platform: s.platform_commission_rate === '' ? '' : String(Number(s.platform_commission_rate) * 100),
      organizer: s.organizer_share_rate === '' ? '' : String(Number(s.organizer_share_rate) * 100),
      packagePrice: s.event_package_price_cents === '' ? '' : String(Number(s.event_package_price_cents) / 100),
    })).catch((e) => notify(e.message, true));
    studio.get('/admin/sales/summary').then((d) => setSettle(d.settlement || [])).catch(() => {});
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          <div className="st-form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
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
        <table className="st-table">
          <thead><tr><th>Photographer</th><th>Sales</th><th>Gross</th><th>Platform fee</th><th>Payout</th></tr></thead>
          <tbody>
            {(settle || []).slice(settleSafe, settleSafe + SETTLE_PAGE).map((s) => (
              <tr key={s.photographer_id}>
                <td>{s.photographer}</td>
                <td>{s.sales}</td>
                <td>{nzdc(s.gross_cents)}</td>
                <td>{nzdc(s.fee_cents)}</td>
                <td>{nzdc(s.payout_cents)}</td>
              </tr>
            ))}
          </tbody>
          </table>
          {settle && !settle.length && <p className="empty-note">No paid sales yet.</p>}
          <Pager total={(settle || []).length} limit={SETTLE_PAGE} offset={settleSafe} onPage={setSettleOffset} />
        </div>
    </>
  );
}

/* ---------- users: search, role change, session revoke ---------- */
function Users({ selfId }) {
  const notify = useToast();
  const dialog = useDialog();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);

  const search = (term = q) => {
    studio.get(`/admin/users${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ''}`)
      .then(setRows).catch((e) => notify(e.message, true));
  };
  useEffect(() => { search(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <form className="st-form" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); search(); }}>
        <label><span>Search name or email</span>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" autoComplete="off" /></label>
      </form>
      {rows === null ? <p className="empty-note">Loading…</p> : !rows.length ? (
        <p className="empty-note">No users found.</p>
      ) : (
        <UserTable rows={rows} selfId={selfId} setRole={setRole} revoke={revoke} />
      )}
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
          <div className="st-filters" role="tablist" aria-label="Filter by role" style={{ margin: '14px 0 4px' }}>
            {ROLE_FILTERS.map(([v, label]) => {
              const n = v ? rows.filter((u) => u.role === v).length : rows.length;
              return (
                <button key={v} role="tab" aria-selected={roleFilter === v} className="st-btn-ghost"
                  style={{ minHeight: 34, ...(roleFilter === v ? { borderColor: '#fff' } : undefined })}
                  onClick={() => { setRoleFilter(v); setOffset(0); }}>
                  {label}{n > 0 ? ` (${n})` : ''}
                </button>
              );
            })}
          </div>
          <table className="st-table">
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
                  <td>{dayOf(u.created_at)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="st-btn-ghost" style={{ minHeight: 36 }} disabled={u.id === selfId || !u.active_sessions}
                      onClick={() => revoke(u)}>Sign out</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
const APP_LABELS = ['portfolio', 'region', 'social', 'gear', 'events covered', 'organization', 'events', 'contact'];
function parseApplication(message) {
  const fields = [];
  let cur = null;
  for (const raw of String(message || '').split('\n')) {
    const line = raw.trim();
    // Header line ("…application from Name <email>") repeats the modal
    // header — skip it so it doesn't render as a redundant Notes row.
    if (!line || /^(photographer|organizer) application from/i.test(line)) continue;
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

function AppDetail({ c }) {
  const kindLabel = c.entity_type === 'organizer' ? 'Organizer application'
    : c.entity_type === 'other' ? 'Photographer application' : 'Correction report';
  const fields = c.entity_type === 'other' || c.entity_type === 'organizer'
    ? parseApplication(c.message) : [{ label: '', value: c.message }];
  return (
    <>
            <p className="eyebrow">{kindLabel} · {dayOf(c.created_at)}</p>
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
  const notify = useToast();
  const dialog = useDialog();
  const [status, setStatus] = useState('open');
  const [rows, setRows] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [offset, setOffset] = useState(0);
  const PAGE = 10;

  const load = (s = status) => {
    setOffset(0);
    studio.get(`/admin/corrections?status=${s}`).then(setRows).catch((e) => notify(e.message, true));
  };
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const isOrg = c.entity_type === 'organizer';
    if (!await dialog.confirm({
      title: `Approve ${c.name || c.email} as ${isOrg ? 'organizer' : 'photographer'}?`,
      message: isOrg
        ? 'Creates an organizer profile: event dashboard, revenue share, volunteer grants.'
        : 'Creates a photographer profile and grants upload access.',
    })) return;
    try {
      const path = isOrg ? '/admin/organizers/approve' : '/admin/photographers/approve';
      const r = await studio.post(path, { correction_id: c.id });
      setRows((xs) => (xs || []).filter((x) => x.id !== c.id));
      setViewing(null);
      // studio.post returns the raw body ({ data }) — unlike studio.get.
      const approved = (r.data || r).user || {};
      notify(`Approved — ${approved.email || c.email} is now a${isOrg ? 'n organizer' : ' photographer'}`);
    } catch (e) { notify(e.message, true); }
  }

  return (
    <>
      <div className="st-filters" role="tablist" aria-label="Application status">
        {['open', 'in_review'].map((s) => (
          <button key={s} className="st-btn-ghost" style={status === s ? { borderColor: '#fff' } : undefined}
            onClick={() => setStatus(s)}>{s === 'open' ? 'Open' : 'In review'}</button>
        ))}
      </div>
      {rows === null ? <p className="empty-note">Loading…</p> : !rows.length ? (
        <p className="empty-note">Nothing here.</p>
      ) : (
        <div className="st-card" style={{ padding: '6px 22px' }}>
          <table className="st-table">
            <thead><tr><th>Applicant</th><th>Subject</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {rows.slice(safe, safe + PAGE).map((c) => (
                <tr key={c.id}>
                  <td><div style={{ fontWeight: 600 }}>{c.name || '—'}</div>
                    <div style={{ color: '#777', fontSize: 11 }}>{c.email}</div></td>
                  <td style={{ fontSize: 13 }}>{c.subject || '—'}</td>
                  <td>{dayOf(c.created_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="st-btn-ghost" style={{ minHeight: 36 }} onClick={() => setViewing(c)}>Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                {(viewing.entity_type === 'other' || viewing.entity_type === 'organizer') && status === 'open' && (
                  <button className="st-btn" onClick={() => approve(viewing)}>Approve</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- events: link results events to organizers (claim) ---------- */
function Events() {
  const notify = useToast();
  const dialog = useDialog();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [orgs, setOrgs] = useState([]);

  const search = (term = q) => {
    studio.get(`/admin/events${term.trim() ? `?q=${encodeURIComponent(term.trim())}` : ''}`)
      .then(setRows).catch((e) => notify(e.message, true));
  };
  useEffect(() => {
    search('');
    studio.get('/admin/organizers').then(setOrgs).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function link(ev, organizerId) {
    const org = orgs.find((o) => o.id === organizerId);
    const verb = organizerId ? `Link “${ev.name}” to ${org?.name || 'organizer'}?` : `Unlink “${ev.name}” from its organizer?`;
    if (!await dialog.confirm({
      title: verb,
      message: organizerId ? 'Their dashboard, revenue share and pre-book listing follow this event.' : undefined,
    })) return;
    try {
      const updated = await studio.patch(`/admin/events/${ev.id}/organizer`, { organizer_id: organizerId || null });
      setRows((xs) => (xs || []).map((x) => (x.id === ev.id
        ? { ...x, organizer_id: updated.organizer_id, organizer_name: org?.name || null } : x)));
      notify(organizerId ? 'Event linked' : 'Event unlinked');
    } catch (e) { notify(e.message, true); }
  }

  return (
    <>
      <form className="st-form" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); search(); }}>
        <label><span>Search events</span>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type event name…" autoComplete="off" /></label>
      </form>
      {rows === null ? <p className="empty-note">Loading…</p> : !rows.length ? (
        <p className="empty-note">No events found.</p>
      ) : (
        <div className="st-card" style={{ padding: '6px 22px' }}>
          <table className="st-table">
            <thead><tr><th>Event</th><th>Date</th><th>Data</th><th>Organizer</th></tr></thead>
            <tbody>
              {rows.map((ev) => (
                <tr key={ev.id}>
                  <td><div style={{ fontWeight: 600 }}>{ev.name}</div>
                    <div style={{ color: '#777', fontSize: 11 }}>{[ev.venue, ev.region].filter(Boolean).join(' · ')}</div></td>
                  <td style={{ fontSize: 12 }}>{(ev.date_start || '').slice(0, 10)}</td>
                  <td style={{ fontSize: 12, color: '#888' }}>
                    {ev.class_count ? `${ev.class_count} classes` : 'no results'}
                  </td>
                  <td>
                    <select value={ev.organizer_id || ''} onChange={(e) => link(ev, e.target.value)}
                      aria-label={`Organizer for ${ev.name}`} style={{ background: '#0b0b0b', border: '1px solid #333', color: '#fff', fontSize: 12, padding: '8px', maxWidth: 220 }}>
                      <option value="">— none —</option>
                      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: '#777', fontSize: 12, padding: '0 0 12px' }}>
            Linking gives the organizer this event — no cloning, no name clashes.
          </p>
        </div>
      )}
    </>
  );
}
