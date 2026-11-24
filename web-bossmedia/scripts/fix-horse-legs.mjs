// Removes the duplicated lower legs Tripo gave the client's horse (each
// leg splits into two below the knee/hock, 8 hooves) and caps the opening
// left where each extra leg joined. Pick per pair which hoof to keep with
// `keep(hoofs)`; the other is cut off at the highest height where the two
// are still separate.
//
// The result is written in viewer units (metres, Y up, facing +Z) with
// the same Tripo-to-metre factor as split-worn-rug.mjs, so the client's
// horses line up, and compressed like the gear (webp, meshopt).
//
//   node scripts/fix-horse-legs.mjs <in.glb> <out.glb>
//   RAW=1 node scripts/fix-horse-legs.mjs <horse-wearing-gear.glb> <out.glb>
//     (Tripo units, uncompressed, as input for split-worn-rug.mjs)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptEncoder.ready;
const [SRC, DST] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
// "kuda with lightweight rug" is 88.5 Tripo units tall and is shown 2.01 m
// tall; both client horses are 98 units long, so they share this factor.
const SCALE = 2.01 / 88.5157470703125;
const doc = await io.read(SRC);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray();
let I = Array.from(prim.getIndices().getArray());
const n = P.length / 3;
const key = new Map();
const W = new Int32Array(n);
for (let v = 0; v < n; v++) {
  const k = `${P[v * 3].toFixed(4)},${P[v * 3 + 1].toFixed(4)},${P[v * 3 + 2].toFixed(4)}`;
  if (!key.has(k)) key.set(k, key.size);
  W[v] = key.get(k);
}
const ymaxTri = (t) => Math.max(P[I[t] * 3 + 1], P[I[t + 1] * 3 + 1], P[I[t + 2] * 3 + 1]);

