import Link from 'next/link';

export default function MaintenancePage() {
  return (
    <>
      <h1 className="page-title">We&apos;ll be right back</h1>
      <p className="caption" style={{ margin: '6px 0 18px' }}>The shop is briefly offline for maintenance. Nothing is lost — your purchases and credits are safe.</p>
      <p><Link href="/" className="btn btn-secondary btn-md" style={{ textDecoration: 'none' }}>Back home</Link></p>
    </>
  );
}
