import { CARD, H1, H2, SUB } from '../../lib/tokens';

const SECTIONS = [
  ['1. Acceptance', 'By accessing EQIndex you agree to these terms and to the Privacy Policy. If you do not agree, do not use the platform.'],
  ['2. Use of data', 'Published results, rankings and statistics may be viewed and shared with attribution. Bulk harvesting, scraping against robots.txt or terms of upstream sources, and republication of the full database are prohibited without written permission.'],
  ['3. Accuracy disclaimer', 'Results are compiled from organiser files and public series publications and curated by humans, but errors can occur. Points, EQ scores, forecasts and predictions are analytical estimates — provisional unless labelled Official. Verify critical decisions (selection, purchase, breeding) against primary sources.'],
  ['4. Intellectual property', 'The platform, ratings methodology presentation and original analysis are owned by EQIndex Platforms Ltd. Underlying competition facts remain with their organisers. User-submitted content stays owned by its submitter, licensed to us for display.'],
  ['5. Accounts & conduct', 'You are responsible for activity under your account. Rider profile claims and correction reports must be truthful; false claims lead to suspension. Admin decisions on naming, merges and claims are final but logged in the audit trail.'],
  ['6. Liability', 'To the maximum extent permitted by law, EQIndex is not liable for indirect or consequential loss arising from use of the platform or reliance on its analytics.'],
  ['7. Governing law', 'These terms are governed by the laws of New Zealand. Disputes are subject to the non-exclusive jurisdiction of the New Zealand courts.'],
  ['8. Changes', 'We may update these terms; material changes are announced on the platform. Continued use after changes take effect constitutes acceptance.'],
];

export default function Terms() {
  return (
    <>
      <h1 className={H1}>Terms of Service</h1>
      <p className={SUB}>Effective 25 September 2026 · EQIndex Platforms Ltd, New Zealand.</p>
      {SECTIONS.map(([t, b]) => (
        <section className={CARD} key={t}>
          <h2 className={H2}>{t}</h2>
          <p className="text-sm text-muted leading-relaxed">{b}</p>
        </section>
      ))}
    </>
  );
}
