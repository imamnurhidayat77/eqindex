'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { API, bustCache, cachedJson } from '../../lib/api';
import { safeError } from '../../lib/errors';
import { Icon, SiteFooter, SiteHeader } from '../../components/figma';
import { useConfirm } from '../../components/ConfirmModal';
import SmartImage from '../../components/SmartImage';
import { useAuthed } from '../../lib/use-authed';
import { useDocumentTitle } from '../../lib/use-document-title';

const nzd = (c) => `NZ$${(Number(c || 0) / 100).toFixed(2)}`;
const dollarsToCents = (v) => Math.round(Number(v) * 100);

// A logo whose file is missing (bad key, storage hiccup) hides itself
// instead of showing a broken row.
function LogoRow({ logo: l, fresh, onRemove }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <li className="st-tagrow">
      <span className="st-tagthumb">
        {/* unoptimized: the file endpoint needs the session cookie, which
            the Next optimizer never sends — the browser does. */}
        <SmartImage src={`${API}/sponsor/logos/${l.id}/file`} alt={l.label} fill sizes="64px"
          unoptimized onError={() => setBroken(true)} />
      </span>
      <div className="st-tagmeta">
        <strong>{l.label}</strong>
        <small>
          <span className="st-chip">PNG/JPEG</span>
          {(Number(l.bytes) / 1024).toFixed(0)} KB · Live in checkouts
          {fresh && <span className="st-chip white">New</span>}
        </small>
      </div>
      <button type="button" className="st-btn-ghost" onClick={() => onRemove(l)}
        aria-label={`Remove ${l.label}`}>Remove</button>
    </li>
  );
}

