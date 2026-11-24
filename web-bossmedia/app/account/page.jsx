'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API, bustCache, cachedJson } from '../../lib/api';
import { fmtDay } from '../../lib/format';
import { nzd } from '../../lib/figma-data';
import { safeError } from '../../lib/errors';
import { Icon, SiteFooter, SiteHeader } from '../../components/figma';
import { Pager } from '../../components/studio';
import SmartImage from '../../components/SmartImage';
import { resetMe, useAuthed } from '../../lib/use-authed';
import { useDocumentTitle } from '../../lib/use-document-title';

const TABS = [['overview', 'Overview'], ['wallet', 'Wallet'], ['credits', 'Credits'], ['history', 'History'], ['posts', 'Posts'], ['profile', 'Profile']];

export default function AccountPage() {
  useDocumentTitle('My account');
  const { user, loading } = useAuthed();
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
    if (!user) return;
    cachedJson('/api/my/wallet').then((j) => setWallet(j?.data || null)).catch(() => setWallet(null));
    cachedJson('/api/my/credits').then((j) => setCredits(j?.data || [])).catch(() => setCredits([]));
    cachedJson('/api/my/photos').then((j) => setPhotos(j?.data || [])).catch(() => setPhotos([]));
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
              <h3>Sign in to open your account.</h3>
              <p>Wallet balance, photo credits, purchase history and profile live here.</p>
              <p style={{ marginTop: 26 }}>
                <Link href="/login?next=/account" className="primary-link">Sign in <Icon name="arrow" size={16} /></Link>
              </p>
            </div>
          ) : (
            <>
              {user.email_verified === false && <VerifyEmailBanner email={user.email} />}
              <div className="media-tabs-dark" role="group" aria-label="My account">
                {TABS.map(([k, label]) => (
                  <button key={k} aria-pressed={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
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
                      <div className="table-scroll"><table className="st-table">
                        <thead><tr><th scope="col">Date</th><th scope="col">What</th><th scope="col" style={{ textAlign: 'right' }}>Amount</th><th scope="col" style={{ textAlign: 'right' }}>Balance</th></tr></thead>
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
                      </table></div>
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
                      <div className="table-scroll"><table className="st-table">
                        <thead><tr><th scope="col">Pack</th><th scope="col">Event</th><th scope="col" style={{ textAlign: 'right' }}>Left</th></tr></thead>
                        <tbody>
                          {credits.slice(clamp(cOff, credits.length), clamp(cOff, credits.length) + PAGE).map((b) => (
                            <tr key={b.id}>
                              <td>{[b.horse, b.rider].filter(Boolean).join(' × ') || 'Bundle'} · {b.slots_total} photos</td>
                              <td>{b.event_name || '—'}</td>
                              <td style={{ textAlign: 'right' }}>{b.slots_left} of {b.slots_total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
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
                      <div className="table-scroll"><table className="st-table">
                        <thead><tr><th scope="col">Date</th><th scope="col">Photo</th><th scope="col">License</th><th scope="col" style={{ textAlign: 'right' }}>Paid</th><th scope="col" style={{ textAlign: 'right' }}>Receipt</th></tr></thead>
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
                      </table></div>
                      <Pager total={photos.length} limit={PAGE} offset={clamp(hOff, photos.length)} onPage={setHOff} />
                    </>
                  )}
                  {!!photos?.length && <p style={{ marginTop: 14 }}><Link href="/media" className="text-link">Open full library with downloads</Link></p>}
                </div>
              )}

              {tab === 'posts' && <PostsPanel />}

              {tab === 'profile' && (
                <>
                  <div className="st-card">
                    <h3>Profile</h3>
                    <p className="st-csub">How you appear on receipts and orders.</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '6px 0 4px' }}>
                      <span aria-hidden="true" style={avatarLg}>{(user.name || user.email || '?').trim().charAt(0).toUpperCase()}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <NameEditor initial={user.name || ''} />
                        <p style={{ margin: '3px 0 0', color: '#999', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
                      </div>
                      {!!user.role && <span style={rolePill}>{user.role.toLowerCase()}</span>}
                    </div>
                    <p style={{ margin: '14px 0 0', color: '#777', fontSize: 12 }}>
                      Need to change your email? <Link href="/contact" className="text-link">Contact support</Link>, we confirm the new address for you.
                    </p>
                  </div>
                  <div className="st-card" style={{ marginTop: 18 }}>
                    <h3>Social accounts</h3>
                    <p className="st-csub">Connect your own Instagram Business/Creator or Facebook Page to post and track insights. Personal accounts are not supported by Meta.</p>
                    <SocialAccounts />
                  </div>
                  <div className="st-card" style={{ marginTop: 18 }}>
                    <h3>Security</h3>
                    <p className="st-csub">Password and sessions on this account.</p>
                    <PasswordForm />
                    <MfaPanel role={user.role} />
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

function SocialAccounts() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected')) setNotice('Connected — pick it below when posting.');
    else if (q.get('connect_error') === 'noig') setNotice('No Instagram Business/Creator found on your Pages — switch the IG account to Professional and link it to a Page first.');
    else if (q.get('connect_error') === 'nopage') setNotice('No Facebook Page found on this login — create or ask for access to a Page first.');
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const load = () => {
    fetch(`${API}/api/my/social/accounts`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRows(j?.data || []))
      .catch(() => setRows([]));
  };
  useEffect(() => { load(); }, []);
  const connect = async (provider) => {
    setErr(''); setBusy(provider);
    try {
      const r = await fetch(`${API}/api/my/social/connect?provider=${provider}`, { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not start connect — try again.');
      window.location.href = j.data.url;
    } catch (e) { setErr(e.message); setBusy(''); }
  };
  const disconnect = async (a) => {
    setErr(''); setBusy(a.id);
    try {
      const r = await fetch(`${API}/api/my/social/disconnect`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: a.provider, remote_id: a.remote_id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not disconnect — try again.');
      bustCache(); load();
    } catch (e) { setErr(e.message); }
    setBusy('');
  };
  if (rows === null) return <p className="empty-note">Loading…</p>;
  return (
    <div style={{ maxWidth: 560 }}>
      {err && <p className="auth-error" role="alert">{safeError(err)}</p>}
      {notice && <p style={{ color: '#8fd694', fontSize: 13 }}>{notice}</p>}
      {!rows.length ? (
        <p className="empty-note">Not connected yet — connect to post from BossMedia and see insights per photo.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {rows.map((a) => (
            <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 12px' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{a.provider === 'ig' ? 'Instagram' : 'Facebook Page'}</span>
              <span style={{ color: '#999', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name || a.remote_id}</span>
              <button type="button" className="st-btn-ghost st-btn-danger" disabled={busy === a.id} onClick={() => disconnect(a)} style={{ marginLeft: 'auto' }}>
                {busy === a.id ? 'Removing…' : 'Disconnect'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
        <button type="button" className="st-btn" disabled={busy === 'ig'} onClick={() => connect('ig')}>
          {busy === 'ig' ? 'Opening…' : 'Connect Instagram'}
        </button>
        <button type="button" className="st-btn-ghost" disabled={busy === 'fb_page'} onClick={() => connect('fb_page')}>
          {busy === 'fb_page' ? 'Opening…' : 'Connect Facebook Page'}
        </button>
      </div>
    </div>
  );
}

// Engagement = every counted interaction; ER divides it by the audience that
// saw the post (reach, else views). Shown as a title tooltip on the column.
const engOf = (p) => (Number(p.likes) || 0) + (Number(p.comments) || 0)
  + (Number(p.shares) || 0) + (Number(p.saved) || 0);
const reachOf = (p) => p.reach ?? p.views ?? null;
const erOf = (p) => {
  const d = reachOf(p);
  if (d === null || d <= 0) return null;
  return (engOf(p) / d) * 100;
};

function Spark({ points, width = 72, height = 26 }) {
  const vals = (points || []).map((v) => Number(v) || 0);
  // A trend needs at least 2 days — one dot says nothing, so show a dash.
  if (vals.length < 2) return <span style={{ color: '#555' }} title="Trend needs at least 2 days of data">—</span>;
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const step = vals.length > 1 ? (width - 8) / (vals.length - 1) : 0;
  const pts = vals.map((v, i) => `${(4 + i * step).toFixed(1)},${(height - 4 - ((v - min) / span) * (height - 8)).toFixed(1)}`).join(' ');
  const last = vals.length - 1;
  const lx = 4 + last * step, ly = height - 4 - ((vals[last] - min) / span) * (height - 8);
  return (
    <svg width={width} height={height} role="img" aria-label={`trend: ${vals.join(', ')}`}>
      <polyline points={pts} fill="none" stroke="#8fd694" strokeWidth="1.5" />
      <circle cx={lx} cy={ly} r="2.5" fill="#8fd694" />
    </svg>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso.slice(5) : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

function TrendChart({ days }) {
  const W = 560, H = 150, PAD = 30;
  const max = Math.max(1, ...days.map((d) => d.value));
  const x = (i) => days.length > 1 ? PAD + (i * (W - PAD - 12)) / (days.length - 1) : W / 2;
  const y = (v) => 12 + (H - 34) * (1 - v / max);
  const line = days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(days.length - 1).toFixed(1)},${(H - 22).toFixed(1)} L${x(0).toFixed(1)},${(H - 22).toFixed(1)} Z`;
  const idx = [0, Math.floor((days.length - 1) / 2), days.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img"
      aria-label={`total engagement per day, max ${max}`}>
      {[0.33, 0.66, 1].map((f) => (
        <g key={f}>
          <line x1={PAD} x2={W - 12} y1={y(max * f)} y2={y(max * f)} stroke="#242424" strokeWidth="1" />
          <text x={PAD - 6} y={y(max * f) + 3} textAnchor="end" fontSize="10" fill="#777">{Math.round(max * f)}</text>
        </g>
      ))}
      <path d={area} fill="rgba(143,214,148,.14)" />
      <path d={line} fill="none" stroke="#8fd694" strokeWidth="2" />
      {days.map((d, i) => (
        <circle key={d.day} cx={x(i)} cy={y(d.value)} r="3" fill="#8fd694" />
      ))}
      {idx.map((i) => (
        <text key={days[i].day} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#777">{shortDay(days[i].day)}</text>
      ))}
    </svg>
  );
}

function PostsPanel() {
  const [rows, setRows] = useState(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState('');
  const [syncedAt, setSyncedAt] = useState(null);
  const [sponsor, setSponsor] = useState('');
  const load = () => {
    fetch(`${API}/api/my/social/posts?limit=20`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRows(j?.data || []))
      .catch(() => setRows([]));
  };
  useEffect(load, []);
  const refresh = async () => {
    setRefreshing(true); setRefreshErr('');
    try {
      const r = await fetch(`${API}/api/my/social/insights/refresh`, {
        method: 'POST', credentials: 'include',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Refresh failed — try again.');
      setSyncedAt(new Date());
      load();
    } catch (e) { setRefreshErr(e.message); }
    setRefreshing(false);
  };
  if (rows === undefined) return <p className="empty-note">Loading…</p>;
  if (!rows.length) {
    return (
      <div className="st-card">
        <h3>Post analytics</h3>
        <p className="st-csub">Which of your photos performs best — likes, comments, reach and trend per post.</p>
        <div className="my-stats" aria-label="No posts yet">
          <div><span>Posts</span><strong>0</strong></div>
          <div><span>Likes</span><strong>0</strong></div>
          <div><span>Comments</span><strong>0</strong></div>
        </div>
        <p className="empty-note">Nothing posted yet. <Link href="/media" className="text-link">Post a photo from your library</Link> and its numbers will land here.</p>
      </div>
    );
  }
  const enriched = rows.map((p) => ({ ...p, eng: engOf(p), er: erOf(p) }));
  const allSponsors = (() => {
    const seen = new Map();
    for (const p of enriched) for (const s of p.sponsors || []) {
      if (!seen.has(String(s.id))) seen.set(String(s.id), s.name);
    }
    return [...seen].map(([id, name]) => ({ id, label: name }));
  })();
  const visible = sponsor
    ? enriched.filter((p) => (p.sponsors || []).some((s) => String(s.id) === sponsor))
    : enriched;
  const topId = visible.length > 1
    ? visible.filter((p) => p.er !== null).sort((a, b) => b.er - a.er)[0]?.id ?? null
    : null;
  const totals = {
    likes: enriched.reduce((s, p) => s + (Number(p.likes) || 0), 0),
    comments: enriched.reduce((s, p) => s + (Number(p.comments) || 0), 0),
  };
  const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
  // Last-14-day daily totals across posts. A chart with fewer than 3 days of
  // movement says nothing — the table sparklines carry sparse histories.
  const dayMap = {};
  for (const p of enriched) {
    for (const s of p.series || []) {
      const v = (Number(s.likes) || 0) + (Number(s.comments) || 0) + (Number(s.shares) || 0);
      dayMap[s.day] = (dayMap[s.day] || 0) + v;
    }
  }
  const trendDays = (() => {
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      out.push({ day: d, value: dayMap[d] || 0 });
    }
    return out;
  })();
  const showChart = trendDays.filter((d) => d.value > 0).length >= 3;
  return (
    <>
      <div className="st-card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Post analytics</h3>
            <p className="st-csub">
              {plural(enriched.length, 'post')} · {plural(totals.likes, 'like')} · {plural(totals.comments, 'comment')} in the last 14 days.
              {syncedAt ? ` Updated ${syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : ' Syncs nightly.'}
            </p>
          </div>
          <button type="button" className="st-btn-ghost" disabled={refreshing} onClick={refresh}
            style={{ marginLeft: 'auto', minHeight: 40 }}>
            {refreshing ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
        {refreshErr && <p className="auth-error" role="alert">{safeError(refreshErr)}</p>}
        <div className="my-stats" aria-label="Totals">
          <div><span>Posts</span><strong>{enriched.length}</strong></div>
          <div><span>Likes</span><strong>{totals.likes}</strong></div>
          <div><span>Comments</span><strong>{totals.comments}</strong></div>
        </div>
        {showChart && (
          <>
            <h4 style={{ margin: '18px 0 8px', fontSize: 13, color: '#999' }}>Engagement · last 14 days</h4>
            <TrendChart days={trendDays} />
          </>
        )}
      </div>
      <div className="st-card" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Per-post performance</h3>
            <p className="st-csub" title="Engagement rate = (likes + comments + shares + saves) / reach (or views) × 100">
              Ranked by engagement rate. Hover the rate for the formula.
            </p>
          </div>
          {allSponsors.length > 0 && (
            <label className="filter" style={{
              marginLeft: 'auto', minWidth: 210, border: '1px solid #333', borderRadius: 10,
              padding: '8px 12px', display: 'grid', gap: 2, cursor: 'pointer',
            }}>
              <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '.08em' }}>Sponsor</span>
              <select value={sponsor} onChange={(e) => setSponsor(e.target.value)}
                aria-label="Filter by sponsor"
                style={{ background: 'none', border: 0, padding: 0, color: '#fff', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
                <option value="">All sponsors</option>
                {allSponsors.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          )}
        </div>
        {!visible.length && (
          <p className="empty-note">No posts with this sponsor yet — clear the filter to see all posts.</p>
        )}
        <div className="table-scroll"><table className="st-table">
          <thead><tr><th scope="col">Photo</th><th scope="col">Posted</th><th scope="col">Where</th>
            <th scope="col" style={{ textAlign: 'right' }}>Likes</th>
            <th scope="col" style={{ textAlign: 'right' }}>Comments</th>
            <th scope="col" style={{ textAlign: 'right' }}>Eng.</th>
            <th scope="col" style={{ textAlign: 'right' }} title="Engagement rate = (likes + comments + shares + saves) / reach (or views) × 100">ER</th>
            <th scope="col" style={{ textAlign: 'right' }} title="Daily engagement, last 14 days — needs 2+ days to draw">Trend</th></tr></thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {p.thumb_url
                      ? <span style={{ flex: 'none', width: 64, height: 48, borderRadius: 6, overflow: 'hidden', position: 'relative', display: 'block', background: '#000' }}>
                        <SmartImage src={p.thumb_url} alt={[p.horse, p.rider].filter(Boolean).join(' × ') || p.event_name || 'Sponsored photo'} width={128} height={96} sizes="64px"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </span>
                      : null}
                    <span>
                      <strong>{[p.horse, p.rider].filter(Boolean).join(' × ') || p.event_name || 'Photo'}</strong>
                      {p.id === topId && <span className="my-pill my-pill-live" style={{ marginLeft: 8 }}>Top</span>}
                      <br /><small style={{ color: '#777' }}>{p.event_name || ''}</small>
                      {(p.sponsors || []).length > 0 && (
                        <><br /><small style={{ color: '#999' }}>Sponsored by {(p.sponsors || []).map((s) => s.name).join(', ')}</small></>
                      )}
                    </span>
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(p.posted_at)}</td>
                <td>{p.post_url
                  ? <a className="text-link" href={p.post_url} target="_blank" rel="noreferrer">{p.provider === 'ig' ? 'Instagram' : 'Facebook'}</a>
                  : (p.provider === 'ig' ? 'Instagram' : 'Facebook')}</td>
                <td style={{ textAlign: 'right' }}>{p.likes ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{p.comments ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{p.eng}</td>
                <td style={{ textAlign: 'right' }} title="Engagement rate = (likes + comments + shares + saves) / reach (or views) × 100">
                  {p.er === null ? '—' : `${p.er.toFixed(1)}%`}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Spark points={(p.series || []).map((s) =>
                    (Number(s.likes) || 0) + (Number(s.comments) || 0) + (Number(s.shares) || 0))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
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
    <div className="table-scroll"><table className="st-table">
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
    </table></div>
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
      {err && <p className="auth-error" role="alert">{safeError(err)}</p>}
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

const MFA_ROLES = ['ADMIN', 'PHOTOGRAPHER', 'ORGANIZER'];

function MfaPanel({ role }) {
  const [st, setSt] = useState(null); // null=loading {enabled, eligible}
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => {
    fetch(`${API}/auth/mfa/status`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setSt(j?.data || { enabled: false, eligible: false }))
      .catch(() => setSt({ enabled: false, eligible: false }));
  };
  useEffect(() => { load(); }, []);
  if (!MFA_ROLES.includes(role)) return null;
  const call = async (path, body) => {
    const r = await fetch(`${API}${path}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'That didn’t work — try again.');
    return j.data;
  };
  const start = async () => {
    setErr(''); setMsg(''); setBusy(true);
    try { const d = await call('/auth/mfa/setup'); setSecret(d.secret); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const verify = async () => {
    setErr(''); setMsg('');
    if (!/^\d{6}$/.test(code.trim())) { setErr('Enter the 6-digit code from your authenticator app.'); return; }
    setBusy(true);
    try { await call('/auth/mfa/verify', { token: code.trim() }); setSecret(''); setCode(''); setMsg('Two-factor is on — it applies from your next sign-in.'); load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const disable = async () => {
    setErr(''); setMsg('');
    if (!password) { setErr('Enter your password to turn it off.'); return; }
    setBusy(true);
    try { await call('/auth/mfa/disable', { password }); setPassword(''); setMsg('Two-factor is off.'); load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid #242424', maxWidth: 420 }}>
      <p style={{ color: '#999', fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>Two-factor authentication</p>
      {st === null ? <p style={{ color: '#777', fontSize: 13 }}>Loading…</p>
      : !st.enabled && !secret ? (
        <>
          <p style={{ color: '#777', fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>Authenticator-app codes at sign-in. Recommended for money handlers.</p>
          <button className="st-btn-ghost" disabled={busy} onClick={start}>Set up authenticator app</button>
        </>
      ) : !st.enabled ? (
        <>
          <p style={{ color: '#777', fontSize: 13, margin: '0 0 10px', lineHeight: 1.6 }}>Add this key to your authenticator app, then enter a code to finish:</p>
          <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '.06em', wordBreak: 'break-all', margin: '0 0 12px' }}>{secret}</p>
          <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>6-digit code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} style={field} />
          </label>
          <button className="st-btn" disabled={busy} onClick={verify} style={{ minHeight: 44 }}>{busy ? 'Checking…' : 'Verify and turn on'}</button>
        </>
      ) : (
        <>
          <p style={{ color: '#8fd694', fontSize: 13, margin: '0 0 12px' }}>On — codes required at sign-in.</p>
          <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Current password (to turn off)</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={field} />
          </label>
          <button className="st-btn-ghost st-btn-danger" disabled={busy} onClick={disable}>Turn off two-factor</button>
        </>
      )}
      {err && <p className="auth-error" role="alert">{err}</p>}
      {msg && <p style={{ color: '#8fd694', fontSize: 13 }}>{msg}</p>}
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

function VerifyEmailBanner({ email }) {
  const [state, setState] = useState('idle');
  async function resend() {
    setState('sending');
    try {
      const r = await fetch(`${API}/auth/verify-email/resend`, { method: 'POST', credentials: 'include' });
      setState(r.ok ? 'sent' : 'error');
    } catch { setState('error'); }
  }
  return (
    <div className="st-card" role="status" style={{ marginBottom: 18, borderColor: '#5a4a1f' }}>
      <h3>Confirm your email</h3>
      <p className="st-csub">Confirm {email} with a one-click link. Until then, purchases made with this email while signed out stay off your account.</p>
      {state === 'sent' ? <p style={{ margin: 0, color: '#8fd694', fontSize: 13 }}>Sent. Check your inbox.</p> : (
        <button type="button" className="st-btn" disabled={state === 'sending'} onClick={resend}>
          {state === 'sending' ? 'Sending…' : 'Send me the link'}
        </button>
      )}
      {state === 'error' && <p role="alert" style={{ margin: '10px 0 0', color: '#ff9d9d', fontSize: 12 }}>Could not send right now. Try again in a minute.</p>}
    </div>
  );
}

function NameEditor({ initial }) {
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dirty = name.trim() !== saved;
  async function save(e) {
    e.preventDefault();
    if (!dirty || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API}/api/my/profile`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not save — try again.');
      setSaved(j.data.name); setName(j.data.name);
      resetMe(undefined);
    } catch (e2) { setErr(safeError(e2.message)); }
    setBusy(false);
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <label htmlFor="acct-name" className="sr-only">Display name</label>
      <input id="acct-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoComplete="name"
        style={{ flex: '1 1 160px', minWidth: 0, minHeight: 40, padding: '0 10px', color: '#fff', background: '#0b0b0b', border: '1px solid #333', fontSize: 16, fontWeight: 700 }} />
      {dirty && <button type="submit" className="st-btn" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>}
      {err && <p role="alert" style={{ flexBasis: '100%', margin: 0, color: '#ff9d9d', fontSize: 12 }}>{err}</p>}
    </form>
  );
}
