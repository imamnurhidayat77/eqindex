// Global fallback loading: generik (bukan skeleton home) agar cocok
// untuk semua rute saat segmen tanpa loading.jsx sendiri.
export default function Loading() {
  return (
    <div className="gallery-page" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <main className="section-gutter" style={{ paddingTop: 90, paddingBottom: 110, minHeight: '60vh', display: 'grid', gap: 14, alignContent: 'start' }}>
        <span className="bm-sk" style={{ width: 140, height: 11 }} />
        <span className="bm-sk" style={{ width: 'min(420px, 70vw)', height: 52 }} />
        <span className="bm-sk" style={{ width: 'min(560px, 85vw)', height: 14 }} />
        <span className="bm-sk" style={{ height: 76, display: 'block', marginTop: 18 }} />
        <p role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Loading…</p>
      </main>
    </div>
  );
}
