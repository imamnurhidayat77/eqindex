// Which share action a community moment shows. Only sponsors pay to repost;
// everyone else posts free. Returns: none | post | buy | confirming | licensed.
// owned: null while loading, else boolean. purchaseState: usePurchasePoll
// state when returning from Stripe (?purchase=), else null.
export function momentShareView({ authLoading, role, owned, purchaseState }) {
  if (authLoading) return 'none';
  if (role !== 'SPONSOR') return 'post';
  if (owned === null) return 'none';
  if (owned || purchaseState === 'paid') return 'licensed';
  if (purchaseState) return 'confirming';
  return 'buy';
}

// Headline for a community moment: "Rider × Horse", else whichever is tagged.
export function momentTitle({ rider, horse } = {}) {
  return [rider, horse].filter(Boolean).join(' × ') || 'Community moment';
}
