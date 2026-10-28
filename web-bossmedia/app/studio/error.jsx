'use client';

// Studio safety net: same friendly retry, studio shell chrome.
export default function StudioError({ error, reset }) {
  return (
    <div className="studio-page">
      <main className="section-gutter st-hero">
        <p className="eyebrow">Boss Studio</p>
        <h1>That didn&apos;t load.</h1>
        <p style={{ color: '#999' }}>Try again — your uploads and tags are safe.</p>
        <p style={{ marginTop: 22 }}>
          <button onClick={() => reset()} className="st-btn">Try again</button>
        </p>
      </main>
    </div>
  );
}
