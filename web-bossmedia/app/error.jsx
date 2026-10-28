'use client';

// Storefront safety net: friendly retry instead of a blank crash page.
export default function Error({ error, reset }) {
  return (
    <div className="gallery-page">
      <main className="section-gutter" style={{ paddingTop: 90, paddingBottom: 110, minHeight: '60vh' }}>
        <p className="eyebrow">Something went wrong</p>
        <h1 style={{ fontSize: 44 }}>That didn&apos;t load.</h1>
        <p className="empty-note">Try again — if it keeps happening, contact support.</p>
        <p style={{ marginTop: 22, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <button onClick={() => reset()} className="st-btn">Try again</button>
          <a href="/contact" className="st-btn-ghost" style={{ textDecoration: 'none' }}>Contact support</a>
        </p>
      </main>
    </div>
  );
}
