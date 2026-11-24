// Fits the client's Tripo gear GLBs (warm-rug, lightweight-rug, saddle-pad,
// ear-bonnet in models-src/horse) onto the client's horse (horse-client.glb) and writes
// *-studio.glb into public/models/horse. The product view renders these,
// so the buyer sees the client's own design everywhere.
//   node scripts/fit-horse-gear.mjs
// Rugs and pad keep their authored shape: one smooth per-slice scale (length
// to the horse, top line onto the horse's back, width to the barrel), then
// a smoothed push-out so no vertex sits inside the horse. No per-vertex
// unwrapping, so straps, buckles and piping stay as modelled. The bonnet is
// matched on the ear tips, then pushed clear of the head the same way.
// Output is simplified and texture-shrunk to keep the files light.
// Re-run whenever a source gear GLB or the horse changes.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, textureCompress } from '@gltf-transform/functions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { drape } from './drape.mjs';
import { tuckEars, CLIENT_EARS } from '../lib/horse-ears.mjs';
THREE.Mesh.prototype.raycast = acceleratedRaycast;
await MeshoptSimplifier.ready;
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;

const DIR = process.env.GEAR_DIR || 'public/models/horse';
const OUT = process.env.GEAR_OUT || DIR;
// Raw Tripo gear sources live outside public/ so they are not served.
const SRC = process.env.GEAR_SRC || 'models-src/horse';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

async function loadMesh(file) {
  const doc = await io.read(file);
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(prim.getAttribute('POSITION').getArray()), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(prim.getIndices().getArray()), 1));
  return { doc, prim, g };
}

// The client's own Tripo horse (scripts/fix-horse-legs.mjs).
const HORSE = process.env.GEAR_HORSE || 'horse-client.glb';
const H = await loadMesh(`${DIR}/${HORSE}`);
H.g.boundsTree = new MeshBVH(H.g);
const horse = new THREE.Mesh(H.g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
const rc = new THREE.Raycaster();
rc.firstHitOnly = true;
function hit(o, d, far = 10) {
  rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize());
  rc.far = far;
  return rc.intersectObject(horse, false)[0] || null;
}

// Horse top line and upper-barrel half width per z (cm steps), smoothed.
function table(z0, z1, f) {
  const zs = [];
  for (let z = z0; z <= z1 + 1e-9; z += 0.01) zs.push(z);
  let v = zs.map(f);
  // fill gaps from neighbours, then box-smooth
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < v.length; i++) if (v[i] == null) v[i] = v[i - 1] ?? v.find((x) => x != null);
  const sm = (arr, r) => arr.map((_, i) => {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) { const x = arr[i + k]; if (x != null) { s += x; n++; } }
    return s / n;
  });
  v = sm(sm(v, 4), 4);
  return (z) => {
    const t = (Math.min(z1, Math.max(z0, z)) - z0) / 0.01;
    const i = Math.min(v.length - 2, Math.floor(t));
    return v[i] + (v[i + 1] - v[i]) * (t - i);
  };
}
if (process.env.MEASURE) {
  for (let z = -1.1; z <= 1.1; z += 0.1) console.log('z', z.toFixed(1), 'top', hit([0, 3, z], [0, -1, 0])?.point.y.toFixed(3));
}
const topY = table(-1.2, 0.9, (z) => hit([0, 3, z], [0, -1, 0])?.point.y ?? null);
const barrelW = table(-1.2, 0.9, (z) => {
  const t = topY(z);
  let w = 0;
  for (let y = t - 0.5; y <= t - 0.04; y += 0.02) {
    const h = hit([1.5, y, z], [-1, 0, 0]);
    if (h && h.point.x > 0) w = Math.max(w, h.point.x);
  }
  return w || null;
});

// Signed clearance of a point from the horse: closest surface point, inside
// decided by an up ray hitting an odd number of times.
const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
const ray = new THREE.Raycaster();
function inside(p) {
  ray.set(p, new THREE.Vector3(0, 1, 0));
  ray.firstHitOnly = false;
  ray.far = 5;
  return horse.raycast ? ray.intersectObject(horse, false).length % 2 === 1 : false;
}

