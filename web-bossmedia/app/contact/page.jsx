export default function ContactPage() {
  const email = 'hello@bossmedia.nz';
  return (
    <>
      <h1 className="page-title">Contact</h1>
      <p className="caption" style={{ margin: '6px 0 18px' }}>Interested in working together? Tell us about your project and we&apos;ll determine if it&apos;s a fit.</p>
      <div className="card" style={{ padding: 28, maxWidth: 640 }}>
        <p>Email us at <a href={`mailto:${email}`} style={{ color: '#1F3D2E', fontWeight: 700 }}>{email}</a> — riders, sponsors, and event organisers welcome.</p>
        <p className="caption">For takedown or privacy requests, use the Request takedown link on the photo itself — it&apos;s faster (48-hour review).</p>
      </div>
    </>
  );
}
