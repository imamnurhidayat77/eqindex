import Link from 'next/link';
import PageShell from '../../components/PageShell';

export const metadata = {
  title: 'Sell your work',
  description: 'Photographers: sell your equestrian photography on Boss Media. We handle shop, checkout and delivery.',
};

export default function SellPage() {
  const email = 'hello@bossmedia.nz';
  const subject = encodeURIComponent('Photographer request access — Boss Media');
  const body = encodeURIComponent(
    'Hi Boss Media team,\n\nI\'d like to join as a photographer.\n\nName:\nPortfolio link:\nEvents covered:\nGear:\n\nThanks!'
  );
  return (
    <PageShell eyebrow="Contributors" title="Sell your work."
      intro="We don't just capture performance.">
      <div className="card-dark">
        <h2 style={{ margin: '0 0 10px', fontSize: 22, color: '#fff' }}>Request access</h2>
        <p>Projects taken on a limited basis. Tell us about your project and we&apos;ll determine if it&apos;s a fit.</p>
        <p>We&apos;re looking for photographers covering NZ showjumping and equestrian events — single-shooters and teams. You keep shooting; we handle the shop, checkout, and delivery.</p>
        <p className="btn-row">
          <Link className="btn-light" href="/register/photographer">Apply as photographer</Link>
          <a className="btn-ghost" href={`mailto:${email}?subject=${subject}&body=${body}`}>Or apply by email</a>
        </p>
        <p className="empty-note">Prefer to talk? Tell us about your project first — a short portfolio link is enough to start.</p>
      </div>
      <p style={{ marginTop: 18 }}>
        <Link href="/contact" className="btn-ghost">Questions? Contact us →</Link>
      </p>
    </PageShell>
  );
}
