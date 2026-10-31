import PageShell from '../../components/PageShell';

export const metadata = { title: 'Licensing' };

const TIERS = [
  ['Social — NZ$15', '1417×945px, not printable. For social media posts.'],
  ['Web — NZ$35', '2400×1600px, not printable. For websites and presentations. Our most popular.'],
  ['Print file — NZ$75', 'Full original file, printable. For framing and keepsakes.'],
  ['Commercial — NZ$150', 'Full original file with commercial use rights. For sponsors and businesses.'],
];

export default function LicensingPage() {
  return (
    <PageShell eyebrow="Legal" title="Licensing guide."
      intro="Four simple tiers. Every purchase is watermark-free and yours to keep. All prices in NZ$ GST included.">
      {TIERS.map(([t, d]) => (
        <div key={t} className="card-dark" style={{ padding: '16px 20px', marginBottom: 10 }}>
          <div style={{ fontWeight: 800, color: '#fff' }}>{t}</div>
          <div style={{ marginTop: 4 }} className="empty-note">{d}</div>
        </div>
      ))}
      <p className="empty-note">Packages (all photos of one horse or rider, or pick-any-5) apply the Print file terms.</p>
    </PageShell>
  );
}
