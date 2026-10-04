'use client';
import { useEffect, useState } from 'react';
import ManageTable from '../../../components/AdminTable';
import { useAdminApi } from '../../../components/useAdminApi';
import { keyOptions, keyLabel, FALLBACK_CATS } from '../../../lib/categories';

// Rider category options come from the rider_categories master table
// (Admin → Categories). Stored values are master keys.
export default function ManageRiders() {
  const call = useAdminApi();
  const [cats, setCats] = useState(null);
  useEffect(() => {
    let live = true;
    call('/admin/categories').then((d) => { if (live) setCats(d || []); }).catch(() => { if (live) setCats([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const list = cats === null ? FALLBACK_CATS : cats;
  const opts = keyOptions(list);
  return (
    <ManageTable
      title="Manage riders" sub="Edit regions, rider categories and bios. The category drives Weekend Best buckets. Riders with rounds cannot be deleted."
      base="riders" profile={(r) => `/riders/${r.rider_slug || r.rider_id}`}
      columns={[
        { k: 'name', label: 'Rider' }, { k: 'region', label: 'Region' },
        { k: 'series_category', label: 'Category', render: (r) => keyLabel(list, r.series_category) },
        { k: 'starts', label: 'Starts', num: true },
        { k: 'visibility', label: 'Visibility', toggle: { field: 'visibility', on: 'public', off: 'anonymous', onLabel: 'PUBLIC', offLabel: 'HIDDEN' } },
      ]}
      fields={[
        { k: 'name', label: 'Name' }, { k: 'region', label: 'Region' },
        { k: 'series_category', label: 'Rider category (drives Weekend Best)', options: opts },
        { k: 'visibility', label: 'Visibility (anonymous hides the name publicly)', options: ['public', 'anonymous'] },
        { k: 'first_name', label: 'First name' }, { k: 'last_name', label: 'Last name' },
        { k: 'nationality', label: 'Nationality' }, { k: 'bio', label: 'Bio' }, { k: 'image_url', label: 'Image URL' },
      ]}
    />
  );
}