function LogoDrop({ file, setFile }) {
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className={`st-drop${drag ? ' over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer?.files?.length) setFile(e.dataTransfer.files[0]); }}
      role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}>
      <strong>{drag ? 'Drop it — we’ve got you' : 'Drag your logo here, or click to browse'}</strong>
      <small>PNG or JPEG · max 2MB · transparent PNG looks best on photos</small>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg" hidden
        onChange={(e) => { if (e.target.files?.length) setFile(e.target.files[0]); e.target.value = ''; }} />
      {preview && (
        <span className="st-tagthumb" style={{ marginTop: 10 }}>
          <SmartImage src={preview} alt="Logo preview" fill sizes="64px" />
        </span>
      )}
      {file && (
        <small>{file.name} · {(file.size / 1024).toFixed(0)} KB{' '}
          <button type="button" className="st-file-x" aria-label={`Remove ${file.name}`}
            onClick={(e) => { e.stopPropagation(); setFile(null); }}>×</button>
        </small>
      )}
    </div>
  );
}
const TABS = [['overview', 'Overview'], ['budgets', 'Budgets'], ['logos', 'Logos'], ['coverage', 'Coverage']];

export default function SponsorHub() {
  useDocumentTitle('Sponsor dashboard');
  const { user, loading } = useAuthed();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [err, setErr] = useState('');
  const [logoLabel, setLogoLabel] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [noteTone, setNoteTone] = useState('info'); // info | err
  const [discounts, setDiscounts] = useState({});
  const [saving, setSaving] = useState(null);
  const [savedFlash, setSavedFlash] = useState(null);
  const [freshLogo, setFreshLogo] = useState(null);
  const [confirmUI, dialog] = useConfirm();
  function flash(text, tone = 'info') {
    setNote(text);
    setNoteTone(tone);
  }

  // Server cents → exact dollar string (1000 → "10", 1050 → "10.5").
  const currentDollars = (b) => String(Number(((Number(b.discount_cents) || 0) / 100).toFixed(2)));
  const reload = () => {
    cachedJson('/sponsor/overview').then((j) => {
      setData(j?.data || null);
      // Prefill rows without an unsaved draft, so the input always shows
      // the live value — never a misleading blank — and drafts survive
      // refetches instead of being clobbered.
      setDiscounts((prev) => {
        const d = { ...prev };
        for (const b of j?.data?.budgets || []) {
          if (d[b.id] === undefined) d[b.id] = String(Number(((Number(b.discount_cents) || 0) / 100).toFixed(2)));
        }
        return d;
      });
    }).catch((e) => setErr(safeError(e)));
    cachedJson('/sponsor/redemptions').then((j) => setCoverage(j?.data || [])).catch(() => setCoverage([]));
  };

  useEffect(() => {
    if (loading || !user) return;
    reload();
  }, [loading, user]);

  async function uploadLogo() {
    setNote('');
    if (!logoLabel.trim()) { flash('Give the logo a name first.', 'err'); return; }
    if (!logoFile) { flash('Choose a PNG or JPEG file (max 2MB).', 'err'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('label', logoLabel.trim().slice(0, 100));
      fd.append('logo', logoFile);
      const res = await fetch(`${API}/sponsor/logos`, { method: 'POST', credentials: 'include', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Upload failed — try again.');
      bustCache('/sponsor/overview');
      setFreshLogo(j.data?.id || null);
      setLogoLabel('');
      setLogoFile(null);
      flash('Logo uploaded — it now appears in buyer checkouts.');
      reload();
    } catch (e2) { flash(safeError(e2), 'err'); } finally { setUploading(false); }
  }

  async function removeLogo(l) {
    const ok = await dialog.confirm({
      title: 'Remove this logo?',
      message: `“${l.label}” leaves buyer checkouts at once. Past purchases keep their baked files.`,
      confirmLabel: 'Remove logo',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API}/sponsor/logos/${l.id}`, { method: 'DELETE', credentials: 'include' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Couldn’t remove — try again.');
      bustCache('/sponsor/overview');
      flash('Logo removed from checkouts.');
      reload();
    } catch (e2) { flash(safeError(e2), 'err'); }
  }

  async function saveDiscount(id) {
    const cents = dollarsToCents(discounts[id]);
    if (!Number.isFinite(cents) || cents < 0) { flash('Discount must be NZ$0 or more.', 'err'); return; }
    setSaving(id);
    try {
      const res = await fetch(`${API}/sponsor/budgets/${id}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discount_cents: cents }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Couldn’t save — try again.');
      bustCache('/sponsor/overview');
      // Drop the draft so the input falls back to the fresh server value,
      // and confirm inline where the edit happened.
      setDiscounts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSavedFlash(id);
      setTimeout(() => setSavedFlash((cur) => (cur === id ? null : cur)), 3000);
      reload();
    } catch (e2) { flash(safeError(e2), 'err'); } finally { setSaving(null); }
  }

  const agreed = (data?.budgets || []).reduce((s, b) => s + Number(b.agreed_cents), 0);
  const spent = (data?.budgets || []).reduce((s, b) => s + Number(b.spent_cents), 0);
  const events = [...new Set((data?.budgets || []).map((b) => b.event_name).filter(Boolean))];

  return (
    <div className="gallery-page">
      <SiteHeader />
      <main>
        <section className="events-section gallery-browser section-gutter" data-page-top>
          <div className="gallery-browser-heading">
            <div>
              <p className="eyebrow">Partners / Sponsors</p>
              <h1>Sponsor dashboard.</h1>
            </div>
            <p className="empty-note">Fund rider discounts, track coverage per event.</p>
          </div>

          {loading ? (
            <p className="empty-note">Loading…</p>
          ) : !user ? (
            <p className="empty-note">Please <Link href="/login?next=/sponsor" className="text-link">sign in</Link> to view your sponsor dashboard.</p>
          ) : err || !data ? (
            <div className="auth-card">
              <p className="eyebrow">Awaiting approval</p>
              <p>{err || 'Your sponsor profile is not active yet — our team reviews every application personally.'}</p>
              <p className="btn-row">
                <Link href="/register/sponsor" className="btn-light">Apply as sponsor</Link>
                <Link href="/contact" className="btn-ghost">Contact us</Link>
              </p>
            </div>
          ) : (
            <>
              <p style={{ color: '#888', fontSize: 13, margin: '18px 0 4px' }}>Kia ora, {data.sponsor.name} — budgets, logos and coverage live here.</p>
              {note && <p role="status" style={{
                margin: '12px 0 0', padding: '10px 14px', fontSize: 13, lineHeight: 1.5,
                color: noteTone === 'err' ? '#f0a3a3' : '#ccc', background: '#141414',
                borderLeft: `2px solid ${noteTone === 'err' ? '#e05c5c' : '#555'}`,
              }}>{note}</p>}
              <div className="media-tabs-dark" role="group" aria-label="Sponsor sections">
                {TABS.map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={tab === k}
                    className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
                    {label}
                    {k === 'budgets' && !!data.budgets.length && <span>{data.budgets.length}</span>}
                    {k === 'logos' && !!data.logos.length && <span>{data.logos.length}</span>}
                    {k === 'coverage' && !!coverage?.length && <span>{coverage.length}</span>}
                  </button>
                ))}
              </div>

              {tab === 'overview' && (
                <>
                  <div className="my-stats" aria-label="Sponsor summary">
                    <div><span>Budget agreed</span><strong>{nzd(agreed)}</strong></div>
                    <div><span>Discounts given</span><strong>{nzd(spent)}</strong></div>
                    <div><span>Photos covered</span><strong>{coverage === null ? '…' : coverage.length}</strong></div>
                  </div>
                  <h2>Sponsored events</h2>
                  {!events.length ? (
                    <p className="empty-note">No events yet — contact us to fund your first event.</p>
                  ) : (
                    <ul>{events.map((e) => <li key={e}>{e}</li>)}</ul>
                  )}
                </>
              )}

              {tab === 'budgets' && (
                <>
                  <div className="my-stats" aria-label="Budget summary">
                    <div><span>Agreed</span><strong>{nzd(agreed)}</strong></div>
                    <div><span>Spent</span><strong>{nzd(spent)}</strong></div>
                    <div><span>Left</span><strong>{nzd(agreed - spent)}</strong></div>
                  </div>
                  <h2>Event budgets &amp; discounts</h2>
                  <p style={{ color: '#888', fontSize: 13, margin: '8px 0 16px' }}>Set how much each rider saves per photo — the photographer is still paid in full.</p>
                  {!data.budgets.length ? (
                    <p className="empty-note">No budgets yet — contact us to fund your first event.</p>
                  ) : (
                    <div className="table-scroll"><table className="st-table">
                      <thead><tr><th>Event</th><th>Agreed</th><th>Spent</th><th>Left</th><th>Discount / photo</th><th>Status</th></tr></thead>
                      <tbody>
                        {data.budgets.map((b) => {
                          const live = currentDollars(b);
                          const draft = discounts[b.id] ?? live;
                          const dirty = draft !== live;
                          return (
                          <tr key={b.id}>
                            <td>{b.event_name || 'Any event'}</td>
                            <td>{nzd(b.agreed_cents)}</td>
                            <td>{nzd(b.spent_cents)}</td>
                            <td>{nzd(b.agreed_cents - b.spent_cents)}</td>
                            <td>
                              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: '#999', fontSize: 12 }}>
                                  NZ$
                                  <input type="text" inputMode="decimal" autoComplete="off" value={draft}
                                    onChange={(e) => setDiscounts({ ...discounts, [b.id]: e.target.value })}
                                    style={{ width: 88, background: '#0b0b0b', border: '1px solid #333', color: '#fff', padding: '8px 10px', fontSize: 13, borderRadius: 4 }}
                                    aria-label={`Discount per photo for ${b.event_name || 'any event'}`} />
                                </label>
                            <button type="button" className="st-btn-ghost" disabled={saving === b.id || !dirty} onClick={() => saveDiscount(b.id)}>
                              {savedFlash === b.id ? 'Saved ✓' : saving === b.id ? 'Saving…' : 'Save'}
                            </button>
                              </span>
                            </td>
                            <td><span className={`my-pill${b.status === 'active' ? ' my-pill-live' : ''}`}>{b.status}</span></td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table></div>
                  )}
                </>
              )}

              {tab === 'logos' && (
                <>
                  <section className="st-step">
                    <header>
                      <span className="st-step-n">01</span>
                      <div>
                        <h3>Name your logo</h3>
                        <p>Buyers see this name at checkout next to the logo.</p>
                      </div>
                    </header>
                    <div className="st-form">
                      <label><span>Logo name</span>
                        <input type="text" value={logoLabel} onChange={(e) => setLogoLabel(e.target.value)}
                          placeholder="e.g. Mitavite" maxLength={100} autoComplete="off" />
                      </label>
                    </div>
                  </section>
                  <section className="st-step">
                    <header>
                      <span className="st-step-n">02</span>
                      <div>
                        <h3>Drop your file</h3>
                        <p>One logo per upload — it goes live in buyer checkouts right away.</p>
                      </div>
                    </header>
                    <LogoDrop file={logoFile} setFile={setLogoFile} />
                    <p style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                      <button type="button" className="st-btn" disabled={uploading || !logoFile || !logoLabel.trim()} onClick={uploadLogo}>
                        {uploading ? 'Uploading…' : 'Upload logo'}
                      </button>
                      {logoFile && !logoLabel.trim() && <small className="empty-note">Name your logo in step 01 first.</small>}
                    </p>
                  </section>
                  <section className="st-step" aria-label="Live logos">
                    <header>
                      <span className="st-step-n">03</span>
                      <div>
                        <h3>Live in checkouts</h3>
                        <p>These logos appear in the buyer’s license picker.</p>
                      </div>
                    </header>
                    {!data.logos.length ? (
                      <p className="empty-note">No logos yet — add your first one above.</p>
                    ) : (
                      <>
                        {confirmUI}
                        <ul className="st-taglist">
                          {data.logos.map((l) => (
                            <LogoRow key={l.id} logo={l} fresh={l.id === freshLogo} onRemove={removeLogo} />
                          ))}
                        </ul>
                      </>
                    )}
                  </section>
                </>
              )}

              {tab === 'coverage' && (
                <>
                  <h2>Coverage — who used your discounts</h2>
                  {coverage === null ? (
                    <p className="empty-note">Loading…</p>
                  ) : !coverage.length ? (
                    <p className="empty-note">No redemptions yet — they appear here as riders check out with your discount.</p>
                  ) : (
                    <div className="table-scroll"><table className="st-table">
                      <thead><tr><th>Date</th><th>Buyer</th><th>Photo</th><th>Event</th><th>Paid</th><th>Discount</th></tr></thead>
                      <tbody>
                        {coverage.map((r, i) => (
                          <tr key={`${r.created_at}-${i}`}>
                            <td>{new Date(r.created_at).toLocaleDateString()}</td>
                            <td>{r.buyer_email}</td>
                            <td>{r.horse} × {r.rider} · {r.license_tier}</td>
                            <td>{r.event}</td>
                            <td>{nzd(r.amount_cents)}</td>
                            <td>{nzd(r.discount_cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                  <h2>Logo approvals</h2>
                  {!data.approvals?.length ? (
                    <p className="empty-note">No requests yet.</p>
                  ) : (
                    <ul>
                      {data.approvals.map((a) => (
                        <li key={a.id}>{a.logo_label} · {a.status}<span className="empty-note"> · {new Date(a.created_at).toLocaleDateString()}</span></li>
                      ))}
                    </ul>
                  )}
                  <h2>Winner gifts</h2>
                  {!data.gifts?.length ? (
                    <p className="empty-note">No gifted credits yet.</p>
                  ) : (
                    <ul>
                      {data.gifts.map((g) => (
                        <li key={g.id}>{g.slots} credits → {g.recipient_email} <span className="empty-note">· {g.bundle_status}</span></li>
                      ))}
                    </ul>
                  )}
                  <p className="empty-note"><Icon name="arrow" size={14} /> Invoices are billed later against the agreed budgets.</p>
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
