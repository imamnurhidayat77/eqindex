const TIERS = [
  ['Social — NZ$15', '1417×945px, not printable. For social media posts.'],
  ['Web — NZ$35', '2400×1600px, not printable. For websites and presentations. Our most popular.'],
  ['Print file — NZ$75', 'Full original file, printable. For framing and keepsakes.'],
  ['Commercial — NZ$150', 'Full original file with commercial use rights. For sponsors and businesses.'],
];
export default function LicensingPage() {
  return (
    <>
      <h1 className="page-title">Licensing guide</h1>
      <p className="caption" style={{ margin: '6px 0 18px' }}>Four simple tiers. Every purchase is watermark-free and yours to keep.</p>
      {TIERS.map(([t, d]) => (
        <div key={t} className="card" style={{ padding: '16px 20px', marginBottom: 10, maxWidth: 720 }}>
          <div style={{ fontWeight: 800 }}>{t}</div>
          <div className="caption" style={{ marginTop: 4 }}>{d}</div>
        </div>
      ))}
      <p className="caption">Packages (all photos of one horse or rider, or pick-any-5) apply the Print file terms.</p>
    </>
  );
}
