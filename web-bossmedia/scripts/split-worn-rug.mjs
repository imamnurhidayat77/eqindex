// Splits the client's Tripo "horse wearing a rug" GLB into two files the
// viewer can use: the horse, and the rug as its own mesh (so it can be
// recoloured and take logos). Tripo bakes horse and rug into one surface
// with one texture atlas, so the rug is found by texture colour (black
// fabric, yellow piping), cut below the collar piping and behind the tail
// hem, grown two triangle rings past the piping, and the horse coat on
// those edge triangles is hidden with an alpha mask. The horse file keeps
// every triangle that is not core rug, so nothing opens up under the edge.
//
//   node scripts/split-worn-rug.mjs <source.glb> <rug-out.glb> <horse-out.glb>
//   env COLLAR=y,z,slope (collar piping line), ZBACK (rug back edge z),
//   DUMP=1 prints the yellow piping extent per z to find them.
//   HEAD=... for the ear bonnet, BOX=... for the saddle pad (see below).
//
// Output is in viewer units: metres, Y up, facing +Z, height 2.01 like
// horse-warmblood.glb. Tuned on "kuda with lightweight rug" (Tripo units:
// height 88.5, collar piping from z 10,y 71 down to z 25,y 54, hem y ~36).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptEncoder.ready;
const [SRC, RUG_OUT, HORSE_OUT] = process.argv.slice(2);
if (!SRC || !RUG_OUT || !HORSE_OUT) throw new Error('usage: split-worn-rug.mjs <source.glb> <rug-out.glb> <horse-out.glb>');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const HEIGHT = 2.01; // horse-warmblood.glb, so framings and zones still fit
const YMIN = 26; // below this only legs
// Head gear (ear bonnet): HEAD=zmin,ymin,zbrow,ybrow keeps only black or
// white triangles behind the poll line z >= zmin above ymin, plus the
// brow band (z >= zbrow) down to ybrow. Mane, bridle and blaze stay horse.
const HEAD = process.env.HEAD ? process.env.HEAD.split(',').map(Number) : null;
// Saddle pad: BOX=z0,z1,ymin keeps black or white triangles in that band
// of the back (white piping), which leaves the mane and tail out.
const BOX = process.env.BOX ? process.env.BOX.split(',').map(Number) : null;
const RUG_LIFT = 0.0015; // m, rug drawn just off the horse's copy of the edge

// ---- classify triangles from the source
const doc = await io.read(SRC);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray();
const UV = prim.getAttribute('TEXCOORD_0').getArray();
const I = prim.getIndices().getArray();
const n = P.length / 3, T = I.length / 3;
const S = 1024;
const small = await sharp(doc.getRoot().listMaterials()[0].getBaseColorTexture().getImage()).resize(S, S).removeAlpha().raw().toBuffer();
const texel = (u, v) => {
  const x = Math.min(S - 1, Math.max(0, Math.floor(u * S))), y = Math.min(S - 1, Math.max(0, Math.floor(v * S)));
  const o = (y * S + x) * 3;
  return [small[o], small[o + 1], small[o + 2]];
};
const cls = new Uint8Array(T); // 1 fabric black, 2 piping yellow
const coatTri = new Uint8Array(T);
for (let t = 0; t < T; t++) {
  let r = 0, g = 0, b = 0;
  for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; const c = texel(UV[v * 2], UV[v * 2 + 1]); r += c[0]; g += c[1]; b += c[2]; }
  r /= 3; g /= 3; b /= 3;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  cls[t] = r > 150 && g > 130 && b < 90 ? 2 : mx < 60 && mx - mn < 25 ? 1 : 0;
  // ear bonnet: its piping is white
  if ((HEAD || BOX) && mn > 150 && mx - mn < 30) cls[t] = 2;
  coatTri[t] = (r - b > 45 && r > 70) || mn > 150 ? 1 : 0;
}
const cy = (t) => (P[I[t * 3] * 3 + 1] + P[I[t * 3 + 1] * 3 + 1] + P[I[t * 3 + 2] * 3 + 1]) / 3;
const cz = (t) => (P[I[t * 3] * 3 + 2] + P[I[t * 3 + 1] * 3 + 2] + P[I[t * 3 + 2] * 3 + 2]) / 3;

