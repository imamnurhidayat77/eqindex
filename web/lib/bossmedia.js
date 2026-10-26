// Boss Media is the shop: EQIndex shows photos, buying happens there.
// Every photo/reel link in this app points out — nothing is sold here.
export const BOSSMEDIA_URL = (process.env.NEXT_PUBLIC_BOSSMEDIA_URL || 'https://bossmedia.nz').replace(/\/+$/, '');

export const bossPhotoUrl = (id) => `${BOSSMEDIA_URL}/p/${encodeURIComponent(id)}`;

export const bossPhotosUrl = (params = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v !== null && v !== undefined) q.set(k, String(v));
  }
  const s = q.toString();
  return `${BOSSMEDIA_URL}/photos${s ? `?${s}` : ''}`;
};

export const bossEventUrl = (slugOrId) => `${BOSSMEDIA_URL}/events/${encodeURIComponent(slugOrId)}`;
