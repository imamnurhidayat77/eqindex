import ForgotClient from '../../components/ForgotClient';

export const metadata = { title: 'Forgot password — Boss Media' };

const FIGMA_LOGIN_VISUAL =
  'https://images.unsplash.com/photo-1695133994806-20833ee9d4c2?auto=format&fit=crop&w=1600&q=88';

export default function ForgotPage() {
  return <ForgotClient visual={FIGMA_LOGIN_VISUAL} />;
}