// Push every vertex at least `off` clear of the horse. The push is spread
// over a spatial grid (max per cell, then a soft blur) so both faces of the
// cloth move together and the surface stays smooth.
function pushOut(pos, { off, cell = 0.02, blur = 2, maxPush = 0.12, mask = null, sideways = false }) {
  const n = pos.length / 3;
  const p = new THREE.Vector3();
  const grid = new Map();
  const key = (a, b, c) => `${a},${b},${c}`;
  for (let i = 0; i < n; i++) {
    if (mask && !mask[i]) continue;
    p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    H.g.boundsTree.closestPointToPoint(p, target);
    const dist = target.distance;
    const ins = dist < 0.3 && inside(p);
    const need = ins ? dist + off : Math.max(0, off - dist);
    if (need <= 0 || need > maxPush) continue;
    // Sideways: cloth hanging off the back only moves out from the spine
    // plane, which keeps quilting lines straight.
    const dir = sideways ? new THREE.Vector3(Math.sign(p.x) || 1, 0, 0)
      : ins ? target.point.clone().sub(p) : p.clone().sub(target.point);
    if (dir.lengthSq() < 1e-12) continue;
    dir.normalize();
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
    const cur = grid.get(k);
    if (!cur) grid.set(k, { need, dir: dir.clone().multiplyScalar(need) });
    else { cur.need = Math.max(cur.need, need); cur.dir.addScaledVector(dir, need); }
  }
  let moved = 0;
  for (let i = 0; i < n; i++) {
    if (mask && !mask[i]) continue;
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = 0;
    const d = new THREE.Vector3();
    for (let a = -blur; a <= blur; a++) for (let b = -blur; b <= blur; b++) for (let c = -blur; c <= blur; c++) {
      const g = grid.get(key(cx + a, cy + b, cz + c));
      if (!g) continue;
      const fall = 1 - Math.hypot(a, b, c) / (blur + 1);
      if (fall <= 0) continue;
      const v = g.need * fall;
      if (v > best) best = v;
      d.addScaledVector(g.dir, fall);
    }
    if (best <= 0 || d.lengthSq() < 1e-12) continue;
    d.normalize().multiplyScalar(best);
    pos[i * 3] += d.x; pos[i * 3 + 1] += d.y; pos[i * 3 + 2] += d.z;
    moved++;
  }
  return moved;
}

// Source slice tables (rug top line, mid-height half width) in source units.
function sourceTables(P, bins = 40) {
  const n = P.length / 3;
  let zmin = Infinity, zmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) {
    zmin = Math.min(zmin, P[i * 3 + 2]); zmax = Math.max(zmax, P[i * 3 + 2]);
    ymin = Math.min(ymin, P[i * 3 + 1]); ymax = Math.max(ymax, P[i * 3 + 1]);
  }
  const top = new Array(bins).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    const b = Math.min(bins - 1, Math.floor(((P[i * 3 + 2] - zmin) / (zmax - zmin)) * bins));
    top[b] = Math.max(top[b], P[i * 3 + 1]);
  }
  const wid = new Array(bins).fill(0);
  for (let i = 0; i < n; i++) {
    const b = Math.min(bins - 1, Math.floor(((P[i * 3 + 2] - zmin) / (zmax - zmin)) * bins));
    const y = P[i * 3 + 1];
    const depth = top[b] - ymin;
    if (y < top[b] - 0.55 * depth || y > top[b] - 0.25 * depth) continue;
    wid[b] = Math.max(wid[b], Math.abs(P[i * 3]));
  }
  const sm = (arr) => arr.map((_, i) => {
    let s = 0, c = 0;
    for (let k = -2; k <= 2; k++) { const x = arr[i + k]; if (x != null && Number.isFinite(x) && x > -Infinity) { s += x; c++; } }
    return s / c;
  });
  const T = sm(sm(top));
  const W = sm(sm(wid.map((w) => w || null)));
  const at = (arr, z) => {
    const t = Math.min(bins - 1, Math.max(0, ((z - zmin) / (zmax - zmin)) * bins - 0.5));
    const i = Math.min(bins - 2, Math.floor(t));
    return arr[i] + (arr[i + 1] - arr[i]) * (t - i);
  };
  return { zmin, zmax, ymin, top: (z) => at(T, z), wid: (z) => at(W, z) };
}

