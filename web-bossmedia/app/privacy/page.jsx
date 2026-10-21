export default function PrivacyPage() {
  return (
    <>
      <h1 className="page-title">Privacy</h1>
      <p className="caption" style={{ margin: '6px 0 18px' }}>How we handle photos of you — especially young riders.</p>
      <div className="card" style={{ padding: 28, maxWidth: 720 }}>
        <p>Event photos and reels may show identifiable people, including children. We treat those files as personal information.</p>
        <p><b>Photo opt-out.</b> Riders (or parents/guardians) can ask for a rider&apos;s or horse&apos;s photos to be hidden from public galleries. Hidden photos stay purchasable via direct link.</p>
        <p><b>Takedown.</b> Anyone logged in can request takedown from the photo&apos;s own page. We review within <b>48 hours</b>; valid requests are archived. Buyers keep files they already paid for.</p>
        <p><b>Retention.</b> Unpublished drafts are deleted after 90 days. Withdrawing consent always works — including for previously published photos.</p>
      </div>
    </>
  );
}
