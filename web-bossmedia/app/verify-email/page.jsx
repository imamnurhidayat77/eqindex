import { Suspense } from 'react';
import PageShell from '../../components/PageShell';
import VerifyEmailClient from '../../components/VerifyEmailClient';

export const metadata = { title: 'Confirm your email', robots: { index: false } };

export default function VerifyEmailPage() {
  return (
    <PageShell eyebrow="Account" title="Confirm your email.">
      <Suspense><VerifyEmailClient /></Suspense>
    </PageShell>
  );
}