// Smooth normals shared across UV seams (vertices at the same position),
// so the refitted cloth does not show seam creases.
function seamlessNormals(pos, idx) {
  const n = pos.length / 3;
  const key = new Map();
  const id = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    if (!key.has(k)) key.set(k, key.size);
    id[i] = key.get(k);
  }
  const acc = new Float32Array(key.size * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const [i0, i1, i2] = [idx[t], idx[t + 1], idx[t + 2]];
    a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
    const f = b.sub(a).cross(c.sub(a)); // area weighted
    for (const v of [i0, i1, i2]) { acc[id[v] * 3] += f.x; acc[id[v] * 3 + 1] += f.y; acc[id[v] * 3 + 2] += f.z; }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = acc[id[i] * 3], y = acc[id[i] * 3 + 1], z = acc[id[i] * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  return out;
}

async function writeLight(doc, prim, pos, dst, { tris, tex, nor = null, error = 0.002, doubleSided = false }) {
  // Draped cloth can fold so a patch of the outer face ends up under the
  // inner face; drawing both sides shows fabric there instead of the horse.
  if (doubleSided) for (const m of doc.getRoot().listMaterials()) m.setDoubleSided(true);
  const P = prim.getAttribute('POSITION');
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(P.getBuffer()));
  const normals = nor || seamlessNormals(pos, prim.getIndices().getArray());
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(P.getBuffer()));
  for (const nd of doc.getRoot().listNodes()) nd.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  const count = prim.getIndices().getCount() / 3;
  const steps = [weld()];
  if (tris < count) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: tris / count, error, lockBorder: true }));
  await doc.transform(
    ...steps,
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 85 }),
    dedup(),
    prune(),
  );
  // Meshopt stream compression without quantization: the app reads the
  // raw float positions (no node transform), drei decodes it by default.
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(dst, doc);
  const p2 = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  console.log('wrote', dst, 'tris', p2.getIndices().getCount() / 3);
}

// Product view (no horse): the client's file exactly as modelled, only
// turned to face +Z, uniformly scaled and centred where the fitted piece
// sits, so it frames like the horse view. Authored normals are kept.
async function writeStudio(name, { rotY = 0, scale, center, tex = 1024, dst }) {
  const G = await loadMesh(`${SRC}/${name}.glb`);
  const N = G.prim.getAttribute('NORMAL').getArray();
  const S = G.g.attributes.position.array;
  const c = Math.cos(rotY), sn = Math.sin(rotY);
  const pos = new Float32Array(S.length);
  const nor = new Float32Array(S.length);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < S.length / 3; i++) {
    const x = S[i * 3], z = S[i * 3 + 2];
    pos[i * 3] = (x * c + z * sn) * scale;
    pos[i * 3 + 1] = S[i * 3 + 1] * scale;
    pos[i * 3 + 2] = (-x * sn + z * c) * scale;
    const nx = N[i * 3], nz = N[i * 3 + 2];
    nor[i * 3] = nx * c + nz * sn; nor[i * 3 + 1] = N[i * 3 + 1]; nor[i * 3 + 2] = -nx * sn + nz * c;
    box.expandByPoint(v.fromArray(pos, i * 3));
  }
  const mid = box.getCenter(new THREE.Vector3());
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] += center[0] - mid.x; pos[i + 1] += center[1] - mid.y; pos[i + 2] += center[2] - mid.z;
  }
  await writeLight(G.doc, G.prim, pos, `${OUT}/${dst}`, { tris: Infinity, tex, nor });
}
const centreOf = (pos) => {
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 3) b.expandByPoint(v.fromArray(pos, i));
  return { c: b.getCenter(new THREE.Vector3()).toArray(), size: b.getSize(new THREE.Vector3()) };
};