// Components of the mesh made of triangles entirely below h.
function parts(h) {
  const par = new Int32Array(key.size).map((_, i) => i);
  const f = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  const below = [];
  for (let t = 0; t < I.length; t += 3) if (ymaxTri(t) < h) {
    below.push(t);
    par[f(W[I[t]])] = f(W[I[t + 1]]); par[f(W[I[t + 1]])] = f(W[I[t + 2]]);
  }
  return { f, below };
}
// Hooves: components below 6 units.
const low = parts(6);
const hoof = new Map();
for (const t of low.below) {
  const r = low.f(W[I[t]]);
  const c = hoof.get(r) || { v: I[t], n: 0, x: 0, z: 0 };
  c.n++; c.x += P[I[t] * 3]; c.z += P[I[t] * 3 + 2];
  hoof.set(r, c);
}
// the tail can reach the ground too: hooves are off the midline
const hooves = [...hoof.values()].filter((c) => c.n > 100 && Math.abs(c.x / c.n) > 2).map((c) => ({ v: c.v, x: c.x / c.n, z: c.z / c.n }));
console.log('hooves', hooves.map((h) => `(${h.x.toFixed(1)},${h.z.toFixed(1)})`).join(' '));
// Pair hooves on the same side that merge higher up.
const pairs = [];
const used = new Set();
for (const a of hooves) {
  if (used.has(a)) continue;
  let best = null;
  for (const b of hooves) if (b !== a && !used.has(b) && Math.sign(b.x) === Math.sign(a.x) && (!best || Math.abs(b.z - a.z) < Math.abs(best.z - a.z))) best = b;
  if (best && Math.abs(best.z - a.z) < 15) { used.add(a); used.add(best); pairs.push([a, best]); }
}
// Extra legs can also stop short of the ground (a dangling lower leg with
// no hoof): leg-sized parts under the knee or hock with nothing below
// 6 units. Each is paired with the hoof leg it grows from, which is kept.
for (const h of [16, 28]) {
  const pt = parts(h);
  const hoofRoots = new Set(hooves.map((q) => pt.f(W[q.v])));
  const stub = new Map();
  for (const t of pt.below) {
    const r = pt.f(W[I[t]]);
    if (hoofRoots.has(r)) continue;
    const c = stub.get(r) || { v: I[t], n: 0, x: 0, z: 0, ymin: Infinity };
    c.n++; c.x += P[I[t] * 3]; c.z += P[I[t] * 3 + 2];
    for (let k = 0; k < 3; k++) if (P[I[t + k] * 3 + 1] < c.ymin) { c.ymin = P[I[t + k] * 3 + 1]; c.v = I[t + k]; }
    stub.set(r, c);
  }
  for (const c of stub.values()) {
    const x = c.x / c.n, z = c.z / c.n;
    if (c.n < 100 || Math.abs(x) < 3.5 || c.ymin < 6) continue; // tail strands hang near the midline
    let best = null;
    for (const b of hooves) if (Math.sign(b.x) === Math.sign(x) && (!best || Math.abs(b.z - z) < Math.abs(best.z - z))) best = b;
    if (best && Math.abs(best.z - z) < 15 && !pairs.some(([p, q]) => (p === best || q === best) && q.stub)) pairs.push([best, { v: c.v, x, z, stub: true }]);
  }
}
let removed = 0;
const slim = [];
for (const [a, b] of pairs) {
  // Keep the rear one of a hind pair (under the hock), the front one of a
  // front pair is chosen by the forearm line: the hoof nearer the merge.
  let hm = 6;
  for (let h = 6; h < 60; h += 0.25) { const { f } = parts(h); if (f(W[a.v]) === f(W[b.v])) break; hm = h; }
  const { f, below } = parts(hm + 1.5);
  // centre of the merged leg just above the split
  let cz = 0, cn = 0;
  for (const t of below) if (f(W[I[t]]) === f(W[a.v]) && ymaxTri(t) > hm - 1) { cz += P[I[t] * 3 + 2]; cn++; }
  cz /= cn || 1;
  const hind = a.z < 0;
  const [keep, drop] = b.stub ? [a, b] : hind ? (a.z < b.z ? [a, b] : [b, a]) : (Math.abs(a.z - cz) < Math.abs(b.z - cz) ? [a, b] : [b, a]);
  const cut = parts(hm);
  const r = cut.f(W[drop.v]);
  const gone = new Set(cut.below.filter((t) => cut.f(W[I[t]]) === r));
  // kept leg axis and half depth just under the split
  const zs = [];
  for (const t of cut.below) if (cut.f(W[I[t]]) === cut.f(W[keep.v])) for (let k = 0; k < 3; k++) { const v = I[t + k]; if (P[v * 3 + 1] > hm - 3) zs.push([P[v * 3], P[v * 3 + 2]]); }
  const kz = zs.reduce((a, q) => a + q[1], 0) / zs.length;
  const kx = zs.reduce((a, q) => a + q[0], 0) / zs.length;
  const offs = zs.map((q) => Math.abs(q[1] - kz)).sort((a, b) => a - b);
  const offx = zs.map((q) => Math.abs(q[0] - kx)).sort((a, b) => a - b);
  const keepIds = new Set(); for (const t of cut.below) if (cut.f(W[I[t]]) === cut.f(W[keep.v])) for (let k = 0; k < 3; k++) keepIds.add(W[I[t + k]]);
  slim.push({ keepIds, hind, hm, kx, kz, R: offs[Math.floor(offs.length * 0.95)], Rx: offx[Math.floor(offx.length * 0.95)], mz: (keep.z + drop.z) / 2, dir: Math.sign(drop.z - keep.z), band: hind ? 10 : 9 });
  console.log(hind ? 'hind' : 'front', drop.stub ? '(short extra leg)' : '', 'split at', hm.toFixed(2), 'keep', keep.z.toFixed(1), 'drop', drop.z.toFixed(1), 'tris', gone.size);
  const next = [];
  for (let t = 0; t < I.length; t += 3) if (!gone.has(t)) next.push(I[t], I[t + 1], I[t + 2]);
  removed += gone.size;
  I = next;
}

