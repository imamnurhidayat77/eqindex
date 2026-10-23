import LoginClient from '../../components/LoginClient';

export const metadata = { title: 'Sign in — Boss Media' };

// Sama persis dengan Figma (bossmedia/src/App.tsx -> photos.action)
const FIGMA_LOGIN_VISUAL =
  'https://images.unsplash.com/photo-1695133994806-20833ee9d4c2?auto=format&fit=crop&w=1600&q=88';

export default function LoginPage() {
  return <LoginClient visual={FIGMA_LOGIN_VISUAL} />;
}
