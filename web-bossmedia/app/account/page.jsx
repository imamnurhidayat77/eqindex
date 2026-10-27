'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { nzd } from '../../lib/figma-data';
import { Icon, SiteFooter, SiteHeader } from '../../components/figma';
import { Pager } from '../../components/studio';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const TABS = [['overview', 'Overview'], ['wallet', 'Wallet'], ['credits', 'Credits'], ['history', 'History'], ['profile', 'Profile']];

export default function AccountPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  // undefined = loading, null/[] = loaded.
  const [wallet, setWallet] = useState(undefined);
  const [credits, setCredits] = useState(undefined);
  const [photos, setPhotos] = useState(undefined);
  const PAGE = 10;
  const [wOff, setWOff] = useState(0);
  const [cOff, setCOff] = useState(0);
  const [hOff, setHOff] = useState(0);
  const clamp = (off, n) => Math.min(off, Math.max(0, (Math.ceil(n / PAGE) - 1) * PAGE));

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setUser(j?.data || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch(`${API}/api/my/wallet`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setWallet(j?.data || null)).catch(() => setWallet(null));
    fetch(`${API}/api/my/credits`, { credentials: 'include' })
      .then((r) => r.json()).then((j) => setCredits(j.data || [])).catch(() => setCredits([]));
    fetch(`${API}/api/my/photos`, { credentials: 'include' })
      .then((r) => r.json()).then((j) => setPhotos(j.data || [])).catch(() => setPhotos([]));
  }, [user]);

  const creditsLeft = (credits || []).reduce((s, b) => s + Number(b.slots_left ?? 0), 0);
  const first = (user?.name || '').split(' ')[0];
  // Show tab badges only when there is something to count — bare "0"s look broken.
  const tabCount = (k) => {
    if (k === 'credits' && Array.isArray(credits) && credits.length) return credits.length;
    if (k === 'history' && Array.isArray(photos) && photos.length) return photos.length;
    return null;
  };

  return (
    <div className="gallery-page">
      <SiteHeader />
      <main>
        <section className="events-section gallery-browser section-gutter" data-page-top>
          <div className="gallery-browser-heading">
            <div>
              <p className="eyebrow">Account</p>
              <h1>My account.</h1>
            </div>
            <p>{user ? `Kia ora, ${first || 'mate'}` : 'Balance, credits, history and profile'}</p>
          </div>

          {loading ? (
            <p className="empty-note">Loading your account…</p>
          ) : !user ? (
            <div className="empty-state">
              <p className="eyebrow">Members only</p>
              <h3>Log in to open your account.</h3>
              <p>Wallet balance, photo credits, purchase history and profile live here.</p>
              <p style={{ marginTop: 26 }}>
                <Link href="/login?next=/account" className="primary-link">Log in <Icon name="arrow" size={16} /></Link>
              </p>
            </div>
          ) : (
            <>
              <div className="media-tabs-dark" role="tablist" aria-label="My account">
                {TABS.map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
                    {label}
                    {tabCount(k) !== null && <span>{tabCount(k)}</span>}
                  </button>
                ))}
              </div>

              {tab === 'overview' && (
                <>
                  <div className="my-stats" aria-label="Account summary">
                    <div><span>Account balance</span><strong>{wallet === undefined ? '…' : wallet ? nzd(wallet.balance_cents) : nzd(0)}</strong></div>
                    <div><span>Credits left</span><strong>{credits === undefined ? '…' : creditsLeft}</strong></div>
                    <div><span>Photos owned</span><strong>{photos === undefined ? '…' : photos.length}</strong></div>
                  </div>
                  <div className="st-card">
                    <h3>Recent activity</h3>
                    <p className="st-csub">Latest wallet movements and purchases.</p>
                    <ActivityPreview wallet={wallet} photos={photos} onGo={setTab} />
                  </div>
                </>
              )}

              {tab === 'wallet' && (
                <div className="st-card">
                  <h3>Wallet</h3>
                  <p className="st-csub">
                    {wallet === undefined ? 'Loading…' : wallet ? `Balance ${nzd(wallet.balance_cents)} — top-ups and spending.` : 'No wallet activity yet — top-ups and spending will show here.'}
                  </p>
                  {wallet !== undefined && !!wallet?.transactions?.length && (
                    <>
                      <table className="st-table">
                        <thead><tr><th>Date</th><th>What</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
                        <tbody>
                          {wallet.transactions.slice(clamp(wOff, wallet.transactions.length), clamp(wOff, wallet.transactions.length) + PAGE).map((t, i) => (
                            <tr key={`${t.created_at}-${i}`}>
                              <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(t.created_at)}</td>
                              <td>{t.reason || t.kind}</td>
                              <td style={{ textAlign: 'right', color: Number(t.amount_cents) < 0 ? '#ddd' : '#8fd694' }}>
                                {Number(t.amount_cents) > 0 ? '+' : ''}{nzd(t.amount_cents)}
                              </td>
                              <td style={{ textAlign: 'right' }}>{nzd(t.balance_after_cents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Pager total={wallet.transactions.length} limit={PAGE} offset={clamp(wOff, wallet.transactions.length)} onPage={setWOff} />
                    </>
                  )}
                </div>
              )}

              {tab === 'credits' && (
                <div className="st-card">
                  <h3>Photo credits</h3>
                  <p className="st-csub">Packs unlock single photos one by one. Re-downloads are free.</p>
                  {credits === undefined ? (
                    <p className="empty-note">Loading…</p>
                  ) : !credits.length ? (
                    <p className="empty-note">No credit packs yet. <Link href="/media" className="text-link">Get credits in your library</Link></p>
                  ) : (
                    <>
                      <table className="st-table">
                        <thead><tr><th>Pack</th><th>Event</th><th style={{ textAlign: 'right' }}>Left</th></tr></thead>
                        <tbody>
                          {credits.slice(clamp(cOff, credits.length), clamp(cOff, credits.length) + PAGE).map((b) => (
                            <tr key={b.id}>
                              <td>{[b.horse, b.rider].filter(Boolean).join(' × ') || 'Bundle'} · {b.slots_total} photos</td>
                              <td>{b.event_name || '—'}</td>
                              <td style={{ textAlign: 'right' }}>{b.slots_left} of {b.slots_total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Pager total={credits.length} limit={PAGE} offset={clamp(cOff, credits.length)} onPage={setCOff} />
                    </>
                  )}
                </div>
              )}

              {tab === 'history' && (
                <div className="st-card">
                  <h3>Purchase history</h3>
                  <p className="st-csub">Every photo you have paid for, newest first.</p>
                  {photos === undefined ? (
                    <p className="empty-note">Loading…</p>
                  ) : !photos.length ? (
                    <p className="empty-note">Nothing bought yet. <Link href="/events" className="text-link">Browse the gallery</Link></p>
                  ) : (
                    <>
                      <table className="st-table">
                        <thead><tr><th>Date</th><th>Photo</th><th>License</th><th style={{ textAlign: 'right' }}>Paid</th><th style={{ textAlign: 'right' }}>Receipt</th></tr></thead>
                        <tbody>
                          {photos.slice(clamp(hOff, photos.length), clamp(hOff, photos.length) + PAGE).map((p) => (
                            <tr key={`${p.purchase_id}-${p.media_id}`}>
                              <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(p.created_at)}</td>
                              <td>{[p.horse, p.rider].filter(Boolean).join(' × ') || p.event_name || 'Photo'}</td>
                              <td>{p.license_tier}</td>
                              <td style={{ textAlign: 'right' }}>{nzd(p.amount_cents)}</td>
                              <td style={{ textAlign: 'right' }}><Link href={`/receipts?purchases=${p.purchase_id}`} className="text-link">View</Link></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Pager total={photos.length} limit={PAGE} offset={clamp(hOff, photos.length)} onPage={setHOff} />
                    </>
                  )}
                  {!!photos?.length && <p style={{ marginTop: 14 }}><Link href="/media" className="text-link">Open full library with downloads</Link></p>}
                </div>
              )}

              {tab === 'profile' && (
                <>
                  <div className="st-card">
                    <h3>Profile</h3>
                    <p className="st-csub">How you appear on receipts and orders.</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '6px 0 4px' }}>
                      <span aria-hidden="true" style={avatarLg}>{(user.name || user.email || '?').trim().charAt(0).toUpperCase()}</span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || '—'}</p>
                        <p style={{ margin: '3px 0 0', color: '#999', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
                      </div>
                      {!!user.role && <span style={rolePill}>{user.role.toLowerCase()}</span>}
                    </div>
                    <p style={{ margin: '14px 0 0', color: '#777', fontSize: 12 }}>
                      Name or email wrong? <Link href="/contact" className="text-link">Contact support</Link> — we update it for you.
                    </p>
                  </div>
                  <div className="st-card" style={{ marginTop: 18 }}>
                    <h3>Security</h3>
                    <p className="st-csub">Password and sessions on this account.</p>
                    <PasswordForm />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid #242424' }}>
                      <Link href="/media" className="st-btn-ghost" style={{ textDecoration: 'none' }}>Open media library</Link>
                      <SignOutButton />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function ActivityPreview({ wallet, photos, onGo }) {
  if (wallet === undefined || photos === undefined) return <p className="empty-note">Loading…</p>;
  const tx = (wallet?.transactions || []).slice(0, 3);
  const buys = (photos || []).slice(0, 3);
  if (!tx.length && !buys.length) {
    return (
      <p className="empty-note">
        Nothing here yet. <Link href="/events" className="text-link">Browse the gallery</Link> to get started.
      </p>
    );
  }
  return (
    <table className="st-table">
      <tbody>
        {tx.map((t, i) => (
          <tr key={`tx-${t.created_at}-${i}`}>
            <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(t.created_at)}</td>
            <td>{t.reason || t.kind}</td>
            <td style={{ textAlign: 'right' }}>
              <button type="button" onClick={() => onGo('wallet')} style={linkBtn}>
                {Number(t.amount_cents) > 0 ? '+' : ''}{nzd(t.amount_cents)}
              </button>
            </td>
          </tr>
        ))}
        {buys.map((p) => (
          <tr key={`buy-${p.purchase_id}-${p.media_id}`}>
            <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(p.created_at)}</td>
            <td>{[p.horse, p.rider].filter(Boolean).join(' × ') || p.event_name || 'Photo'} · {p.license_tier}</td>
            <td style={{ textAlign: 'right' }}>
              <button type="button" onClick={() => onGo('history')} style={linkBtn}>{nzd(p.amount_cents)}</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const linkBtn = { background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' };

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(''); setMsg('');
    if (!current) { setErr('Enter your current password.'); return; }
    if (next.length < 8) { setErr('New password needs at least 8 characters.'); return; }
    if (next !== confirm) { setErr('New passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/password`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not change password — try again.');
      setCurrent(''); setNext(''); setConfirm('');
      setMsg(j.relogin ? 'Password changed — please sign in again.' : 'Password changed.');
      if (j.relogin) setTimeout(() => { window.location.href = '/login?next=/account'; }, 1200);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 22, maxWidth: 420 }}>
      <p style={{ color: '#999', fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>Change password</p>
      {err && <p className="auth-error" role="alert">{err}</p>}
      {msg && <p style={{ color: '#8fd694', fontSize: 13 }}>{msg}</p>}
      <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Current password</span>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} style={field} />
      </label>
      <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>New password (8+ chars)</span>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} style={field} />
      </label>
      <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Confirm new password</span>
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={field} />
      </label>
      <button className="st-btn" disabled={busy} onClick={submit} style={{ minHeight: 44 }}>
        {busy ? 'Saving…' : 'Save new password'}
      </button>
    </div>
  );
}

const field = { minHeight: 46, padding: '0 12px', color: '#fff', background: '#0b0b0b', border: '1px solid #333', outline: 0, fontSize: 13 };

const avatarLg = { width: 56, height: 56, borderRadius: '50%', background: '#fff', color: '#101010', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700, flex: 'none' };
const rolePill = { marginLeft: 'auto', flex: 'none', fontSize: 11, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '.06em', color: '#bbb', border: '1px solid #444', borderRadius: 999, padding: '6px 12px' };

function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const out = async () => {
    if (busy) return;
    setBusy(true);
    try { await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }); } catch {}
    window.location.href = '/';
  };
  return (
    <button type="button" className="st-btn-ghost st-btn-danger" disabled={busy} onClick={out}>
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
