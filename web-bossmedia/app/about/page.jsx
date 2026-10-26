import PageShell from '../../components/PageShell';

export const metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <PageShell eyebrow="Studio" title="About Boss Media." intro="Riders and Horses. Elevated.">
      <div className="card-dark">
        <p>Boss Media creates cinematic content for the New Zealand equestrian industry, focused on the riders, horses, and teams behind the result.</p>
        <p>We don&apos;t just capture performance. Our services include:</p>
        <ul>
          <li>Personalised showreels capturing your round, professionally edited</li>
          <li>Sponsor integration woven naturally into your content</li>
          <li>Team-based videos capturing the full competition experience</li>
          <li>Drone videography from a licensed operator</li>
        </ul>
        <p>Projects taken on a limited basis.</p>
      </div>
    </PageShell>
  );
}
