'use client';
// Venue QR poster modal, shared by the organizer dashboard and the admin
// events tab. Rendered client-side so window.location.origin makes the code
// work on every domain without env config. The QR image comes from a barcode
// CDN at view time; the poster also carries the plain URL + code, so a dead
// image never strands a spectator. Only the QR tile is white (scanners need
// the quiet zone) — the rest follows the surrounding theme.
import { useEffect, useState } from 'react';
import SmartImage from './SmartImage';

export default function QrPosterModal({ qr, onClose }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  const [downloading, setDownloading] = useState(false);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const url = origin ? `${origin}/upload/${qr.code}` : `/upload/${qr.code}`;
  const img = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(origin ? url : `https://bossmedia.nz/upload/${qr.code}`)}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard needs a secure context — the URL is selectable below */ }
  }
  // Save the QR as a PNG (filename carries the code) so it can be printed
  // or dropped into a poster. Falls back to a new tab when the download
  // itself is blocked.
  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(img);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = `boss-media-qr-${qr.code}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 5000);
    } catch {
      window.open(img, '_blank', 'noopener');
    }
    setDownloading(false);
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Venue QR poster"
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div className="st-card" style={{ padding: 24, maxWidth: 400, width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">Spectator uploads</p>
        <h3 style={{ margin: '4px 0' }}>{qr.event.name}</h3>
        <p className="st-csub" style={{ margin: '0 0 12px' }}>Stick this at the gate — scans open the upload page for this event, no account needed.</p>
        <div style={{ background: '#fff', borderRadius: 12, padding: 12, maxWidth: 300, margin: '0 auto' }}>
          <SmartImage src={img} alt={`QR code linking to ${url}`} width={300} height={300} sizes="300px" style={{ width: '100%', height: 'auto', display: 'block' }} />
        </div>
        <p style={{ fontWeight: 700, letterSpacing: '0.08em', margin: '12px 0 2px' }}>{qr.code}</p>
        <p className="st-csub" style={{ margin: '0 0 12px', overflowWrap: 'anywhere' }}>{url}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="st-btn" onClick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
          <button className="st-btn" onClick={download} disabled={downloading}>
            {downloading ? 'Saving…' : 'Download QR'}
          </button>
          <button className="st-btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
