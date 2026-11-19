import UploadQrClient from '../../../components/UploadQrClient';

export const metadata = {
  title: 'Share from the event',
  description: 'Share your event photos and videos with Boss Media — no account needed.',
  robots: { index: false },
};

export default function UploadByQrPage({ params }) {
  return <UploadQrClient code={params.code} />;
}
