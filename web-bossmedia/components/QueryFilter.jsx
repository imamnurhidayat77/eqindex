'use client';
import { useRouter } from 'next/navigation';
import SearchSelect from './SearchSelect';

// SearchSelect that writes a query param and navigates — for server GET
// forms where a client-state combo can't submit. The '' option clears.
export default function QueryFilter({ name, value, options, placeholder }) {
  const router = useRouter();
  return (
    <SearchSelect options={options} value={value || null} clearable={false} placeholder={placeholder}
      onChange={(id) => {
        const p = new URLSearchParams(window.location.search);
        if (id) p.set(name, id);
        else p.delete(name);
        p.delete('page');
        router.push(`${window.location.pathname}?${p.toString()}`);
      }} />
  );
}
