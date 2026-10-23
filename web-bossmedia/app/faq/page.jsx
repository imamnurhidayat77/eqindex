import PageShell from '../../components/PageShell';

const QA = [
  ['When will my photos be ready?', 'Galleries are published within 48 hours of the event. Custom reels start after payment — track them under My media.'],
  ['What do I actually download?', 'Watermark-free full resolution files. What you see in the preview is exactly what you get, minus the watermark.'],
  ['Can I re-download later?', 'Yes — everything you buy stays in your account with lifetime re-downloads.'],
  ['How do 5-packs work?', 'One 5-pack covers any 5 photos of the same horse or rider at one event. Open a photo, hit unlock, done.'],
  ['I don\u2019t want my (or my child\u2019s) photos public. What can I do?', 'Use Request takedown on the photo page — we review within 48 hours. Riders can also ask for ongoing opt-out via the contact page.'],
  ['Do you offer prints?', 'Not currently — all sales are digital downloads.'],
];

export default function FaqPage() {
  return (
    <PageShell eyebrow="Support" title="FAQ." intro="Short answers, no fine print.">
      {QA.map(([q, a]) => (
        <details key={q} className="card-dark" style={{ marginBottom: 10 }}>
          <summary>{q}</summary>
          <p style={{ margin: '8px 0 0' }}>{a}</p>
        </details>
      ))}
    </PageShell>
  );
}
