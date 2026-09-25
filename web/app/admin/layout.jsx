import { cookies } from 'next/headers';
import { API } from '../../lib/api';
import { CARD, LINK } from '../../lib/tokens';
import AdminNav from '../../components/AdminNav';

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
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="text-[11px] uppercase tracking-[0.8px] text-faint font-bold">
          EQIndex <span className="text-gold">/</span> Administration
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className="w-2 h-2 rounded-full bg-moss inline-block" title="API reachable" />
          Console live
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[220px_1fr] items-start">
        <AdminNav user={user} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
