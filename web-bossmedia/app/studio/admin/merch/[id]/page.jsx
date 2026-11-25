'use client';
// One merch product, edited on its own page (Studio > Admin > Merch catalog).
// /studio/admin/merch/<id> edits a product; /studio/admin/merch/new picks a
// model and a name, then /new?id=&model=&name= opens the editor on the draft.
import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import StudioShell from '../../../../../components/studio';
import MerchProductEditor from '../../../../../components/MerchProductEditor';
import MerchNewProduct from '../../../../../components/MerchNewProduct';
import { useStudioUser } from '../../../../../lib/studio';
import { useDocumentTitle } from '../../../../../lib/use-document-title';

export default function MerchProductPage() {
  useDocumentTitle('Merch product');
  return (
    <StudioShell active="admin">
      <Suspense fallback={<p className="empty-note">Loading…</p>}>
        <Body />
      </Suspense>
    </StudioShell>
  );
}

function Body() {
  const { user, state } = useStudioUser();
  const params = useParams();
  const query = useSearchParams();
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
  const isNew = params.id === 'new';
  // /new alone: pick a model and a name first.
  if (isNew && !query.get('id')) return <MerchNewProduct />;
  const id = isNew ? String(query.get('id') || '') : decodeURIComponent(String(params.id));
  return <MerchProductEditor id={id} isNew={isNew} newModel={isNew ? String(query.get('model') || '') : ''}
    newName={isNew ? String(query.get('name') || '') : ''} />;
}
