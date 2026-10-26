import ResetClient from '../../components/ResetClient';

export const metadata = { title: 'Reset password', robots: { index: false } };

const FIGMA_LOGIN_VISUAL =
  'https://images.unsplash.com/photo-1695133994806-20833ee9d4c2?auto=format&fit=crop&w=1600&q=88';

export default function ResetPage() {
  return <ResetClient visual={FIGMA_LOGIN_VISUAL} />;
}
