// Studio tables keep their search/filter/page in the URL so a refresh, a
// shared link or the back button lands on the same view. Plain History API:
// the admin pages read window.location instead of useSearchParams (no
// Suspense boundary needed), so writes must not trigger a navigation.

export function readQuery() {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
}

// Empty values remove their key, so defaults never clutter the URL.
export function mergeQuery(search, patch) {
  const p = new URLSearchParams(search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '' || v === 0) p.delete(k);
    else p.set(k, String(v));
  }
  return p.toString();
}

export function writeQuery(patch) {
  const qs = mergeQuery(window.location.search, patch);
  window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname);
}
