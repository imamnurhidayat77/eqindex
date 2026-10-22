'use client';

export default function NotifyForm() {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const email = new FormData(e.currentTarget).get('email');
        window.location.href = `mailto:hello@bossmedia.nz?subject=${encodeURIComponent('Notify me — new event galleries')}&body=${encodeURIComponent(`Please notify me at ${email} when new galleries publish.`)}`;
      }}
      style={{ display: 'flex', gap: 8, marginTop: 14 }}
    >
      <input name="email" type="email" required placeholder="Enter your email address" aria-label="Email for notifications"
        style={{ flex: 1, minWidth: 0, padding: '11px 12px', fontSize: 16, borderRadius: 8, border: '1px solid #E7E2D8', background: '#fff' }} />
      <button type="submit" className="btn btn-primary btn-sm" style={{ background: '#1C1C1A', whiteSpace: 'nowrap' }}>Notify me</button>
    </form>
  );
}
