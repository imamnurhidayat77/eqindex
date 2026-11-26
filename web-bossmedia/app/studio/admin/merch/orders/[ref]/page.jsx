'use client';
// One merch order for admins: Studio > Admin > Merch orders > order.
import { useParams } from 'next/navigation';
import StudioShell from '../../../../../../components/studio';
import { AdminMerchOrderDetail } from '../../../../../../components/AdminMerchOrders';
import { useStudioUser } from '../../../../../../lib/studio';
import { useDocumentTitle } from '../../../../../../lib/use-document-title';

export default function AdminMerchOrderPage() {
  const ref = String(useParams()?.ref || '').toUpperCase();
  useDocumentTitle(`Order ${ref}`);
  return (
    <StudioShell active="admin">
      <Body orderRef={ref} />
    </StudioShell>
  );
}

function Body({ orderRef }) {
  const { user, state } = useStudioUser();
  if (state === 'loading') return <p className="empty-note">Loading…</p>;
  if (state !== 'ok' || user?.role !== 'ADMIN') {
    return (
      <div className="event-media-empty">
        <p className="eyebrow">Restricted</p>
        <h3>Media admins only.</h3>
        <p>This console needs an ADMIN account.</p>
      </div>
    );
  }
  return <AdminMerchOrderDetail orderRef={orderRef} />;
}
