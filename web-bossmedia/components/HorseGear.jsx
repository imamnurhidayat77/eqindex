'use client';
import { Suspense, createContext, useContext, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { slotFrame } from '../lib/merch.mjs';
import { faceExtent, LogoPatch, facePlacement, recolorFabric, useValidLogos } from './MerchDecals';

// Measured from horse-warmblood.glb (bbox spine sampling, |x| < 0.12):
// centreline top height of the back/neck by z. Horse faces +Z, Y-up, metres.
const SPINE = [
  [-1.2, 1.21], [-1.1, 1.345], [-1.0, 1.382], [-0.9, 1.417], [-0.8, 1.461],
  [-0.7, 1.471], [-0.6, 1.47], [-0.5, 1.46], [-0.4, 1.434], [-0.3, 1.408],
  [-0.2, 1.395], [-0.1, 1.397], [0.0, 1.446], [0.1, 1.515], [0.2, 1.587],
  [0.3, 1.686], [0.4, 1.765], [0.5, 1.829], [0.6, 1.88], [0.7, 1.911],
];
function spineY(z) {
  if (z <= SPINE[0][0]) return SPINE[0][1];
  for (let i = 1; i < SPINE.length; i++) {
    if (z <= SPINE[i][0]) {
      const [z0, y0] = SPINE[i - 1];
      const [z1, y1] = SPINE[i];
      return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
    }
  }
  return SPINE[SPINE.length - 1][1];
}

function shade(hex, amt) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const cl = (v) => Math.max(0, Math.min(255, v + amt));
  const r = cl((n >> 16) & 255), g = cl((n >> 8) & 255), b = cl(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Quilted pad fabric in the buyer's colour: diamond stitching, darker
// binding border with a gold accent line, subtle weave noise.
function makeQuiltTexture(color, { diamonds = 7, binding = 0.09 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 512);
  // weave noise
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // diamond stitching
  g.strokeStyle = 'rgba(0,0,0,.38)';
  g.lineWidth = 3;
  const step = 512 / diamonds;
  for (let i = -diamonds; i < diamonds * 2; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step + 512, 512); g.stroke();
    g.beginPath(); g.moveTo(i * step + 512, 0); g.lineTo(i * step, 512); g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,.10)';
  g.lineWidth = 1;
  for (let i = -diamonds; i < diamonds * 2; i++) {
    g.beginPath(); g.moveTo(i * step + 3, 0); g.lineTo(i * step + 515, 512); g.stroke();
  }
  // binding border. No gold accent lines: generator-template UVs do not map
  // texture edges to garment edges, so edge pinstripes land mid-surface as
  // stains (see the saddle-blanket blotches). The gold binding survives in
  // the product photos; the 3D keeps clean quilted fabric.
  const b = Math.round(512 * binding);
  g.fillStyle = shade(color, -46);
  g.fillRect(0, 0, 512, b);
  g.fillRect(0, 512 - b, 512, b);
  g.fillRect(0, 0, b, 512);
  g.fillRect(512 - b, 0, b, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Crochet veil texture: open dot grid on the buyer's colour.
function makeCrochetTexture(color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,.45)';
  for (let y = 8; y < 256; y += 16) {
    for (let x = 8 + ((y / 16) % 2) * 8; x < 256; x += 16) {
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

// Cloth drape over the back: grid from z0..z1, x in [-halfW, halfW].
// Height follows the measured spine, falling to edgeY at the hem with a
// rounded profile, plus a faint quilt puff. UVs map u->length, v->width.
function buildDrapeGeometry({ z0, z1, halfW, lift, edgeY, power = 1.7, segU = 42, segV = 26, puff = 0 }) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let iu = 0; iu <= segU; iu++) {
    const u = iu / segU;
    const z = z0 + (z1 - z0) * u;
    const top = spineY(z) + lift;
    for (let iv = 0; iv <= segV; iv++) {
      const v = iv / segV;
      const x = -halfW + 2 * halfW * v;
      const t = Math.abs(x) / halfW;
      let y = top - (top - edgeY) * Math.pow(t, power);
      if (puff) y += puff * Math.sin(u * Math.PI * 9) * Math.sin(v * Math.PI * 7);
      pos.push(x, y, z);
      uv.push(u, v);
    }
  }
  for (let iu = 0; iu < segU; iu++) {
    for (let iv = 0; iv < segV; iv++) {
      const a = iu * (segV + 1) + iv;
      const b = a + segV + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

function useQuilt(color, opts) {
  return useMemo(() => makeQuiltTexture(color, opts), [color, opts?.diamonds, opts?.binding]);
}

// Buyer nudge/spin/mirror per slot (same shape as the studio's slotShift),
// provided once by Merch3D instead of threading a prop through every gear
// component. Offsets are percent of the face extent along the patch axes.
export const GearShiftContext = createContext(null);

// Interactive slot layer from Merch3D: { Layer, props }. When present, the
// fitted gear renders through it (decals that wrap the cloth, drag, slot
// outline) instead of the static patches below. Kept as context so the
// horse scene and the product view share it without prop threading.
export const GearSlotContext = createContext(null);

// Surface pose of each zone: cast from outside the zone's face, land on
// the first outer hit, upright frame. Shared by the static patches and the
// draggable slot layer. `eps` lifts the point off the cloth.
function plotZones(geometry, box, zones, eps = 0.015) {
  const probe = new THREE.Mesh(
    geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const ray = new THREE.Raycaster();
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const key = JSON.stringify(zones);
  return JSON.parse(key).map((z) => {
    const dir = z.face === '+x' ? [1, 0, 0]
      : z.face === '-x' ? [-1, 0, 0]
      : z.face === '+z' ? [0, 0, 1] : [0, 0, -1];
    // yFrac: cast height as a fraction of the box (default mid height).
    // at: [y, z] in model units, for gear worn on the horse where the box
    // also spans the neck cover and straps.
    const y = z.at ? z.at[0] : z.yFrac == null ? cy : box.min.y + z.yFrac * (box.max.y - box.min.y);
    const zc = z.at && z.at[1] != null && dir[2] === 0 ? z.at[1] : cz;
    ray.set(
      new THREE.Vector3(cx + dir[0] * 3, y + dir[1] * 3, zc + dir[2] * 3),
      new THREE.Vector3(-dir[0], -dir[1], -dir[2]),
    );
    const hits = ray.intersectObject(probe, false);
    // First OUTER surface along the ray. An open rear (light rug) lets the
    // ray pass inside and hit the chest panel from behind, which planted
    // the "back" logo on the front of the rug.
    const hit = hits.find((h) => h.face && h.face.normal.dot(ray.ray.direction) < 0) || hits[0];
    if (!hit) return null;
    const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(...dir);
    // Backface hit (open drape seen from behind): face the patch outward.
    if (n.dot(ray.ray.direction) > 0) n.negate();
    n.normalize();
    // Upright patch: its up axis follows world up projected onto the
    // surface. A shortest-arc rotation (setFromUnitVectors) leaves the roll
    // arbitrary, which tilted side logos and turned the rear one sideways.
    const worldUp = Math.abs(n.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(worldUp, n).normalize();
    const up = new THREE.Vector3().crossVectors(n, right);
    const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    // 0.015 clearance: quilt crowns rise ~0.01 past the planted point, so
    // 0.006 buries the patch edges (clipped logos); 0.015 stays subpixel.
    const p = hit.point.clone().addScaledVector(n, eps);
    return { position: [p.x, p.y, p.z], rotation: [e.x, e.y, e.z] };
  });
}

function ZonePatches({ box, zones, slots, valid, zoom, aspects, geometry }) {
  const ok = new Set(valid);
  const shift = useContext(GearShiftContext);
  // Surface-planted placements: a flat patch on a bounding-box face floats
  // off curved quilts (measured side gaps up to 0.3 units on the pad and
  // rugs). Each zone casts a ray from outside its face at the face centre;
  // the patch lands on the first hit, oriented to the hit normal. Without
  // geometry (never the case for the live paths) it falls back to the box.
  const plots = useMemo(
    () => (geometry ? plotZones(geometry, box, zones) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geometry, box],
  );
  return (
    <>
      {zones.map((z, i) => {
        const id = (z.slots || []).map((s) => slots[s]).find(Boolean);
        if (!id || !ok.has(String(id))) return null;
        const slot = (z.slots || []).find((s) => slots[s]);
        const plotted = plots?.[i];
        const place = plotted || facePlacement(box, z.face);
        const mult = Number(zoom?.[slot]) || 1;
        // wFrac = fraction of the face's measured extent (proportional to
        // the garment); size = absolute height for anatomy-fixed spots
        // such as bonnet ears.
        const h = z.wFrac
          ? ((z.wFrac * faceExtent(box, z.face)) / (Number(aspects?.[String(id)]) || 1)) * mult
          : z.size * mult;
        const nudge = shift?.[slot] || {};
        const unit = faceExtent(box, z.face) / 100;
        const f = slotFrame(...place.rotation);
        const ox = (Number(nudge.x) || 0) * unit;
        const oy = (Number(nudge.y) || 0) * unit;
        const position = place.position.map((c, k) => c + f.right[k] * ox + f.up[k] * oy);
        return (
          <LogoPatch
            key={`${z.face}:${id}`}
            id={id}
            position={position}
            rotation={place.rotation}
            size={h}
            spin={nudge.r}
            mirror={nudge.f}
          />
        );
      })}
    </>
  );
}

function clothMaterial(map) {
  return (
    <meshStandardMaterial map={map} roughness={0.92} metalness={0} side={THREE.DoubleSide} />
  );
}

// Client's Tripo saddle pad fitted on the horse's back
// (scripts/fit-horse-gear.mjs).
const SADDLE_PAD_ON_HORSE = '/models/horse/saddle-pad-on-horse.glb';
// Without the horse every item is the client's file exactly as modelled
// (scripts/fit-horse-gear.mjs writes *-studio.glb: turned, scaled, centred
// only). Zones are box fractions because nothing is in horse space there.
const SADDLE_PAD_STUDIO = '/models/horse/saddle-pad-studio.glb';
const PAD_ZONES_STUDIO = [
  { face: '+x', slots: ['side-left'], wFrac: 0.5, yFrac: 0.45 },
  { face: '-x', slots: ['side-right'], wFrac: 0.5, yFrac: 0.45 },
  { face: '-z', slots: ['back'], wFrac: 0.4, yFrac: 0.85 },
];

// Same rug material path as the rugs, so the piping keeps its colour on
// every colourway. On the horse the side panels sit on the lower rear of
// the pad (clear of the saddle flap); the rear logo rides the top of the pad at the spine.
const PAD_ZONES_ON_HORSE = [
  // On the horse of the client's Tripo "horse wearing the pad" file.
  { face: '+x', slots: ['side-left'], wFrac: 0.5, at: [1.3, -0.2] },
  { face: '-x', slots: ['side-right'], wFrac: 0.5, at: [1.3, -0.2] },
  { face: '-z', slots: ['back'], wFrac: 0.4, at: [1.4] },
];

export function SaddleBlanket({ color, slots, valid, zoom, aspects, draped }) {
  return (
    <Suspense fallback={null}>
      <RugGLBMesh file={draped ? SADDLE_PAD_ON_HORSE : SADDLE_PAD_STUDIO} fitted
        zones={draped ? PAD_ZONES_ON_HORSE : PAD_ZONES_STUDIO} puff={0.006}
        color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} />
    </Suspense>
  );
}

// Client's Tripo rugs fitted on the horse by scripts/fit-horse-gear.mjs
// (per-slice scale plus a smoothed push-out). Wearing a rug cut for another
// horse always bends it a little, so the product view shows the untouched
// studio file instead.
const RUG_WARM_ON_HORSE = '/models/horse/warm-rug-on-horse.glb';
const RUG_LIGHT_ON_HORSE = '/models/horse/lightweight-rug-on-horse.glb';
const RUG_WARM_STUDIO = '/models/horse/warm-rug-studio.glb';
const RUG_LIGHT_STUDIO = '/models/horse/lightweight-rug-studio.glb';
const RUG_ZONES_STUDIO = [
  { face: '+x', slots: ['side-left'], wFrac: 0.3, yFrac: 0.5 },
  { face: '-x', slots: ['side-right'], wFrac: 0.3, yFrac: 0.5 },
  { face: '-z', slots: ['back'], wFrac: 0.3, yFrac: 0.6 },
];

// Rug GLBs wear their authored albedo (quilt shading, gold piping, straps,
// buckles) re-tinted toward the buyer colour with trim kept — a procedural
// canvas quilt cannot be used here, its baked border lands mid-panel on the
// generator's packed UV islands and reads as dark streaks on colourways.
// Geometry is shared from the GLTF cache — only the cloned material is
// disposed. PBR maps are forced to predictable cloth (the generator's
// roughness/metalness maps mottle under the studio lights); the normal map
// weave is kept.
function useRugAuthored(file, color, fitted = false) {
  const { scene } = useGLTF(file);
  const texCache = useRef({});
  const data = useMemo(() => {
    let src = null;
    let m = null;
    scene.traverse((o) => { if (!src && o.isMesh) { src = o.geometry; m = o.material; } });
    if (!src) return { geometry: null, material: null };
    const g = src.clone();
    g.computeBoundingBox();
    if (!fitted) {
      const size = new THREE.Vector3();
      g.boundingBox.getSize(size);
      const s = 1.8 / Math.max(1e-6, size.z);
      g.scale(s, s, s);
      g.computeBoundingBox();
      const b = g.boundingBox;
      const cx = (b.min.x + b.max.x) / 2;
      const cz = (b.min.z + b.max.z) / 2;
      g.translate(-cx, 0.25 - b.min.y, -0.15 - cz);
      g.computeBoundingBox();
    }
    g.computeBoundingSphere();
    const mat = m.clone();
    mat.metalness = 0;
    mat.roughness = 0.9;
    mat.metalnessMap = null;
    mat.roughnessMap = null;
    if ('specularIntensity' in mat) mat.specularIntensity = 0;
    const img = m.map?.image;
    if (img && img.width) {
      if (!texCache.current[color]) texCache.current[color] = recolorFabric(img, color);
      mat.map = texCache.current[color];
      mat.color = new THREE.Color('#ffffff');
    } else {
      mat.map = null;
      mat.color = new THREE.Color(color);
    }
    mat.needsUpdate = true;
    return { geometry: g, material: mat };
  }, [scene, color, fitted]);
  useEffect(() => () => { data.material?.dispose(); }, [data.material]);
  useEffect(() => {
    const cache = texCache.current;
    return () => { Object.values(cache).forEach((t) => t.dispose()); };
  }, []);
  return data;
}

// On the horse: sides at mid barrel, rear logo on the flat rear wall below
// the rump curve (measured flat z -1.0 for y 1.0..1.3, |x| < 0.2; higher up
// the logo wraps the curve and gets cut). The horse's tail hangs over it.
const RUG_ZONES_ON_HORSE = [
  { face: '+x', slots: ['side-left'], wFrac: 0.3, at: [1.0, -0.3] },
  { face: '-x', slots: ['side-right'], wFrac: 0.3, at: [1.0, -0.3] },
  { face: '-z', slots: ['back'], wFrac: 0.3, at: [1.05] },
];
// Rugs worn by the taller horses of their own Tripo files.
const RUG_WORN_ZONES_ON_HORSE = [
  { face: '+x', slots: ['side-left'], wFrac: 0.3, at: [1.12, -0.3] },
  { face: '-x', slots: ['side-right'], wFrac: 0.3, at: [1.12, -0.3] },
  { face: '-z', slots: ['back'], wFrac: 0.3, at: [1.17] },
];

function RugGLBMesh({ file, puff, color, slots, valid, zoom, aspects, fitted, zones: fittedZones = RUG_ZONES_ON_HORSE }) {
  const { geometry, material } = useRugAuthored(file, color, fitted);
  const fallback = useMemo(
    () => buildDrapeGeometry({
      z0: -1.06, z1: 0.74, halfW: 0.45, lift: 0.035, edgeY: 0.92,
      power: 1.55, segU: 52, segV: 30, puff,
    }),
    [puff],
  );
  const fallbackMap = useQuilt(color, { diamonds: 9, binding: 0.07 });
  // GLB parse failure still shows the tuned drape, never a blank stage.
  const shown = geometry || fallback;
  const box = useMemo(() => shown.boundingBox.clone(), [shown]);
  const zones = fitted ? fittedZones : [
    { face: '+x', slots: ['side-left'], wFrac: 0.44 },
    { face: '-x', slots: ['side-right'], wFrac: 0.44 },
    // Rear face tapers fast: 0.55 overhangs the silhouette (floating logo
    // corners), 0.38 keeps every corner on the surface. Cast high on the
    // rump: at mid height the open rear of the light rug let the ray through
    // to the inside of the chest panel.
    { face: '-z', slots: ['back'], wFrac: 0.38, yFrac: 0.72 },
  ];
  const layer = useContext(GearSlotContext);
  const defs = useMemo(() => {
    if (!layer || !fitted || !geometry) return null;
    // Slot centre on the cloth itself: the decal projects through it.
    const plots = plotZones(geometry, box, zones, 0);
    const out = {};
    zones.forEach((z, i) => {
      const pl = plots[i];
      if (!pl) return;
      const [x, y, zz] = pl.position;
      const [rx, ry, rz] = pl.rotation;
      for (const s of z.slots || []) out[s] = { x, y, z: zz, rx, ry, rz };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer ? 1 : 0, fitted, geometry, box]);
  if (layer && defs && material) {
    const { Layer, props } = layer;
    return <Layer {...props} geometry={shown} material={material} defs={defs} />;
  }
  return (
    <group>
      {material ? (
        <mesh geometry={shown} material={material} />
      ) : (
        <mesh geometry={shown} material={undefined}>
          {clothMaterial(fallbackMap)}
        </mesh>
      )}
      <ZonePatches box={box} zones={zones} slots={slots} valid={valid} zoom={zoom} aspects={aspects} geometry={shown} />
    </group>
  );
}

export function WarmRug({ color, slots, valid, zoom, aspects, draped }) {
  return (
    <Suspense fallback={null}>
      <RugGLBMesh file={draped ? RUG_WARM_ON_HORSE : RUG_WARM_STUDIO} fitted puff={0.009}
        zones={draped ? RUG_WORN_ZONES_ON_HORSE : RUG_ZONES_STUDIO}
        color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} />
    </Suspense>
  );
}

export function LightRug({ color, slots, valid, zoom, aspects, draped }) {
  return (
    <Suspense fallback={null}>
      <RugGLBMesh file={draped ? RUG_LIGHT_ON_HORSE : RUG_LIGHT_STUDIO} fitted puff={0.004}
        zones={draped ? RUG_WORN_ZONES_ON_HORSE : RUG_ZONES_STUDIO}
        color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} />
    </Suspense>
  );
}

// Client-supplied ear bonnet GLB (Tripo single mesh, faces +Z like the
// horse: ears at x +/-33u, veil rim at z +35u). Uniform scale lands the ears
// on the horse's (x +/-0.1, z ~0.89); the veil rim then sits just off the
// forehead. Buyer colour comes from the shared crochet canvas; only the
// shape + UVs are kept.
const BONNET_FILE = '/models/horse/ear-bonnet.glb';
// Pre-fitted on the horse's ears and pushed clear of the head
// (scripts/fit-horse-gear.mjs).
const BONNET_ON_HORSE = '/models/horse/ear-bonnet-on-horse.glb';

const BONNET_S = 0.2 / 66;

function useEarBonnetGeometry(fitted = false) {
  const { scene } = useGLTF(fitted ? BONNET_ON_HORSE : BONNET_FILE);
  return useMemo(() => {
    let src = null;
    scene.traverse((o) => { if (!src && o.isMesh) src = o.geometry; });
    if (!src) return null;
    const g = src.clone();
    if (fitted) {
      g.computeBoundingBox();
      g.computeBoundingSphere();
      return g;
    }
    g.scale(BONNET_S, BONNET_S, BONNET_S);
    g.computeBoundingBox();
    const b = g.boundingBox;
    // Rim (y=0) -> y 1.70; ears (z -3.5u) -> z 0.894, x +/-0.1 by construction.
    g.translate(0, 1.7 - b.min.y, 0.894 + 3.5 * BONNET_S);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }, [scene, fitted]);
}

// Logo anchors measured off the placed mesh so patches hug the surface.
// Forehead = furthest-forward veil vertex in the patch's own footprint
// (mid-face: clear of the rim piping below and the ear convergence above).
// Ears = outermost vertex per side above the veil. Falls back to the fitted
// anatomy spots when the GLB is unavailable.
function bonnetAnchors(geo) {
  const fallback = {
    forehead: { x: 0, y: 1.8, z: 1.02 },
    earL: { x: 0.1, y: 1.95, z: 0.89 },
    earR: { x: -0.1, y: 1.95, z: 0.89 },
  };
  if (!geo?.attributes?.position) return fallback;
  const p = geo.attributes.position;
  // Bands relative to the bonnet's own height, so the studio piece and the
  // one fitted on the horse (shorter veil, higher up) both resolve.
  if (!geo.boundingBox) geo.computeBoundingBox();
  const y0 = geo.boundingBox.min.y;
  const H = geo.boundingBox.max.y - y0;
  const fLo = y0 + 0.15 * H;
  const fHi = y0 + 0.45 * H;
  const earY = y0 + 0.6 * H;
  const f = { x: 0, y: (fLo + fHi) / 2, z: -1e9 };
  const L = { ...fallback.earL };
  const R = { ...fallback.earR };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // Mid-face only: the rim piping (y <= ~1.73) juts furthest forward
    // and would poke through a patch centred on it.
    if (Math.abs(x) < 0.07 && y > fLo && y < fHi && z > f.z) {
      // Centre the patch just above the measured point so its lower edge
      // clears the rim.
      f.y = Math.min(fHi - 0.1 * H, Math.max(fLo + 0.1 * H, y));
      f.z = z;
    }
    if (y > earY) {
      if (x > L.x) { L.x = x; L.y = y; L.z = z; }
      if (-x > -R.x) { R.x = x; R.y = y; R.z = z; }
    }
  }
  if (f.z < -1e8) { f.y = fallback.forehead.y; f.z = fallback.forehead.z; }
  return { forehead: f, earL: L, earR: R };
}

function EarBonnetGLB({ color, slots, valid, zoom, aspects, fitted }) {
  const geo = useEarBonnetGeometry(fitted);
  const map = useMemo(() => makeCrochetTexture(color), [color]);
  const anchors = useMemo(() => bonnetAnchors(geo), [geo]);
  // Synthetic forehead box with the fitted veil's footprint, pinned to the
  // measured surface — same logo size as on the horse, no floating patch.
  const fbox = useMemo(() => {
    const b = geo?.boundingBox;
    const hw = b ? Math.min(0.11, 0.33 * (b.max.x - b.min.x)) : 0.11;
    const hh = b ? Math.min(0.055, 0.2 * (b.max.y - b.min.y)) : 0.055;
    return new THREE.Box3(
      new THREE.Vector3(-hw, anchors.forehead.y - hh, anchors.forehead.z - 0.11),
      new THREE.Vector3(hw, anchors.forehead.y + hh, anchors.forehead.z),
    );
  }, [anchors, geo]);
  // GLB parse failure still shows the tuned fitted bonnet, never blank.
  if (!geo) return <EarBonnetFitted color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} />;
  const earPatches = [
    { a: anchors.earL, slots: ['ear-left'], face: '+x' },
    { a: anchors.earR, slots: ['ear-right'], face: '-x' },
  ];
  return (
    <group>
      <mesh geometry={geo} material={undefined}>
        <meshStandardMaterial map={map} roughness={0.95} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {earPatches.map((e) => {
        const id = (e.slots || []).map((s) => slots[s]).find(Boolean);
        if (!id || !valid.includes(String(id))) return null;
        const slot = (e.slots || []).find((s) => slots[s]);
        const sx = e.face === '+x' ? 1 : -1;
        return (
          <LogoPatch
            key={e.face}
            id={id}
            position={[e.a.x + sx * 0.006, e.a.y, e.a.z]}
            rotation={[0, sx * Math.PI / 2, 0]}
            size={Math.min(0.07, 0.06 / Math.min(Math.max(Number(aspects?.[String(id)]) || 1, 0.5), 3)) * (Number(zoom?.[slot]) || 1)}
          />
        );
      })}
      <ZonePatches
        box={fbox} zones={[{ face: '+z', slots: ['forehead'], wFrac: 0.9 }]}
        slots={slots} valid={valid} zoom={zoom} aspects={aspects}
        geometry={geo}
      />
    </group>
  );
}

// Client's Tripo bonnet fitted on the ears by scripts/fit-horse-gear.mjs
// (socks kept as modelled, the horse's ears are tucked while it is worn).
// Same rug material path, so the cord keeps its colour on every colourway. Forehead logo
// on the browband panel, ear logos on the outer side of each sock.
const BONNET_ZONES_ON_HORSE = [
  // On the horse of the client's Tripo "horse wearing the bonnet" file.
  { face: '+z', slots: ['forehead'], size: 0.05, at: [1.76] },
  { face: '+x', slots: ['ear-left'], size: 0.024, at: [1.9, 1.0] },
  { face: '-x', slots: ['ear-right'], size: 0.024, at: [1.9, 1.0] },
];

const BONNET_STUDIO = '/models/horse/ear-bonnet-studio.glb';
const BONNET_ZONES_STUDIO = [
  { face: '+z', slots: ['forehead'], size: 0.05, yFrac: 0.42 },
  { face: '+x', slots: ['ear-left'], size: 0.024, yFrac: 0.82 },
  { face: '-x', slots: ['ear-right'], size: 0.024, yFrac: 0.82 },
];

export function EarBonnet({ color, slots, valid, zoom, aspects, draped }) {
  return (
    <Suspense fallback={null}>
      <RugGLBMesh file={draped ? BONNET_ON_HORSE : BONNET_STUDIO} fitted
        zones={draped ? BONNET_ZONES_ON_HORSE : BONNET_ZONES_STUDIO} puff={0.004}
        color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} />
    </Suspense>
  );
}

function EarBonnetFitted({ color, slots, valid, zoom, aspects }) {
  const panel = useMemo(() => {
    // Veil lying on the forehead. Face surface measured from the GLB
    // (max-z per x/y cell): centre line runs z 1.136 @ y 1.70 back to
    // z 1.052 @ y 1.88, curving away ~0.04 at |x| = 0.11. The veil rides
    // 0.012 in front of that surface so it never sinks into the head.
    const segU = 14;
    const segV = 10;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const y = 1.7 + 0.18 * u;
      const zc = 1.136 - 0.467 * (y - 1.7);
      for (let iv = 0; iv <= segV; iv++) {
        const v = iv / segV;
        const x = -0.11 + 0.22 * v;
        const z = zc - Math.pow(Math.abs(x) / 0.13, 2) * 0.06 + 0.012;
        pos.push(x, y, z);
        uv.push(u, v);
      }
    }
    for (let iu = 0; iu < segU; iu++) {
      for (let iv = 0; iv < segV; iv++) {
        const a = iu * (segV + 1) + iv;
        const b = a + segV + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingBox();
    return g;
  }, []);
  const map = useMemo(() => makeCrochetTexture(color), [color]);
  const box = useMemo(() => panel.boundingBox.clone(), [panel]);
  const zones = [
    { face: '+z', slots: ['forehead'], wFrac: 0.9 },
  ];
  const earZones = [
    { x: 0.1, slots: ['ear-left'], face: '+x' },
    { x: -0.1, slots: ['ear-right'], face: '-x' },
  ];
  return (
    <group>
      <mesh geometry={panel} material={undefined}>
        <meshStandardMaterial map={map} roughness={0.95} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {earZones.map((e) => {
        const id = (e.slots || []).map((s) => slots[s]).find(Boolean);
        const ok = id && valid.includes(String(id));
        const slot = (e.slots || []).find((s) => slots[s]);
        return (
          <mesh
            key={e.x}
            position={[e.x, 1.93, 0.8]}
            rotation={[-0.15, 0, e.x > 0 ? -0.1 : 0.1]}
          >
            <cylinderGeometry args={[0.018, 0.045, 0.11, 12]} />
            <meshStandardMaterial map={map} roughness={0.95} />
            {ok && (
              <LogoPatch
                id={id}
                position={[e.face === '+x' ? 0.045 : -0.045, 0.01, 0]}
                rotation={[0, e.face === '+x' ? Math.PI / 2 : -Math.PI / 2, 0]}
                size={Math.min(0.07, 0.06 / Math.min(Math.max(Number(aspects?.[String(id)]) || 1, 0.5), 3)) * (Number(zoom?.[slot]) || 1)}
              />
            )}
          </mesh>
        );
      })}
      <ZonePatches box={box} zones={zones} slots={slots} valid={valid} zoom={zoom} aspects={aspects} geometry={panel} />
    </group>
  );
}

export function FittedGear({ productId, color, slots, valid, zoom, aspects, draped }) {
  if (productId === 'saddle-blanket') return <SaddleBlanket color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} draped={draped} />;
  if (productId === 'rug-light') return <LightRug color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} draped={draped} />;
  if (productId === 'rug-warm') return <WarmRug color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} draped={draped} />;
  if (productId === 'ear-bonnet') return <EarBonnet color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} draped={draped} />;
  return null;
}
