'use client';
import ManageTable from '../../../components/AdminTable';

export default function ManageRiders() {
  return (
    <ManageTable
      title="Manage riders" sub="Edit regions, series categories and bios. Riders with rounds cannot be deleted."
      base="riders" profile={(r) => `/riders/${r.id}`}
      columns={[
        { k: 'name', label: 'Rider' }, { k: 'region', label: 'Region' },
        { k: 'series_category', label: 'Series' }, { k: 'starts', label: 'Starts', num: true },
      ]}
      fields={[
        { k: 'name', label: 'Name' }, { k: 'region', label: 'Region' },
        { k: 'series_category', label: 'Series category', options: ['Junior', 'Young Rider', 'Under 25', 'Amateur', 'Pony', 'Open'] },
        { k: 'first_name', label: 'First name' }, { k: 'last_name', label: 'Last name' },
        { k: 'nationality', label: 'Nationality' }, { k: 'bio', label: 'Bio' }, { k: 'image_url', label: 'Image URL' },
      ]}
    />
  );
}
