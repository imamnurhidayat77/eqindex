import Link from 'next/link';
import PageShell from '../../components/PageShell';

export default function MaintenancePage() {
  return (
    <PageShell eyebrow="Status" title="We'll be right back."
      intro="The shop is briefly offline for maintenance. Nothing is lost — your purchases and credits are safe.">
      <p><Link href="/" className="btn-ghost">Back home →</Link></p>
    </PageShell>
  );
}