// ---- Rugs and pad.
async function fitWear(name, { rotY = 0, z0, z1, sy, gap, off, cap = 9, shoulder = 0.35, cell = 0.02, blur = 2, sideways = false, tris = 20000, tex = 1024, studio, cloth = null, studioOnly = false }) {
  const G = await loadMesh(`${SRC}/${name}.glb`);
  if (rotY) G.g.rotateY(rotY);
  const S = G.g.attributes.position.array;
  const src = sourceTables(S);
  const out = new Float32Array(S.length);
  for (let i = 0; i < S.length / 3; i++) {
    const x = S[i * 3], y = S[i * 3 + 1], z = S[i * 3 + 2];
    const zh = z0 + ((z - src.zmin) / (src.zmax - src.zmin)) * (z1 - z0);
    // Ahead of the shoulder the cloth stays shoulder-wide and wraps the
    // chest instead of following the narrow neck.
    const w = Math.max(barrelW(zh), barrelW(Math.min(zh, shoulder)));
    const sx = (w + gap) / Math.max(1e-6, src.wid(z));
    out[i * 3] = x * sx;
    // The collar sits at the base of the neck: the top line is capped so
    // the front does not climb the crest.
    out[i * 3 + 1] = Math.min(cap, topY(zh)) + off + (y - src.top(z)) * sy;
    out[i * 3 + 2] = zh;
  }
  const rest = Float32Array.from(out);
  for (let k = 0; k < (process.env.NOPUSH ? 0 : 3); k++) console.log(name, 'push', k, pushOut(out, { off, cell, blur, sideways }));
  const { c, size } = centreOf(out);
  // Let it settle under gravity on the horse (see drape.mjs).
  const worn = cloth && !process.env.NODRAPE
    ? drape(out, G.prim.getIndices().getArray(), H.g, {
      rest, off, ...cloth, log: (t) => console.log(name, t),
      // Straps hang below the hem in the middle of the source rug.
      pull: cloth.straps ? Uint8Array.from({ length: S.length / 3 }, (_, i) => S[i * 3 + 1] < cloth.straps.y && Math.abs(S[i * 3 + 2]) < cloth.straps.z) : null,
    })
    : out;
  if (worn !== out) for (let k = 0; k < 2; k++) console.log(name, 'settle push', k, pushOut(worn, { off: off * 1.2, cell, blur: 3, sideways }));
  if (!studioOnly) await writeLight(G.doc, G.prim, worn, `${OUT}/${name}-on-horse.glb`, { tris, tex, doubleSided: worn !== out });
  await writeStudio(name, { rotY, scale: size.z / (src.zmax - src.zmin), center: c, tex, dst: studio });
}

