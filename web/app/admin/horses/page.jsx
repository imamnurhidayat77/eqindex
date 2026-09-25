'use client';
import ManageTable from '../../../components/AdminTable';

export default function ManageHorses() {
  return (
    <ManageTable
      title="Manage horses" sub="Edit profile fields, fix names, remove duplicates. Horses with rounds cannot be deleted."
      base="horses" profile={(r) => `/horses/${r.id}`}
      columns={[
        { k: 'name', label: 'Horse' }, { k: 'breed', label: 'Breed' },
        { k: 'sire', label: 'Sire' }, { k: 'starts', label: 'Starts', num: true },
      ]}
      fields={[
        { k: 'name', label: 'Name' }, { k: 'breed', label: 'Breed' },
        { k: 'gender', label: 'Gender', options: ['Mare', 'Gelding', 'Stallion', 'Filly', 'Colt', 'Unknown'] },
        { k: 'sire', label: 'Sire' }, { k: 'dam', label: 'Dam' }, { k: 'damsire', label: 'Damsire' },
        { k: 'breeder', label: 'Breeder' }, { k: 'year_of_birth', label: 'Year of birth' },
        { k: 'color', label: 'Colour' }, { k: 'height', label: 'Height (e.g. 16.2hh)' },
        { k: 'country', label: 'Country' }, { k: 'image_url', label: 'Image URL' },
      ]}
    />
  );
}
