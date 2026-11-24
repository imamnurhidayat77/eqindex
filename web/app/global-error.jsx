'use client';

// Last resort when the root layout itself fails: renders its own <html>
// with inline styles because globals.css and the layout may not have loaded.
export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ maxWidth: 460, textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 12 }}>
            <span style={{ color: '#fff' }}>EQ</span><span style={{ color: '#FFD700' }}>Index</span>
          </div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px', color: '#fff' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#A0A0A0', margin: '0 0 20px' }}>
            EQIndex couldn&apos;t start this page. Try again, or reload in a minute.
          </p>
          <button type="button" onClick={() => reset()} style={{ background: '#FFD700', color: '#000', fontWeight: 700, border: 0, borderRadius: 6, padding: '9px 16px', fontSize: 13, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
