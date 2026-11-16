// Shared helpers for server-dependent suites (integration/e2e/perf).
// Deliberately NOT *.test.mjs so `npm test` never runs it as a suite.
export const BOSS = process.env.BOSS_BASE || 'http://127.0.0.1:3000';
export const APIB = process.env.API_BASE || 'http://127.0.0.1:3001';

export async function getText(url, timeoutMs = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.text();
  return { status: res.status, body };
}

// True when the target server answers. Otherwise marks the test skipped
// and returns false — callers MUST `return` on false, because t.skip()
// only flags, it never aborts: anything thrown after it (or any fetch
// below it) turns the skip into a failure. That exact bug kept CI red.
export async function requireServer(t, base) {
  try {
    await fetch(`${base}/`, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    t.skip(`server down at ${base} — start it, then re-run`);
    return false;
  }
}

export async function meanMs(url, n = 5) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fetch(url, { signal: AbortSignal.timeout(15000) });
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return { mean: samples.reduce((s, x) => s + x, 0) / n, p50: samples[Math.floor(n / 2)], max: samples[n - 1] };
}
