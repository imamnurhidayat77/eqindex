'use client';

import PageShell from '../components/PageShell';

// Storefront safety net: friendly retry instead of a blank crash page.
// Dibungkus PageShell agar header/footer tetap tampil saat error.
export default function Error({ error, reset }) {
  return (
    <PageShell eyebrow="Something went wrong" title="That didn't load.">
      <p className="empty-note">Try again — if it keeps happening, contact support.</p>
      <p style={{ marginTop: 22, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <button onClick={() => reset()} className="st-btn">Try again</button>
        <a href="/contact" className="st-btn-ghost" style={{ textDecoration: 'none' }}>Contact support</a>
      </p>
    </PageShell>
  );
}
