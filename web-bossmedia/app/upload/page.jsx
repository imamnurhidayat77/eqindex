import UploadCodeGate from '../../components/UploadCodeGate';

export const metadata = {
  title: 'Share from the event',
  description: 'Scan the Boss Media QR at the venue and share your photos and videos — no account needed.',
  robots: { index: false },
};

export default function UploadLandingPage() {
  return <UploadCodeGate />;
}