// ---- Ear bonnet: the socks are moved over the horse's ears as they are
// (no push, so they stay clean cones), the cap is narrowed to the head and
// pushed clear of it. Sock tips (x +/-35, y 97.6, z -2 src) land on
// (+/-earX, atY, atZ) raised by `lift`.
async function fitBonnet({ studioOnly = false, atY = 2.01, atZ = 0.951, scale, capX = 1, earX, earDz = 0, earS = 1, tilt = 0, earTilt = 0, lift, off, tris = 20000, tex = 1024 }) {
  const G = await loadMesh(`${SRC}/ear-bonnet.glb`);
  const S = G.g.attributes.position.array;
  const n = S.length / 3;
  const W = new Float32Array(n);
  const e = (earTilt * Math.PI) / 180;
  // Socks lean forward about their base (src y 62, z -9).
  const rot = (y, z, ang) => {
    const dy = y - 62, dz = z + 9;
    return [62 + dy * Math.cos(ang) - dz * Math.sin(ang), -9 + dz * Math.cos(ang) + dy * Math.sin(ang)];
  };
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, (S[i * 3 + 1] - 55) / 13));
    W[i] = t * t * (3 - 2 * t);
    if (W[i] > 0) {
      const [ny, nz] = rot(S[i * 3 + 1], S[i * 3 + 2], e * W[i]);
      S[i * 3 + 1] = ny; S[i * 3 + 2] = nz;
    }
  }
  const [tipY, tipZ] = rot(97.6, -2, e);
  const a = (tilt * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const out = new Float32Array(S.length);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = S[i * 3];
    const w = W[i];
    const dy = (S[i * 3 + 1] - tipY) * scale;
    const dz = (S[i * 3 + 2] - tipZ) * scale;
    // Cap: narrowed to the head. Socks: true size, centred on the ears.
    const xCap = x * scale * capX;
    const xEar = Math.sign(x) * (earX + (Math.abs(x) - 35) * scale * earS);
    out[i * 3] = xCap * (1 - w) + xEar * w;
    out[i * 3 + 1] = atY + lift + dy * ca - dz * sa;
    out[i * 3 + 2] = atZ + dz * ca + dy * sa + earDz * w;
    mask[i] = w < 0.5 ? 1 : 0;
  }
  const rest = Float32Array.from(out);
  for (let k = 0; k < 3; k++) console.log('bonnet push', k, pushOut(out, { off, cell: 0.01, blur: 3, maxPush: 0.06, mask }));
  // Settle the cap on the head under gravity; the socks stay as modelled.
  // Collides with the horse as shown while the bonnet is worn (ears tucked).
  let worn = out;
  if (process.env.BONNET_DRAPE) {
    const tucked = H.g.clone();
    tucked.setAttribute('position', new THREE.BufferAttribute(tuckEars(H.g.attributes.position.array, CLIENT_EARS), 3));
    tucked.boundsTree = new MeshBVH(tucked);
    worn = drape(out, G.prim.getIndices().getArray(), tucked, {
      rest, off, cell: 0.012, steps: 200, pinned: Uint8Array.from(mask, (v) => 1 - v), log: (t) => console.log('bonnet', t),
    });
  }
  if (!studioOnly) await writeLight(G.doc, G.prim, worn, `${OUT}/ear-bonnet-on-horse.glb`, { tris, tex });
  await writeStudio('ear-bonnet', { scale, center: centreOf(out).c, tex, dst: 'ear-bonnet-studio.glb' });
}

const only = process.argv[2];
// Tuned on horse-client.glb: croup peak z -0.65 y 1.33, withers dip z -0.15
// y 1.26, tail root z -1.05, ears merge into the poll at y 1.645 (x +/-0.08,
// z 0.84) with tips at y 1.70. The client's ears are shorter than the
// socks, so the sock tips sit a sock length above the poll.
// All gear on the horse comes from the client's own Tripo "horse wearing
// it" files (fix-horse-legs.mjs RAW=1, then split-worn-rug.mjs); only the
// product views (no horse) are made here.
if (!only || only === 'warm-rug') await fitWear('warm-rug', { studio: 'warm-rug-studio.glb', studioOnly: true, z0: -1.03, z1: 0.62, cap: 1.49, sy: 0.0094, gap: 0.045, off: 0.014 });
if (!only || only === 'lightweight-rug') await fitWear('lightweight-rug', { studio: 'lightweight-rug-studio.glb', studioOnly: true, z0: -1.03, z1: 0.62, cap: 1.49, sy: 0.0094, gap: 0.04, off: 0.01 });
if (!only || only === 'saddle-pad') await fitWear('saddle-pad', { studio: 'saddle-pad-studio.glb', studioOnly: true, rotY: -Math.PI / 2, z0: -0.52, z1: 0.16, sy: 0.0062, gap: 0.055, off: 0.011, cell: 0.02, blur: 3, sideways: true });
if (!only || only === 'ear-bonnet') await fitBonnet({ studioOnly: true, atY: 1.74, atZ: 0.86, scale: 0.0028, capX: 0.72, earX: 0.086, earS: 1.15, earDz: 0.04, tilt: 8, earTilt: 26, lift: 0, off: 0.014 });
