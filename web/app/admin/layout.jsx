import { cookies } from 'next/headers';
import { API } from '../../lib/api';
import { CARD, LINK } from '../../lib/tokens';

async function currentUser() {
  try {
    const token = cookies().get('eq_session')?.value;
    if (!token) return null;
    const res = await fetch(`${API}/auth/me`, {
      headers: { cookie: `eq_session=${token}` }, cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()).data;
  } catch {
    return null;
  }
}

const NAV = [
  ['/admin', 'Overview'],
  ['/admin/import', 'CSV Import'],
  ['/admin/results/add', 'Add Result'],
  ['/admin/review', 'Naming Review'],
  ['/admin/claims', 'Rider Claims'],
  ['/admin/activity', 'Audit Log'],
  ['/admin/settings', 'Settings'],
];

export default async function AdminLayout({ children }) {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') {
    return (
      <section className={CARD}>
        <h1 className="font-display text-[24px] font-bold uppercase tracking-tight">Restricted</h1>
        <p className="text-muted text-sm mt-2">
          The admin console requires an <b className="text-body">ADMIN</b> account.
          {user ? ` You are signed in as ${user.name} (${user.role}).` : ' You are not signed in.'}{' '}
          <a className={LINK} href="/login?next=/admin">Log in →</a>
        </p>
      </section>
    );
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[210px_1fr] items-start">
      <aside className="rounded border border-line bg-card p-2 lg:sticky lg:top-[76px]">
        <div className="px-2.5 py-2 text-[11px] uppercase tracking-wide text-faint font-bold">Admin console</div>
        <div className="px-2.5 pb-2 text-[12px] text-muted truncate">{user.name}</div>
        {NAV.map(([href, label]) => (
          <a key={href} href={href}
            className="block rounded px-2.5 py-2 text-[13px] font-semibold text-muted no-underline hover:bg-white/5 hover:text-white">
            {label}
          </a>
        ))}
        <a href="/" className="block rounded px-2.5 py-2 text-[13px] text-faint no-underline hover:text-white">← Back to site</a>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
