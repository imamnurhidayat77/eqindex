'use client';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { checkoutBase, newIdempotencyKey, nzd, stripeCheckoutUrl } from '../lib/figma-data';
import { momentShareView } from '../lib/moment-share.mjs';
import { useAuthed } from '../lib/use-authed';
import { usePurchasePoll } from '../lib/use-purchase-poll';
import { PostCta } from './PostToSocial';
import { useToast } from './Toaster';

const SPONSOR_REPOST_TIER = 'sponsor-repost';
const UUID_RE = /^[0-9a-f-]{36}$/i;
const POST_LABEL = 'Post to Facebook / Instagram';
const STATUS_TEXT = {
  checking: 'Confirming your payment…',
  pending: 'Confirming your payment…',
  unknown: 'Payment not confirmed yet. Refresh in a minute, or find it under My photos.',
};

// Stripe returns to the moment page with ?purchase=<id>. The webhook is the
// source of truth, so poll it (same hook as /photos/success).
function returnedPurchaseId() {
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('purchase');
  return id && UUID_RE.test(id) ? id : null;
}

// Sponsor already holds a licence for this moment? null while loading.
function useOwned(mediaId, enabled) {
  const [owned, setOwned] = useState(null);
  useEffect(() => {
    if (!enabled || !mediaId) return undefined;
    let live = true;
    fetch(`${API}/api/my/social/licence/${mediaId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setOwned(!!j?.data?.owned); })
      .catch(() => { if (live) setOwned(false); });
    return () => { live = false; };
  }, [mediaId, enabled]);
  return owned;
}

function useRepostTier(enabled) {
  const [tier, setTier] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    fetch(`${API}/api/license-tiers?for=community`).then((r) => (r.ok ? r.json() : null))
      .then((j) => setTier((j?.data || []).find((t) => t.id === SPONSOR_REPOST_TIER) || null))
      .catch(() => {});
  }, [enabled]);
  return tier;
}

// One licence for one moment, so it goes straight to Stripe (no cart). The
// tier price is edited in Studio > Pricing; the server enforces roles.
function BuyRepostButton({ mediaId, email }) {
  const toast = useToast();
  const tier = useRepostTier(true);
  const [busy, setBusy] = useState(false);
  if (!tier) return null;
  const momentPath = `/moments/${mediaId}`;
  const buy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/checkout`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...checkoutBase(),
          media_id: mediaId,
          license_tier: SPONSOR_REPOST_TIER,
          email,
          success_path: momentPath,
          cancel_path: momentPath,
          idempotency_key: newIdempotencyKey(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409 && (j.owned || j.paid)) {
        toast('You already hold the repost licence for this moment.', { type: 'info' });
        return;
      }
      if (!res.ok) throw new Error(j.error || 'Checkout failed. Please try again.');
      window.location.assign(stripeCheckoutUrl(j.data));
    } catch (e) {
      toast(e.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="st-btn-ghost" onClick={buy} disabled={busy} aria-busy={busy}>
      {busy ? 'Opening checkout…' : `Buy repost licence · ${nzd(tier.price_cents)}`}
    </button>
  );
}

// Share actions for a community moment. Everyone posts free except
// sponsors, who see only "Buy repost licence" until they have paid, then
// Post plus the branded download. media: { media_id, thumb, title, sub, caption }.
export default function MomentShareActions({ media, kind }) {
  const { user, loading } = useAuthed();
  const isSponsor = user?.role === 'SPONSOR';
  const owned = useOwned(media?.media_id, isSponsor);
  const [purchaseId, setPurchaseId] = useState(null);
  useEffect(() => { setPurchaseId(returnedPurchaseId()); }, []);
  const { state: pollState } = usePurchasePoll(isSponsor && purchaseId ? [purchaseId] : []);
  if (!media?.media_id) return null;

  const view = momentShareView({
    authLoading: loading,
    role: user?.role,
    owned,
    purchaseState: isSponsor && purchaseId ? pollState : null,
  });
  const post = kind !== 'reel' ? <PostCta label={POST_LABEL} media={media} /> : null;

  if (view === 'post') return post;
  if (view === 'buy') return <BuyRepostButton mediaId={media.media_id} email={user.email} />;
  if (view === 'confirming') {
    return <p role="status" style={{ margin: 0, fontSize: 13, color: '#bbb' }}>{STATUS_TEXT[pollState] || STATUS_TEXT.checking}</p>;
  }
  if (view === 'licensed') {
    return (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'inherit' }}>
        {post}
        <a href={`${API}/api/media/${media.media_id}/download`} className="text-link" style={{ fontSize: 13 }}>
          Download branded file
        </a>
      </div>
    );
  }
  return null;
}
