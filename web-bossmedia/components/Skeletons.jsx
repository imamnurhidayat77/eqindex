// Boss Media skeleton screens — mirrors real page layouts so the
// transition from loading → content feels seamless (no layout shift).
// Styling: `.bm-sk` shimmer in app/globals.css. Dark #151515 cards on #080808.

function Sk({ className = '', style, circle = false }) {
  return (
    <span
      aria-hidden="true"
      className={`bm-sk${circle ? ' bm-sk-circle' : ''} ${className}`}
      style={style}
    />
  );
}

function HeaderSk({ transparent = false }) {
  return (
    <div
      aria-hidden="true"
      className={`header${transparent ? '' : ' utility-header'}`}
      style={{ position: 'relative', pointerEvents: 'none' }}
    >
      <Sk className="bm-sk-wordmark" style={{ width: 130, height: 18 }} />
      <div style={{ display: 'flex', gap: 34, margin: 'auto' }} className="bm-sk-hide-mobile">
        <Sk style={{ width: 110, height: 12 }} />
        <Sk style={{ width: 70, height: 12 }} />
        <Sk style={{ width: 44, height: 12 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <Sk style={{ width: 52, height: 12 }} className="bm-sk-hide-mobile" />
        <Sk circle style={{ width: 30, height: 30 }} />
      </div>
    </div>
  );
}

function FooterSk() {
  return (
    <div aria-hidden="true" className="footer section-gutter" style={{ pointerEvents: 'none' }}>
      <div className="footer-brand">
        <Sk style={{ width: 130, height: 20 }} />
        <Sk style={{ width: 160, height: 12, marginTop: 36 }} />
        <Sk style={{ width: 120, height: 12, marginTop: 8 }} />
      </div>
      <div className="footer-links">
        {[0, 1, 2].map((c) => (
          <div key={c}>
            <Sk style={{ width: 70, height: 10, marginBottom: 9 }} />
            <Sk style={{ width: 110, height: 12 }} />
            <Sk style={{ width: 90, height: 12, marginTop: 15 }} />
            <Sk style={{ width: 100, height: 12, marginTop: 15 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function EventCardSk() {
  return (
    <div aria-hidden="true">
      <Sk style={{ height: 'clamp(150px, 15vw, 200px)', display: 'block' }} />
      <div style={{ display: 'flex', gap: 7, margin: '16px 0 12px' }}>
        <Sk circle style={{ width: 5, height: 5 }} />
        <Sk style={{ width: 90, height: 11 }} />
      </div>
      <Sk style={{ width: '80%', height: 22 }} />
      <div style={{ borderTop: '1px solid #333', marginTop: 18, paddingTop: 12, display: 'grid', gap: 8 }}>
        <Sk style={{ width: '60%', height: 12 }} />
        <Sk style={{ width: '45%', height: 12 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 19 }}>
        <Sk style={{ width: 130, height: 11 }} />
        <Sk style={{ width: 70, height: 12 }} />
      </div>
    </div>
  );
}

function MediaCardSk() {
  return (
    <div aria-hidden="true" style={{ border: '1px solid #303030', padding: 7, background: '#151515' }}>
      <Sk style={{ aspectRatio: '4 / 3', display: 'block' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '25px 1fr auto', gap: 8, alignItems: 'center', padding: '16px 8px 10px' }}>
        <Sk style={{ width: 25, height: 10 }} />
        <Sk style={{ height: 13 }} />
        <Sk style={{ width: 15, height: 15 }} />
      </div>
    </div>
  );
}

function ReelCardSk({ tall = false }) {
  return (
    <div aria-hidden="true" style={{ position: 'relative', aspectRatio: '9 / 16', background: '#151515', border: '1px solid #303030', overflow: 'hidden' }}>
      <Sk style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', left: 17, right: 17, bottom: 18 }}>
        <Sk style={{ width: '60%', height: 14 }} />
        <Sk style={{ width: '45%', height: 11, marginTop: 6 }} />
      </div>
    </div>
  );
}

/* ---------------- page-level skeletons ---------------- */

export function HomeSk() {
  return (
    <div className="site-shell">
      <HeaderSk transparent />
      <main id="top">
        {/* hero */}
        <section className="hero section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
          <div className="hero-copy">
            <Sk style={{ width: 'min(560px, 70vw)', height: 58, marginTop: 30 }} />
            <Sk style={{ width: 'min(420px, 60vw)', height: 58, marginTop: 10 }} />
            <Sk style={{ width: 'min(460px, 60vw)', height: 15, marginTop: 30 }} />
            <div style={{ display: 'flex', gap: 28, marginTop: 37 }}>
              <Sk style={{ width: 220, height: 52 }} />
              <Sk style={{ width: 130, height: 20 }} />
            </div>
          </div>
        </section>

        {/* events */}
        <section className="events-section section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
          <div className="section-heading">
            <div>
              <Sk style={{ width: 120, height: 11 }} />
              <Sk style={{ width: 320, height: 52, marginTop: 16 }} />
            </div>
          </div>
          <Sk style={{ height: 120, display: 'block' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '25px 0 32px' }}>
            <Sk style={{ width: 90, height: 11 }} />
            <Sk style={{ width: 68, height: 32 }} />
          </div>
          <div className="event-results grid">
            {[0, 1, 2, 3].map((i) => <EventCardSk key={i} />)}
          </div>
        </section>

        {/* reels strip */}
        <section className="reels-section section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
          <div className="section-heading">
            <div>
              <Sk style={{ width: 140, height: 11 }} />
              <Sk style={{ width: 300, height: 48, marginTop: 16 }} />
            </div>
            <Sk style={{ width: 130, height: 11, marginTop: 16 }} />
          </div>
          <div className="reels-grid">
            {[0, 1, 2, 3].map((i) => <ReelCardSk key={i} />)}
          </div>
        </section>
      </main>
      <FooterSk />
    </div>
  );
}

export function EventsSk() {
  return (
    <div className="gallery-page">
      <HeaderSk />
      <main>
        <section className="events-section gallery-browser section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
          <div className="gallery-browser-heading">
            <div>
              <Sk style={{ width: 180, height: 11 }} />
              <Sk style={{ width: 'min(420px, 70vw)', height: 56, marginTop: 15 }} />
            </div>
            <Sk style={{ width: 220, height: 11 }} />
          </div>
          <Sk style={{ height: 76, display: 'block' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '25px 0 32px' }}>
            <Sk style={{ width: 80, height: 11 }} />
            <Sk style={{ width: 104, height: 32 }} />
          </div>
          <div className="event-results grid">
            {[0, 1, 2, 3, 4, 5].map((i) => <EventCardSk key={i} />)}
          </div>
        </section>
      </main>
      <FooterSk />
    </div>
  );
}

export function EventDetailSk() {
  return (
    <div className="event-detail-page">
      <HeaderSk />
      <main>
        <section className="event-media-section section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
          <Sk style={{ width: 140, height: 11, marginBottom: 44 }} />
          <div className="event-media-header">
            <div>
              <Sk style={{ width: 200, height: 11 }} />
              <Sk style={{ width: 'min(380px, 70vw)', height: 52, marginTop: 15 }} />
            </div>
            <Sk style={{ width: '100%', maxWidth: 340, height: 40 }} />
          </div>
          <Sk style={{ height: 74, display: 'block', marginTop: 52 }} />
          <div style={{ display: 'flex', gap: 26, margin: '26px 0', paddingBottom: 13, borderBottom: '1px solid #383838' }}>
            {[0, 1, 2].map((i) => <Sk key={i} style={{ width: 70, height: 13 }} />)}
          </div>
          <div className="event-media-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => <MediaCardSk key={i} />)}
          </div>
        </section>
      </main>
      <FooterSk />
    </div>
  );
}

export function MediaDetailSk() {
  return (
    <div className="media-detail-page">
      <HeaderSk />
      <main className="media-purchase section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
        <div style={{ display: 'flex', gap: 9 }}>
          <Sk style={{ width: 110, height: 11 }} />
          <Sk style={{ width: 40, height: 11 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 40, margin: '42px 0 34px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px' }}>
            <Sk style={{ width: 140, height: 11 }} />
            <Sk style={{ width: 'min(480px, 80vw)', height: 48, marginTop: 13 }} />
            <Sk style={{ width: 220, height: 13, marginTop: 10 }} />
          </div>
          <Sk style={{ width: 150, height: 12, flex: 'none' }} />
        </div>
        <div className="media-purchase-layout">
          <div className="media-preview-column">
            <Sk style={{ minHeight: 500, display: 'block' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 19 }}>
              <Sk style={{ width: '50%', height: 12 }} />
              <Sk style={{ width: 120, height: 12 }} />
            </div>
          </div>
          <aside className="purchase-panel">
            <Sk style={{ width: 80, height: 11, marginBottom: 15 }} />
            {[0, 1, 2].map((i) => (
              <div key={i} className="license-option" aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <Sk style={{ width: 90, height: 13 }} />
                  <Sk style={{ width: 150, height: 11 }} />
                </div>
                <Sk style={{ width: 48, height: 14 }} />
              </div>
            ))}
            <div style={{ display: 'grid', gap: 9, margin: '18px 0', padding: 0 }}>
              {[0, 1, 2].map((i) => <Sk key={i} style={{ width: `${82 - i * 9}%`, height: 12 }} />)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0' }}>
              <Sk style={{ width: 50, height: 11 }} />
              <Sk style={{ width: 60, height: 14 }} />
            </div>
            <Sk style={{ height: 50, display: 'block' }} />
            <Sk style={{ height: 50, display: 'block', marginTop: 10 }} />
          </aside>
        </div>
      </main>
      <FooterSk />
    </div>
  );
}

export function PhotosSk() {
  return (
    <div className="gallery-page">
      <HeaderSk />
      <main className="prose-page section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
        <Sk style={{ width: 160, height: 11 }} />
        <Sk style={{ width: 220, height: 56, marginTop: 14 }} />
        <Sk style={{ width: 'min(640px, 90vw)', height: 14, marginTop: 12, marginBottom: 34 }} />
        <Sk style={{ height: 76, display: 'block', marginBottom: 26 }} />
        <div className="event-media-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => <MediaCardSk key={i} />)}
        </div>
      </main>
      <FooterSk />
    </div>
  );
}

export function ReelsSk() {
  return (
    <div className="reels-page">
      <HeaderSk />
      <main className="reels-archive section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
        <div className="reels-page-heading">
          <div>
            <Sk style={{ width: 150, height: 11 }} />
            <Sk style={{ width: 200, height: 60, marginTop: 15 }} />
          </div>
          <Sk style={{ width: '100%', maxWidth: 380, height: 40 }} />
        </div>
        <Sk style={{ height: 74, display: 'block', marginTop: 38 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '24px 0' }}>
          <Sk style={{ width: 70, height: 11 }} />
          <Sk style={{ width: 90, height: 11 }} />
        </div>
        <div className="reels-archive-grid">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <ReelCardSk key={i} />)}
        </div>
      </main>
      <FooterSk />
    </div>
  );
}

export function CartSk() {
  return (
    <div className="cart-page">
      <HeaderSk />
      <main className="cart-shell section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
        <div className="cart-heading">
          <div>
            <Sk style={{ width: 120, height: 11 }} />
            <Sk style={{ width: 160, height: 56, marginTop: 15 }} />
          </div>
          <Sk style={{ width: 70, height: 12 }} />
        </div>
        <div className="cart-layout" style={{ marginTop: 38 }}>
          <div className="cart-items">
            {[0, 1].map((i) => (
              <div key={i} className="cart-item" aria-hidden="true">
                <Sk style={{ width: '100%', height: '100%', minHeight: 112, flex: 'none' }} />
                <div>
                  <Sk style={{ width: 90, height: 11, marginBottom: 8 }} />
                  <Sk style={{ width: '70%', height: 20, marginBottom: 8 }} />
                  <Sk style={{ width: '50%', height: 12 }} />
                  <div style={{ display: 'flex', gap: 18, marginTop: 18 }}>
                    <Sk style={{ width: 60, height: 11 }} />
                    <Sk style={{ width: 60, height: 11 }} />
                  </div>
                </div>
                <Sk style={{ width: 60, height: 15, justifySelf: 'end' }} />
              </div>
            ))}
          </div>
          <aside className="cart-summary">
            <Sk style={{ width: 120, height: 11 }} />
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #303030', marginTop: i === 0 ? 24 : 0 }}>
                <Sk style={{ width: 90, height: 12 }} />
                <Sk style={{ width: 60, height: 12 }} />
              </div>
            ))}
            <Sk style={{ height: 46, display: 'block', marginTop: 24 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '24px 0 18px' }}>
              <Sk style={{ width: 50, height: 12 }} />
              <Sk style={{ width: 80, height: 28 }} />
            </div>
            <Sk style={{ height: 52, display: 'block' }} />
          </aside>
        </div>
      </main>
      <FooterSk />
    </div>
  );
}

export function PreBookSk() {
  return (
    <div className="booking-page">
      <HeaderSk />
      <main className="booking-shell section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
        <div className="booking-heading" style={{ paddingBottom: 50, borderBottom: '1px solid #333' }}>
          <div>
            <Sk style={{ width: 120, height: 11 }} />
            <Sk style={{ width: 'min(480px, 80vw)', height: 56, marginTop: 15 }} />
          </div>
          <Sk style={{ width: '100%', maxWidth: 380, height: 42 }} />
        </div>
        <div style={{ display: 'flex', gap: 34, padding: '20px 0', borderBottom: '1px solid #333' }}>
          {[0, 1, 2].map((i) => <Sk key={i} style={{ width: 90, height: 11 }} />)}
        </div>
        <div className="booking-layout" style={{ marginTop: 40 }}>
          <div className="booking-form" style={{ display: 'grid', gap: 18 }}>
            {[0, 1].map((s) => (
              <section key={s} style={{ padding: 28, border: '1px solid #303030', background: '#121212' }}>
                <Sk style={{ width: 220, height: 22, marginBottom: 28 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {[0, 1, 2, 3].map((i) => <Sk key={i} style={{ height: 50 }} />)}
                </div>
                {s === 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 24 }}>
                    {[0, 1, 2].map((i) => <Sk key={i} style={{ height: 150 }} />)}
                  </div>
                )}
              </section>
            ))}
          </div>
          <aside className="booking-summary">
            <Sk style={{ width: 120, height: 11, marginBottom: 20 }} />
            <Sk style={{ width: '70%', height: 15 }} />
            <Sk style={{ width: '90%', height: 12, marginTop: 7 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '23px 0 16px' }}>
              <Sk style={{ width: 50, height: 11 }} />
              <Sk style={{ width: 80, height: 24 }} />
            </div>
            <Sk style={{ height: 52, display: 'block' }} />
          </aside>
        </div>
      </main>
      <FooterSk />
    </div>
  );
}

export function LoginSk() {
  return (
    <div className="login-page" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <div className="login-visual">
        <Sk style={{ position: 'absolute', inset: 0 }} />
      </div>
      <div className="login-panel">
        <div className="login-form-wrap" style={{ margin: 'auto', width: 'min(440px, 100%)' }}>
          <Sk style={{ width: 120, height: 11 }} />
          <Sk style={{ width: '80%', height: 48, marginTop: 12 }} />
          <Sk style={{ width: '90%', height: 14, marginTop: 12, marginBottom: 24 }} />
          <Sk style={{ height: 48, display: 'block', marginBottom: 14 }} />
          <Sk style={{ height: 48, display: 'block', marginBottom: 14 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <Sk style={{ width: 120, height: 12 }} />
            <Sk style={{ width: 100, height: 12 }} />
          </div>
          <Sk style={{ height: 50, display: 'block' }} />
          <Sk style={{ width: 200, height: 13, marginTop: 20 }} />
        </div>
      </div>
    </div>
  );
}

export function ProseSk({ cards = 2 } = {}) {
  return (
    <div className="gallery-page">
      <HeaderSk />
      <main className="prose-page section-gutter" aria-hidden="true" style={{ pointerEvents: 'none' }}>
        <Sk style={{ width: 150, height: 11 }} />
        <Sk style={{ width: 'min(420px, 80vw)', height: 56, marginTop: 14 }} />
        <Sk style={{ width: 'min(640px, 90vw)', height: 14, marginTop: 12, marginBottom: 34 }} />
        <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} style={{ border: '1px solid #303030', background: '#121212', padding: 28 }}>
              <Sk style={{ width: '60%', height: 18 }} />
              <Sk style={{ width: '100%', height: 12, marginTop: 14 }} />
              <Sk style={{ width: '85%', height: 12, marginTop: 8 }} />
              <Sk style={{ width: 160, height: 40, marginTop: 20 }} />
            </div>
          ))}
        </div>
      </main>
      <FooterSk />
    </div>
  );
}

export function MediaGridSk({ n = 6 } = {}) {
  return (
    <div className="event-media-grid" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      {Array.from({ length: n }).map((_, i) => <MediaCardSk key={i} />)}
    </div>
  );
}