// Above the split the leg is still two legs wide: pull the side the
// extra leg grew from back in to the kept leg's depth, fading out upward.
const pos = Float32Array.from(P);
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
for (const L of slim) {
  if (L.hind) {
    // hind: the extra leg leaves forward of the hock, pull that side back in
    for (let v = 0; v < n; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      if (y < L.hm - 2 || y > L.hm + L.band || Math.sign(x) !== Math.sign(L.kx) || Math.abs(x - L.kx) > 6) continue;
      const off = (z - L.kz) * L.dir;
      if (off <= L.R || off > L.R + 12) continue;
      const e = 1 - smooth((y - L.hm) / L.band);
      pos[v * 3 + 2] = L.kz + L.dir * (off - e * (off - L.R));
    }
    continue;
  }
  // front: the fused knee is two legs wide in both x and z. Per height
  // slice, rescale the column about its own centre so it starts at the
  // kept cannon's size and centre at the split, back to itself higher up.
  const col = [];
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if ((y >= L.hm - 0.01 || (y > L.hm - 3 && !L.keepIds.has(W[v]))) && y <= L.hm + L.band && Math.sign(x) === Math.sign(L.kx) && Math.abs(x - L.kx) < 10 && Math.abs(z - L.mz) < 11) col.push(v);
  }
  const slices = new Map();
  for (const v of col) { const k = Math.max(0, Math.floor((P[v * 3 + 1] - L.hm) / 0.5)); (slices.get(k) || slices.set(k, []).get(k)).push(v); }
  for (const [k, vs] of slices) {
    const cx = vs.reduce((a, v) => a + P[v * 3], 0) / vs.length, cz = vs.reduce((a, v) => a + P[v * 3 + 2], 0) / vs.length;
    const pct = (arr) => arr.sort((a, b) => a - b)[Math.floor(arr.length * 0.95)] || 1e-6;
    const rx = pct(vs.map((v) => Math.abs(P[v * 3] - cx))), rz = pct(vs.map((v) => Math.abs(P[v * 3 + 2] - cz)));
    const t = smooth(((k + 0.5) * 0.5) / L.band);
    const tx = L.kx + (cx - L.kx) * t, tz = L.kz + (cz - L.kz) * t;
    // only ever narrow: a thin slice (few vertices) must not blow up
    const sx = Math.min(1, (L.Rx + (rx - L.Rx) * t) / rx), sz = Math.min(1, (L.R + (rz - L.R) * t) / rz);
    for (const v of vs) { pos[v * 3] = tx + (P[v * 3] - cx) * sx; pos[v * 3 + 2] = tz + (P[v * 3 + 2] - cz) * sz; }
  }
}
prim.getAttribute('POSITION').setArray(pos);

// Cap every opening that the cuts made (boundary loops not in the source).
const edgeKey = (a, b) => `${a}_${b}`;
function boundary(idx) {
  const cnt = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = W[idx[t + k]], b = W[idx[t + (k + 1) % 3]];
    const u = a < b ? edgeKey(a, b) : edgeKey(b, a);
    cnt.set(u, (cnt.get(u) || 0) + 1);
  }
  const out = new Map(); // a -> {b, va, vb} directed as in its triangle
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const va = idx[t + k], vb = idx[t + (k + 1) % 3];
    const a = W[va], b = W[vb];
    if (cnt.get(a < b ? edgeKey(a, b) : edgeKey(b, a)) === 1) out.set(a, { b, va, vb });
  }
  return out;
}
const before = new Set(boundary(Array.from(prim.getIndices().getArray())).keys());
const bd = boundary(I);
const seen = new Set();
let caps = 0;
for (const [start] of bd) {
  if (seen.has(start) || before.has(start)) continue;
  const loop = [];
  let a = start;
  while (!seen.has(a) && bd.has(a)) { seen.add(a); const e = bd.get(a); loop.push(e.va); a = e.b; }
  if (loop.length < 3 || process.env.NOCAP) continue;
  for (let i = 1; i < loop.length - 1; i++) I.push(loop[0], loop[i + 1], loop[i]);
  caps++;
}
console.log('removed tris', removed, 'caps', caps);
prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(prim.getIndices().getBuffer()));
if (process.env.RAW) {
  // Keep Tripo units and textures, for files that go on to split-worn-rug.mjs.
  await io.write(DST, doc);
  process.exit(0);
}
const out = Float32Array.from(prim.getAttribute('POSITION').getArray(), (v) => v * SCALE);
prim.getAttribute('POSITION').setArray(out);
for (const nd of doc.getRoot().listNodes()) nd.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
const mat = doc.getRoot().listMaterials()[0];
mat.setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.7);
for (const ext of doc.getRoot().listExtensionsUsed()) if (/volume|specular/i.test(ext.extensionName)) ext.dispose();
await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 85 }), dedup(), prune());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(DST, doc);