// Triangles meeting at a position (UV seams split vertices).
const vid = new Map();
const wv = new Int32Array(n);
for (let i = 0; i < n; i++) {
  const k = `${P[i * 3].toFixed(3)},${P[i * 3 + 1].toFixed(3)},${P[i * 3 + 2].toFixed(3)}`;
  if (!vid.has(k)) vid.set(k, vid.size);
  wv[i] = vid.get(k);
}
const vt = Array.from({ length: vid.size }, () => []);
for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) vt[wv[I[t * 3 + k]]].push(t);
const touches = (t, set) => [0, 1, 2].some((k) => vt[wv[I[t * 3 + k]]].some((q) => set[q]));
const allTouch = (t, set) => [0, 1, 2].every((k) => vt[wv[I[t * 3 + k]]].some((q) => set[q]));

const cand = new Uint8Array(T);
const inHead = (t) => (HEAD && cz(t) >= HEAD[0] && (cy(t) >= HEAD[1] || (cz(t) >= HEAD[2] && cy(t) >= HEAD[3])))
  || (BOX && cz(t) >= BOX[0] && cz(t) <= BOX[1] && cy(t) >= BOX[2]);
const REGION = HEAD || BOX;
for (let t = 0; t < T; t++) cand[t] = cls[t] && (REGION ? inHead(t) : cy(t) >= YMIN) ? 1 : 0;
// buckles and specks inside the fabric
for (let pass = 0; pass < 6; pass++) {
  const add = [];
  for (let t = 0; t < T; t++) if (!cand[t] && !coatTri[t] && (REGION ? inHead(t) : cy(t) >= YMIN) && allTouch(t, cand)) add.push(t);
  for (const t of add) cand[t] = 1;
}
// mane above the collar piping, tail behind the rug, black legs below the hem
const hem = {};
for (let t = 0; t < T; t++) if (cls[t] === 2 && cy(t) >= YMIN) { const z = Math.round(cz(t)); if (hem[z] == null || cy(t) < hem[z]) hem[z] = cy(t); }
// Collar piping line (Tripo units): y at z = z0, falling `slope` per unit z.
const [CY, CZ, CS] = (process.env.COLLAR || '71,10,1.13').split(',').map(Number);
const ZBACK = +(process.env.ZBACK || -49);
const collar = (z) => CY - (z - CZ) * CS;
if (process.env.DUMP) {
  const m = {};
  for (let t = 0; t < T; t++) if (cls[t] === 2 && cy(t) >= YMIN) { const z = Math.round(cz(t)); (m[z] = m[z] || []).push(cy(t)); }
  console.log(Object.keys(m).map(Number).sort((a, b) => a - b).map((z) => `${z}:${Math.min(...m[z]).toFixed(0)}-${Math.max(...m[z]).toFixed(0)}`).join(' '));
  process.exit(0);
}
for (let t = 0; t < T; t++) if (cand[t] && !REGION) {
  const z = cz(t), y = cy(t), h = hem[Math.round(z)];
  if ((z > CZ - 2 && y > collar(z) + 1.2) || z < ZBACK || (z < 20 && h != null && y < h - 1.5)) cand[t] = 0;
}
// largest connected piece is the rug
const comp = new Int32Array(T).fill(-1);
let best = -1, bestN = 0, nc = 0;
for (let s = 0; s < T; s++) if (cand[s] && comp[s] < 0) {
  const st = [s]; comp[s] = nc; let cnt = 0;
  while (st.length) {
    const t = st.pop(); cnt++;
    for (let k = 0; k < 3; k++) for (const q of vt[wv[I[t * 3 + k]]]) if (cand[q] && comp[q] < 0) { comp[q] = nc; st.push(q); }
  }
  if (cnt > bestN) { bestN = cnt; best = nc; }
  nc++;
}
const core = new Uint8Array(T);
for (let t = 0; t < T; t++) core[t] = comp[t] === best ? 1 : 0;
const rug = Uint8Array.from(core);
for (let ring = 0; ring < 2; ring++) {
  const add = [];
  for (let t = 0; t < T; t++) if (!rug[t] && (HEAD ? cz(t) >= HEAD[0] - 1 : BOX ? cz(t) >= BOX[0] - 1 && cz(t) <= BOX[1] + 1 : cz(t) >= ZBACK - 0.5) && touches(t, rug)) add.push(t);
  for (const t of add) rug[t] = 1;
}
const pick = (keep) => { const out = []; for (let t = 0; t < T; t++) if (keep(t)) out.push(I[t * 3], I[t * 3 + 1], I[t * 3 + 2]); return new Uint32Array(out); };
const rugIdx = pick((t) => rug[t]);
// The horse keeps everything but the inside of the gear: a band of gear
// triangles along every edge stays in the horse too, so where the gear's
// edge texels are hidden the horse's own copy shows, never a hole (thin
// straps are all edge).
const inner = Uint8Array.from(core);
for (let ring = 0; ring < 3; ring++) {
  const drop = [];
  for (let t = 0; t < T; t++) if (inner[t]) for (let k = 0; k < 3; k++) if (vt[wv[I[t * 3 + k]]].some((q) => !inner[q])) { drop.push(t); break; }
  for (const t of drop) inner[t] = 0;
}
const horseIdx = pick((t) => !inner[t]);
console.log('tris', T, 'rug', rugIdx.length / 3, 'horse', horseIdx.length / 3);

