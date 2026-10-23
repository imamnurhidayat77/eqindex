import PageShell from '../../components/PageShell';

export default function ContactPage() {
  const email = 'hello@bossmedia.nz';
  return (
    <PageShell eyebrow="Studio" title="Contact."
      intro="Interested in working together? Tell us about your project and we'll determine if it's a fit.">
      <div className="card-dark">
        <p>Email us at <a className="inline" href={`mailto:${email}`}>{email}</a> — riders, sponsors, and event organisers welcome.</p>
        <p className="empty-note">For takedown or privacy requests, use the Request takedown link on the photo itself — it&apos;s faster (48-hour review).</p>
      </div>
    </PageShell>
  );
}
