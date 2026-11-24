// Shrinks the merch GLBs for web delivery (run once per new source model):
//   node scripts/optimize-models.mjs [srcDir] [outDir]
// Defaults to public/models in place. Already-optimized files (WebP
// textures) are skipped, so re-running is safe.
//
// Per product model:
// - drops the metallic/roughness texture and KHR_materials_specular/volume:
//   Merch3D/HorseGear force metalness 0 / roughness 0.9 anyway, so those
//   maps were downloaded and thrown away
// - base colour max 2048px, normal map max 1024px, both WebP
// - simplifies very dense meshes towards TARGET_TRIS (UV seams locked)
// - float geometry kept as authored units (see the note at the transform)
// The display horse keeps its own material, only textures + geometry shrink.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = path.resolve(process.argv[2] || 'public/models');
const OUT = path.resolve(process.argv[3] || SRC);

// Triangle targets: rider tops/cap already sit near 19k and look right at
// preview size, so heavier generator outputs come down to that range.
// The horse is the hero of the gear view, so it keeps far more detail
// (source: Grab3D full tier, 731k tris, 4K maps incl. a normal map).
const TARGET_TRIS = { 'horse-warmblood.glb': 120000, default: 30000 };

function triangleCount(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      n += Math.floor((idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3);
    }
  }
  return n;
}

// The scan is a lean, leggy type; show-jumping warmbloods carry more body.
// Widen the barrel and deepen the girth (legs get a little shorter at the
// top, the head, ears and hooves stay where they are so gear anchored on
// them keeps its place). Horse space: head +z, ground y 0.
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function shapeHorse(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const acc = prim.getAttribute('POSITION');
      const a = acc.getArray().slice();
      for (let i = 0; i < a.length; i += 3) {
        const x = a[i];
        const y = a[i + 1];
        const z = a[i + 2];
        // Body span along the horse: chest to buttocks, fading out into
        // the neck/head and the tail.
        const wz = smooth(-1.08, -0.88, z) * (1 - smooth(0.5, 0.78, z));
        // Full width on the body, a third on the legs.
        const wy = 0.35 + 0.65 * smooth(0.55, 0.85, y);
        a[i] = x * (1 + 0.12 * wz * wy);
        // Deeper girth: drop the underline most at the belly, nothing at the
        // back or below the elbows/stifles.
        const down = y >= 0.86 ? 1 - smooth(0.86, 1.2, y) : smooth(0.6, 0.86, y);
        const wb = smooth(-0.95, -0.75, z) * (1 - smooth(0.42, 0.62, z));
        a[i + 1] = y - 0.05 * down * wb;
      }
      acc.setArray(a);
      smoothNormals(prim, a);
    }
  }
}

// Area-weighted vertex normals, shared across UV seams by position, written
// in place. gltf-transform's normals() unwelds into flat normals, which
// doubled the horse file and faceted the coat.
function smoothNormals(prim, a) {
  const nAcc = prim.getAttribute('NORMAL');
  const idx = prim.getIndices()?.getArray();
  if (!nAcc || !idx) return;
  const key = new Map();
  const id = new Int32Array(a.length / 3);
  for (let v = 0; v < id.length; v++) {
    const k = `${a[v * 3].toFixed(5)},${a[v * 3 + 1].toFixed(5)},${a[v * 3 + 2].toFixed(5)}`;
    if (!key.has(k)) key.set(k, key.size);
    id[v] = key.get(k);
  }
  const acc = new Float64Array(key.size * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const [i, j, k] = [idx[t], idx[t + 1], idx[t + 2]];
    const ux = a[j * 3] - a[i * 3], uy = a[j * 3 + 1] - a[i * 3 + 1], uz = a[j * 3 + 2] - a[i * 3 + 2];
    const vx = a[k * 3] - a[i * 3], vy = a[k * 3 + 1] - a[i * 3 + 1], vz = a[k * 3 + 2] - a[i * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [i, j, k]) {
      acc[id[v] * 3] += nx; acc[id[v] * 3 + 1] += ny; acc[id[v] * 3 + 2] += nz;
    }
  }
  const n = nAcc.getArray().slice();
  for (let v = 0; v < id.length; v++) {
    const o = id[v] * 3;
    const l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1;
    n[v * 3] = acc[o] / l; n[v * 3 + 1] = acc[o + 1] / l; n[v * 3 + 2] = acc[o + 2] / l;
  }
  nAcc.setArray(n);
}

async function optimize(file, io) {
  const rel = path.relative(SRC, file);
  const doc = await io.read(file);
  const used = doc.getRoot().listExtensionsUsed().map((e) => e.extensionName);
  if (used.includes('EXT_texture_webp')) {
    console.log(`skip ${rel} (already optimized)`);
    return;
  }
  const isHorse = path.basename(file) === 'horse-warmblood.glb';
  const before = fs.statSync(file).size;
  const trisBefore = triangleCount(doc);

  if (!isHorse) {
    for (const mat of doc.getRoot().listMaterials()) {
      const mr = mat.getMetallicRoughnessTexture();
      mat.setMetallicRoughnessTexture(null);
      if (mr) mr.dispose();
      mat.setMetallicFactor(0);
      mat.setRoughnessFactor(0.9);
    }
    for (const ext of doc.getRoot().listExtensionsUsed()) {
      if (['KHR_materials_specular', 'KHR_materials_volume'].includes(ext.extensionName)) ext.dispose();
    }
  }

  await doc.transform(dedup(), prune(), weld());

  const target = TARGET_TRIS[path.basename(file)] || TARGET_TRIS.default;
  const tris = triangleCount(doc);
  if (tris > target * 1.1) {
    await doc.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: target / tris, error: 0.0008, lockBorder: true }),
      prune(),
    );
  }

  if (isHorse) {
    shapeHorse(doc);
  }

  // Normals (and the horse's spare map) stay smaller: at preview distance
  // the weave reads the same at 1024px.
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColorTexture$/, resize: [2048, 2048], quality: 85 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!baseColorTexture$).*/, resize: isHorse ? [2048, 2048] : [1024, 1024], quality: 90 }),
  );
  // No meshopt/quantization on purpose: quantized positions move into the
  // node transform, but Merch3D/HorseGear read the raw mesh geometry (bbox
  // normalization, cap rays, gear raycasts in asset units). Float geometry
  // keeps those numbers valid; textures were the real weight anyway.

  const outFile = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await io.write(outFile, doc);
  const after = fs.statSync(outFile).size;
  console.log(`${rel}: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(2)} MB, ${trisBefore} -> ${triangleCount(doc)} tris`);
}

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = fs.readdirSync(SRC, { recursive: true })
  .map((f) => path.join(SRC, String(f)))
  .filter((f) => f.endsWith('.glb') && !f.includes('-template'));
for (const f of files) await optimize(f, io);