// ---- write one part
async function writePart(indices, dst, { lift = 0, maskCoat = false, tex }) {
  const d = await io.read(SRC);
  const pr = d.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos = Float32Array.from(pr.getAttribute('POSITION').getArray());
  const nor = pr.getAttribute('NORMAL').getArray();
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 1; i < pos.length; i += 3) { ymin = Math.min(ymin, pos[i]); ymax = Math.max(ymax, pos[i]); }
  const s = HEIGHT / (ymax - ymin);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = pos[i] * s + nor[i] * lift;
    pos[i + 1] = (pos[i + 1] - ymin) * s + nor[i + 1] * lift;
    pos[i + 2] = pos[i + 2] * s + nor[i + 2] * lift;
  }
  pr.getAttribute('POSITION').setArray(pos);
  pr.setIndices(d.createAccessor().setType('SCALAR').setArray(indices).setBuffer(pr.getIndices().getBuffer()));
  for (const nd of d.getRoot().listNodes()) nd.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  const mat = d.getRoot().listMaterials()[0];
  // The viewer sets its own roughness; the 4K roughness map is 12 MB.
  mat.setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.9);
  for (const ext of d.getRoot().listExtensionsUsed()) if (/volume|specular/i.test(ext.extensionName)) ext.dispose();
  if (maskCoat) {
    const baseTex = mat.getBaseColorTexture();
    const R = 2048;
    const img = await sharp(baseTex.getImage()).resize(R, R).removeAlpha().raw().toBuffer();
    const rgba = Buffer.alloc(R * R * 4);
    for (let i = 0; i < R * R; i++) { rgba[i * 4] = img[i * 3]; rgba[i * 4 + 1] = img[i * 3 + 1]; rgba[i * 4 + 2] = img[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
    const coat = (r, g, b) => r > 60 && r - b > 40 && g < 0.82 * r;
    let hidden = 0;
    for (let k = 0; k < indices.length; k += 3) {
      const u = [0, 1, 2].map((j) => UV[indices[k + j] * 2] * R), v = [0, 1, 2].map((j) => UV[indices[k + j] * 2 + 1] * R);
      const x0 = Math.max(0, Math.floor(Math.min(...u)) - 1), x1 = Math.min(R - 1, Math.ceil(Math.max(...u)) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(...v)) - 1), y1 = Math.min(R - 1, Math.ceil(Math.max(...v)) + 1);
      const det = (u[1] - u[0]) * (v[2] - v[0]) - (u[2] - u[0]) * (v[1] - v[0]);
      if (Math.abs(det) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const a = ((u[1] - px) * (v[2] - py) - (u[2] - px) * (v[1] - py)) / det;
        const b = ((u[2] - px) * (v[0] - py) - (u[0] - px) * (v[2] - py)) / det;
        if (a < -0.02 || b < -0.02 || 1 - a - b < -0.02) continue;
        const o = (y * R + x) * 4;
        if (rgba[o + 3] && coat(rgba[o], rgba[o + 1], rgba[o + 2])) { rgba[o + 3] = 0; hidden++; }
      }
    }
    console.log(dst, 'coat texels hidden', hidden);
    baseTex.setImage(await sharp(rgba, { raw: { width: R, height: R, channels: 4 } }).png().toBuffer()).setMimeType('image/png');
    mat.setAlphaMode('MASK').setAlphaCutoff(0.5);
  }
  compactPrimitive(pr); // drop the vertices the other part uses
  await d.transform(
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 85 }),
    dedup(),
    prune(),
  );
  // Same as fit-horse-gear.mjs: meshopt streams, no quantization, so the
  // viewer reads raw float positions.
  d.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(dst, d);
  console.log('wrote', dst, 'tris', indices.length / 3);
}

await writePart(rugIdx, RUG_OUT, { lift: RUG_LIFT, maskCoat: true, tex: 1024 });
await writePart(horseIdx, HORSE_OUT, { tex: 2048 });
