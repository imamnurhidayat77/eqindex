import UploadQrClient from '../../../components/UploadQrClient';

export const metadata = {
  title: 'Share from the event',
  description: 'Share your event photos and videos with Boss Media — no account needed.',
  robots: { index: false },
};

export default async function UploadByQrPage(props) {
  const params = await props.params;
  return <UploadQrClient code={params.code} />;
}
