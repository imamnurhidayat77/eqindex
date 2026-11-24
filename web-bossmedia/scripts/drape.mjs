// Cloth drape for gear worn on the horse (used by fit-horse-gear.mjs).
// The authored mesh is a thick shell (both faces plus rim), which a cloth
// solver cannot run on directly. So the mesh is clustered into a coarse
// particle sheet (one particle per `cell`, both faces merge), the sheet is
// simulated with position based dynamics (gravity, edge lengths kept from
// `rest`, light bending, collision and friction against the horse), and
// every original vertex then follows the particles near it with smooth
// weights, which keeps the cloth's thickness, piping and buckles intact.
import * as THREE from 'three';

export function drape(pos, idx, horseGeo, {
  rest = pos, cell = 0.03, steps = 240, iters = 12, dt = 1 / 120, off = 0.012,
  stretch = 1, bend = 0.15, friction = 0.85, damping = 0.02, pinned = null, pull = null, pullAcc = 25, log = () => {},
} = {}) {
  const n = pos.length / 3;
  // ---- clusters
  const keyOf = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const map = new Map();
  const cid = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = keyOf(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    if (!map.has(k)) map.set(k, map.size);
    cid[i] = map.get(k);
  }
  const m = map.size;
  const X = new Float64Array(m * 3);
  const R = new Float64Array(m * 3);
  const cnt = new Float64Array(m);
  const pin = new Uint8Array(m);
  const tug = new Uint8Array(m);
  for (let i = 0; i < n; i++) {
    const c = cid[i];
    for (let a = 0; a < 3; a++) { X[c * 3 + a] += pos[i * 3 + a]; R[c * 3 + a] += rest[i * 3 + a]; }
    cnt[c]++;
    if (pinned && pinned[i]) pin[c] = 1;
    if (pull && pull[i]) tug[c] = 1;
  }
  for (let c = 0; c < m; c++) for (let a = 0; a < 3; a++) { X[c * 3 + a] /= cnt[c]; R[c * 3 + a] /= cnt[c]; }
  const X0 = Float64Array.from(X);
  // ---- constraints: mesh edges between clusters, plus 2-ring for bending
  const nb = Array.from({ length: m }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
      const ca = cid[a], cb = cid[b];
      if (ca !== cb) { nb[ca].add(cb); nb[cb].add(ca); }
    }
  }
  const restLen = (a, b) => Math.hypot(R[a * 3] - R[b * 3], R[a * 3 + 1] - R[b * 3 + 1], R[a * 3 + 2] - R[b * 3 + 2]);
  const E = [];
  for (let a = 0; a < m; a++) for (const b of nb[a]) if (a < b) E.push([a, b, restLen(a, b) * stretch, 1]);
  const seen = new Set();
  for (let a = 0; a < m; a++) for (const b of nb[a]) for (const c of nb[b]) {
    if (c <= a || nb[a].has(c)) continue;
    const k = a * m + c;
    if (seen.has(k)) continue;
    seen.add(k);
    E.push([a, c, restLen(a, c) * stretch, bend]);
  }
  log(`drape: ${n} verts -> ${m} particles, ${E.length} constraints`);
  // ---- horse collision
  const hp = horseGeo.attributes.position;
  const hi = horseGeo.index.array;
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const p = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  function collide(c) {
    p.set(X[c * 3], X[c * 3 + 1], X[c * 3 + 2]);
    if (!horseGeo.boundsTree.closestPointToPoint(p, target, 0, off * 6)) return false;
    const f = target.faceIndex * 3;
    A.fromBufferAttribute(hp, hi[f]); B.fromBufferAttribute(hp, hi[f + 1]); C.fromBufferAttribute(hp, hi[f + 2]);
    const nrm = B.sub(A).cross(C.sub(A)).normalize();
    const d = p.clone().sub(target.point);
    const side = d.dot(nrm);
    const dist = target.distance;
    if (side >= 0 && dist >= off) return false;
    // inside (behind the face) or too close: put it `off` out along the normal
    X[c * 3] = target.point.x + nrm.x * off;
    X[c * 3 + 1] = target.point.y + nrm.y * off;
    X[c * 3 + 2] = target.point.z + nrm.z * off;
    return true;
  }
  // ---- simulate
  const V = new Float64Array(m * 3);
  const P = new Float64Array(m * 3);
  const contact = new Uint8Array(m);
  for (let s = 0; s < steps; s++) {
    for (let c = 0; c < m; c++) {
      if (pin[c]) { P[c * 3] = X[c * 3]; P[c * 3 + 1] = X[c * 3 + 1]; P[c * 3 + 2] = X[c * 3 + 2]; continue; }
      V[c * 3 + 1] -= 9.81 * dt;
      // Belly straps: drawn in under the belly toward the centre line,
      // like a fastened surcingle, instead of hanging loose.
      if (tug[c]) V[c * 3] -= Math.sign(X[c * 3]) * Math.min(1, Math.abs(X[c * 3]) / 0.05) * pullAcc * dt;
      for (let a = 0; a < 3; a++) { V[c * 3 + a] *= 1 - damping; P[c * 3 + a] = X[c * 3 + a]; X[c * 3 + a] += V[c * 3 + a] * dt; }
    }
    for (let it = 0; it < iters; it++) {
      for (const [a, b, L, k] of E) {
        const dx = X[b * 3] - X[a * 3], dy = X[b * 3 + 1] - X[a * 3 + 1], dz = X[b * 3 + 2] - X[a * 3 + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-9;
        const wa = pin[a] ? 0 : 1, wb = pin[b] ? 0 : 1;
        if (wa + wb === 0) continue;
        const corr = (k * (d - L)) / d / (wa + wb);
        X[a * 3] += dx * corr * wa; X[a * 3 + 1] += dy * corr * wa; X[a * 3 + 2] += dz * corr * wa;
        X[b * 3] -= dx * corr * wb; X[b * 3 + 1] -= dy * corr * wb; X[b * 3 + 2] -= dz * corr * wb;
      }
      if (it === iters - 1 || it % 4 === 0) for (let c = 0; c < m; c++) if (!pin[c]) contact[c] = collide(c) ? 1 : contact[c];
    }
    for (let c = 0; c < m; c++) {
      if (pin[c]) continue;
      for (let a = 0; a < 3; a++) V[c * 3 + a] = (X[c * 3 + a] - P[c * 3 + a]) / dt;
      if (contact[c]) for (let a = 0; a < 3; a++) V[c * 3 + a] *= 1 - friction;
      contact[c] = 0;
    }
    if (s % 60 === 0) log(`drape step ${s}`);
  }
  // ---- skin the full mesh: smooth weights over particles within 1.6 cells
  const D = new Float64Array(m * 3);
  for (let c = 0; c < m * 3; c++) D[c] = X[c] - X0[c];
  const grid = new Map();
  for (let c = 0; c < m; c++) {
    const k = keyOf(X0[c * 3], X0[c * 3 + 1], X0[c * 3 + 2]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(c);
  }
  const out = new Float32Array(pos.length);
  const rad = cell * 1.6;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let wsum = 0, ox = 0, oy = 0, oz = 0;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) {
      const list = grid.get(`${cx + a},${cy + b},${cz + c}`);
      if (!list) continue;
      for (const q of list) {
        const d = Math.hypot(X0[q * 3] - x, X0[q * 3 + 1] - y, X0[q * 3 + 2] - z);
        if (d > rad) continue;
        // only particles this vertex is topologically near (own cluster or
        // its mesh neighbours), so two panels that touch do not drag each other
        if (q !== cid[i] && !nb[cid[i]].has(q)) continue;
        const w = Math.exp(-((d / cell) ** 2));
        wsum += w; ox += D[q * 3] * w; oy += D[q * 3 + 1] * w; oz += D[q * 3 + 2] * w;
      }
    }
    if (wsum === 0) { const q = cid[i]; ox = D[q * 3]; oy = D[q * 3 + 1]; oz = D[q * 3 + 2]; wsum = 1; }
    out[i * 3] = x + ox / wsum; out[i * 3 + 1] = y + oy / wsum; out[i * 3 + 2] = z + oz / wsum;
  }
  return out;
}
