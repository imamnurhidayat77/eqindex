import Link from 'next/link';

export default function SellPage() {
  const email = 'hello@bossmedia.nz';
  const subject = encodeURIComponent('Photographer request access — Boss Media');
  const body = encodeURIComponent(
    'Hi Boss Media team,\n\nI\'d like to join as a photographer.\n\nName:\nPortfolio link:\nEvents covered:\nGear:\n\nThanks!'
  );
  return (
    <>
      <h1 className="page-title">Sell your work</h1>
      <p className="caption" style={{ margin: '6px 0 18px', maxWidth: 640 }}>
        Boss Media creates cinematic content for the New Zealand equestrian industry, focused on the riders,
        horses, and teams behind the result. We don&apos;t just capture performance.
      </p>
      <div className="card" style={{ padding: 28, maxWidth: 640 }}>
        <h2 className="card-title">Request access</h2>
        <p className="caption" style={{ margin: '6px 0 16px' }}>
          Projects taken on a limited basis. Tell us about your project and we&apos;ll determine if it&apos;s a fit.
        </p>
        <p>We&apos;re looking for photographers covering NZ showjumping and equestrian events —
          single-shooters and teams. You keep shooting; we handle the shop, checkout, and delivery.</p>
        <p style={{ marginTop: 16 }}>
          <a className="btn btn-primary btn-md" style={{ textDecoration: 'none' }} href={`mailto:${email}?subject=${subject}&body=${body}`}>
            Apply by email
          </a>
        </p>
        <p className="caption">Prefer to talk? Tell us about your project first — a short portfolio link is enough to start.</p>
      </div>
      <p style={{ marginTop: 18 }}>
        <Link href="/contact" style={{ color: '#1F3D2E', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Questions? Contact us →</Link>
      </p>
    </>
  );
}
