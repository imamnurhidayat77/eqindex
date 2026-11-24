// Tripo sometimes gives a worn ear bonnet a second pair of ear socks (the
// same way it doubles legs). This cuts the extra pair off the split gear
// file by collapsing it onto its base. Gear file in metres, horse faces +z, y up.
//   EARS=yBase,yTip node scripts/drop-extra-ears.mjs in.glb out.glb
// yTip: height where the four sock tops are still apart. yBase: where the
// socks meet the cap. The front ear on each side is the extra one.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const [src, dst] = process.argv.slice(2);
const [yBase, yTip] = (process.env.EARS || '1.86,1.94').split(',').map(Number);

const doc = await io.read(src);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray();
const n = P.length / 3;
// Weld by position: UV seams split vertices that share a point.
const W = new Int32Array(n);
const byKey = new Map();
for (let i = 0; i < n; i++) {
  const k = `${P[i * 3].toFixed(5)},${P[i * 3 + 1].toFixed(5)},${P[i * 3 + 2].toFixed(5)}`;
  if (!byKey.has(k)) byKey.set(k, i);
  W[i] = byKey.get(k);
}
const idx = Array.from(prim.getIndices().getArray());
const nb = new Map();
const link = (a, b) => { if (!nb.has(a)) nb.set(a, []); nb.get(a).push(b); };
for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
  link(W[idx[t + k]], W[idx[t + (k + 1) % 3]]);
  link(W[idx[t + (k + 1) % 3]], W[idx[t + k]]);
}
// Split the ear sock tops (everything above yTip) into connected pieces,
// one per ear. Then grow all ears at once, breadth first, down to yBase,
// so each vertex of the sock belongs to the ear that reaches it first.
// A plain z cut ate the front of the real ears, which lean forward.
const comp = new Map();
let nComp = 0;
for (let i = 0; i < n; i++) {
  const w = W[i];
  if (w !== i || comp.has(w) || P[w * 3 + 1] <= yTip) continue;
  const st = [w];
  comp.set(w, nComp);
  while (st.length) {
    const v = st.pop();
    for (const u of nb.get(v) || []) if (!comp.has(u) && P[u * 3 + 1] > yTip) { comp.set(u, nComp); st.push(u); }
  }
  nComp++;
}
const tips = Array.from({ length: nComp }, () => ({ m: 0, x: 0, z: 0, v: 0 }));
for (const [v, c] of comp) { const t = tips[c]; t.m++; t.x += P[v * 3]; t.z += P[v * 3 + 2]; }
tips.forEach((t) => { t.x /= t.m; t.z /= t.m; });
console.log('ear tops', tips.map((t) => `${t.m}@x${t.x.toFixed(3)},z${t.z.toFixed(3)}`).join(' '));
// The extra ear on each side is the top whose centre lies furthest forward.
const big = tips.map((t, i) => i).filter((i) => tips[i].m > 20);
const drop = new Set();
for (const side of [1, -1]) {
  const s2 = big.filter((i) => Math.sign(tips[i].x) === side).sort((p, q) => tips[q].z - tips[p].z);
  if (s2.length > 1) drop.add(s2[0]);
}
const label = new Map(comp);
let front = Array.from(comp.keys());
while (front.length) {
  const next = [];
  for (const v of front) for (const u of nb.get(v) || []) {
    if (label.has(u) || P[u * 3 + 1] <= yBase) continue;
    label.set(u, label.get(v));
    next.push(u);
  }
  front = next;
}
const ear = new Set();
for (const [v, c] of label) if (drop.has(c)) ear.add(v);
// Collapse each ear onto the centre of its base ring. The sock triangles
// keep their own UVs (cap black), so the closed base reads as part of the
// cap. A cut and fan cap took colour from the coat island of the atlas.
const ring = new Set();
for (const v of ear) for (const u of nb.get(v) || []) if (!ear.has(u)) ring.add(u);
const centre = (side) => {
  const c = [0, 0, 0];
  let m = 0;
  for (const v of ring) if (Math.sign(P[v * 3]) === side) { for (let k = 0; k < 3; k++) c[k] += P[v * 3 + k]; m++; }
  return c.map((x) => x / m);
};
const C = { 1: centre(1), '-1': centre(-1) };
const out = Float32Array.from(P);
let moved = 0;
for (let i = 0; i < n; i++) {
  if (!ear.has(W[i])) continue;
  const c = C[Math.sign(P[i * 3])];
  out.set(c, i * 3);
  moved++;
}
prim.getAttribute('POSITION').setArray(out);
const I = [];
let removed = 0;
// Drop the triangles that collapsed to nothing.
for (let t = 0; t < idx.length; t += 3) {
  if (ear.has(W[idx[t]]) && ear.has(W[idx[t + 1]]) && ear.has(W[idx[t + 2]])) { removed++; continue; }
  I.push(idx[t], idx[t + 1], idx[t + 2]);
}
const caps = Object.keys(C).length;
console.log('ear vertices', ear.size, 'ring', ring.size, 'moved', moved, 'removed tris', removed, 'ears', caps);
prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(prim.getIndices().getBuffer()));
compactPrimitive(prim);
await doc.transform(prune());
doc.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(dst, doc);
console.log('wrote', dst);
