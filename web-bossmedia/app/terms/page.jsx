import PageShell from '../../components/PageShell';

export const metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <PageShell eyebrow="Legal" title="Terms."
      intro="Plain-language summary. The short version is the version.">
      <div className="card-dark">
        <p><b>You buy a license, not the copyright.</b> The photographer keeps copyright in every image and reel.</p>
        <p>Your license tier (Social / Web / Print / Commercial) sets what you may do with the file. Don&apos;t resell or redistribute files; don&apos;t remove watermarks from previews.</p>
        <p>Prices are in NZD, GST included. Files are delivered digitally — no shipping, nothing to wait for.</p>
        <p>Custom reels are made to order after payment. If your round doesn&apos;t happen (elimination, withdrawal), talk to us — we&apos;ll make it right.</p>
      </div>
    </PageShell>
  );
}
