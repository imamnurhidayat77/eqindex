import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <h1 className="display" style={{ fontSize: 56, margin: '40px 0 8px' }}>Looks like this one refused the jump.</h1>
      <p className="caption" style={{ marginBottom: 20 }}>That page isn&apos;t in the arena. Let&apos;s get you back on course.</p>
      <Link href="/" className="btn btn-primary btn-md" style={{ textDecoration: 'none' }}>Back to the gallery</Link>
    </>
  );
}
