'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Decal, useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { LOGO_URL } from '../lib/merch.mjs';

// Re-tint a generator-baked albedo toward the buyer colour WITHOUT repainting
// it: dark neutral pixels (quilt fabric, webbing) take the buyer colour and
// keep their baked fold shading, while bright hardware (silver buckles) and
// saturated trim (gold piping) stay as authored. A procedural canvas quilt
// cannot be used here — its baked border lands mid-panel on the generator's
// packed UV islands and reads as dark streaks on non-black colourways.
export function recolorFabric(image, buyerHex) {
  // 1024px keeps colour swaps responsive (see recolorAlbedo in Merch3D).
  const MAX = 1024;
  const scale = Math.min(1, MAX / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h);
  const px = d.data;
  const count = px.length / 4;
  const n = parseInt(String(buyerHex).replace('#', ''), 16);
  const br = (n >> 16) & 255;
  const bg = (n >> 8) & 255;
  const bb = n & 255;
  const lum = (i) => 0.2126 * (px[i] / 255) + 0.7152 * (px[i + 1] / 255) + 0.0722 * (px[i + 2] / 255);
  const sat = (i) => {
    const r = px[i] / 255;
    const gg = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    return Math.max(r, gg, b) - Math.min(r, gg, b);
  };
  // Reference luminance of the fabric: dark sources shade ~0.12, so curves
  // below stay relative to the albedo instead of absolute.
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += lum(i);
  const ref = sum / count;
  // Seeds: near-white neutral (buckles, highlights) and saturated (piping).
  // Growth into mid-bright / mid-saturated neighbours keeps whole parts in
  // their source colour (piping with its AA rim) instead of half-tinting.
  // Fold shading is dark neutral, so it never joins either mask.
  const seed = new Uint8Array(count);
  const trav = new Uint8Array(count);
  for (let j = 0, i = 0; j < count; j++, i += 4) {
    const L = lum(i);
    const s = sat(i);
    if ((L >= 0.9 && s < 0.2) || s >= 0.4) seed[j] = 1;
    if ((L > 0.5 && s < 0.25) || s >= 0.25) trav[j] = 1;
  }
  const grown = new Uint8Array(count);
  const stack = [];
  for (let j = 0; j < count; j++) {
    if (!seed[j] || grown[j]) continue;
    stack.push(j);
    grown[j] = 1;
    while (stack.length) {
      const cc = stack.pop();
      const x = cc % w;
      if (x > 0 && trav[cc - 1] && !grown[cc - 1]) { grown[cc - 1] = 1; stack.push(cc - 1); }
      if (x < w - 1 && trav[cc + 1] && !grown[cc + 1]) { grown[cc + 1] = 1; stack.push(cc + 1); }
      if (cc >= w && trav[cc - w] && !grown[cc - w]) { grown[cc - w] = 1; stack.push(cc - w); }
      if (cc < count - w && trav[cc + w] && !grown[cc + w]) { grown[cc + w] = 1; stack.push(cc + w); }
    }
  }
  for (let j = 0, i = 0; j < count; j++, i += 4) {
    const L = lum(i);
    const fabricShade = 0.55 + 0.45 * Math.min(1, Math.max(0, L / (ref * 1.65)));
    const keep = grown[j] ? 1 : 0;
    px[i] = br * fabricShade * (1 - keep) + px[i] * keep;
    px[i + 1] = bg * fabricShade * (1 - keep) + px[i + 1] * keep;
    px[i + 2] = bb * fabricShade * (1 - keep) + px[i + 2] * keep;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // match GLTF texture convention
  t.anisotropy = 8;
  return t;
}

// In-plane extent of a bounding-box face: the width a logo patch has to
// work with on that face. ±x faces span z, ±z faces span x.
export function faceExtent(box, face) {
  if (face === '+x' || face === '-x') return box.max.z - box.min.z;
  return box.max.x - box.min.x;
}

// Outward-facing placement on a bounding box, for logo patches.
// face: '+x' | '-x' | '+z' | '-z'. Returns position + rotation.
export function facePlacement(box, face, eps = 0.006) {
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  if (face === '+z') return { position: [cx, cy, box.max.z + eps], rotation: [0, 0, 0] };
  if (face === '-z') return { position: [cx, cy, box.min.z - eps], rotation: [0, Math.PI, 0] };
  if (face === '+x') return { position: [box.max.x + eps, cy, cz], rotation: [0, Math.PI / 2, 0] };
  return { position: [box.min.x - eps, cy, cz], rotation: [0, -Math.PI / 2, 0] };
}

// Flat logo patch for meshes without UVs (procedural templates): a plane
// hovering just off the surface. DecalGeometry requires UV attributes and
// throws on UV-less geometry, so gear templates use this instead.
// spin rotates in-plane (degrees), mirror flips horizontally. Extra props
// (pointer handlers for canvas dragging) forward to the mesh.
export function LogoPatch({ id, position, rotation, size, spin, mirror, meshRef, ...handlers }) {
  const texture = useTexture(LOGO_URL(id));
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  }, [texture]);
  const w = texture.image?.width || 1;
  const h = texture.image?.height || 1;
  const aspect = Math.min(Math.max(w / h, 0.5), 3);
  const rz = ((Number(spin) || 0) * Math.PI) / 180;
  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[rotation[0], rotation[1], (rotation[2] || 0) + rz]}
      scale={mirror ? [-1, 1, 1] : [1, 1, 1]}
      {...handlers}
    >
      <planeGeometry args={[size * aspect, size]} />
      <meshBasicMaterial
        map={texture}
        transparent
        toneMapped={false}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}


// One texture per logo id (cached by useTexture). Each decal is its own
// component so hooks stay stable while slots change.
// spin rotates in-plane (degrees), mirror flips horizontally — both applied
// to a per-instance texture clone so slots sharing one logo stay independent.
// Extra props (pointer handlers for canvas dragging) forward to the Decal.
export function Sticker({ id, position, rotation, scale, mirror, stickerRef, region, ...handlers }) {
  const base = useTexture(LOGO_URL(id));
  // Spin lives in the projector rotation (the caller adds it to rotation[2]),
  // so the box turns with the logo and a rotated logo is never cropped.
  const texture = useMemo(() => {
    const t = base.clone();
    t.needsUpdate = true;
    t.center.set(0.5, 0.5);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (mirror) {
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.x = -1;
      t.offset.x = 1;
    }
    return t;
  }, [base, mirror]);
  useEffect(() => () => { texture.dispose(); }, [texture]);
  const ownRef = useRef(null);
  useFacingDecal(ownRef, position, rotation, scale);
  const setRef = (node) => {
    ownRef.current = node;
    if (typeof stickerRef === 'function') stickerRef(node);
    else if (stickerRef) stickerRef.current = node;
  };
  return (
    <Decal
      ref={setRef}
      mesh={region}
      position={position}
      rotation={rotation}
      scale={scale}
      map={texture}
      polygonOffset
      polygonOffsetFactor={-4}
      {...handlers}
    />
  );
}

// A projection decal prints on every triangle inside its box, including
// surfaces facing the other way: the inner back collar seen through the
// neck opening, the inside of a sleeve hem. Those showed up as stray patches
// of logo or slot frame. Keep only triangles that face the projector.
const FACING_MIN = 0.45;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();
function keepFacing(geometry, rotation) {
  const pos = geometry?.attributes?.position;
  if (!pos || geometry.index) return;
  _dir.set(0, 0, 1).applyEuler(new THREE.Euler(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0));
  const keep = [];
  for (let t = 0; t < pos.count; t += 3) {
    _a.fromBufferAttribute(pos, t);
    _b.fromBufferAttribute(pos, t + 1).sub(_a);
    _c.fromBufferAttribute(pos, t + 2).sub(_a);
    if (_b.cross(_c).normalize().dot(_dir) >= FACING_MIN) keep.push(t);
  }
  if (keep.length * 3 === pos.count) return;
  for (const name of Object.keys(geometry.attributes)) {
    const attr = geometry.attributes[name];
    const size = attr.itemSize;
    const out = new Float32Array(keep.length * 3 * size);
    keep.forEach((t, k) => out.set(attr.array.subarray(t * size, (t + 3) * size), k * 3 * size));
    geometry.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  geometry.computeBoundingSphere();
}

// Drag speed: drei's Decal re-projects against EVERY triangle of the parent
// mesh on each move, which is what made dragging stutter on the 15k+
// triangle garments. A slot only ever prints near its own centre (the logo
// is clamped inside the print area), so project against a cached patch of
// the triangles around the slot that face it. Same local space as the
// garment, so the decal still renders as the garment's child.
const _regions = new WeakMap();
export function slotRegion(geometry, center, size, rotation) {
  if (!geometry?.attributes?.position || !geometry.attributes.normal) return undefined;
  const key = [...center, ...size, rotation[0] || 0, rotation[1] || 0].map((v) => v.toFixed(4)).join(',');
  let byKey = _regions.get(geometry);
  if (!byKey) { byKey = new Map(); _regions.set(geometry, byKey); }
  if (byKey.has(key)) return byKey.get(key);
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const index = geometry.index;
  const at = (i) => (index ? index.getX(i) : i);
  const triCount = (index ? index.count : pos.count) / 3;
  // Half diagonal of the print area plus room for a rotated logo corner.
  const r2 = (0.75 * Math.hypot(size[0], size[1])) ** 2;
  _dir.set(0, 0, 1).applyEuler(new THREE.Euler(rotation[0] || 0, rotation[1] || 0, 0));
  const c = new THREE.Vector3(...center);
  const outP = [];
  const outN = [];
  for (let t = 0; t < triCount; t++) {
    const i0 = at(t * 3);
    const i1 = at(t * 3 + 1);
    const i2 = at(t * 3 + 2);
    _a.fromBufferAttribute(pos, i0);
    _b.fromBufferAttribute(pos, i1);
    _c.fromBufferAttribute(pos, i2);
    const mid = _a.clone().add(_b).add(_c).divideScalar(3);
    if (mid.distanceToSquared(c) > r2) continue;
    _b.sub(_a);
    _c.sub(_a);
    if (_b.cross(_c).normalize().dot(_dir) < FACING_MIN) continue;
    for (const i of [i0, i1, i2]) {
      outP.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      outN.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(outN, 3));
  const ref = { current: new THREE.Mesh(g) };
  byKey.set(key, ref);
  return ref;
}

// Runs after drei's Decal built its geometry (child layout effects run
// first), with the same dependencies, so every rebuild is filtered again.
// drei's Decal swaps its geometry outside the props pipeline, so a
// frameloop="demand" canvas would not redraw a moved logo: ask for a frame.
function useFacingDecal(ref, position, rotation, scale) {
  const invalidate = useThree((st) => st.invalidate);
  useLayoutEffect(() => {
    keepFacing(ref.current?.geometry, rotation);
    invalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...position, ...rotation, ...(Array.isArray(scale) ? scale : [scale])]);
}

// Print-area outline projected onto the garment like a logo, so it hugs
// curved surfaces instead of floating as a flat card. kind: 'range' (the
// selected slot), 'slot' (an empty slot you can tap).
export function SlotFrameDecal({ position, rotation, size, depth, kind, region }) {
  const map = useMemo(() => frameTexture(kind), [kind]);
  const ref = useRef(null);
  useFacingDecal(ref, position, rotation, [size[0], size[1], depth]);
  return (
    <Decal ref={ref} mesh={region} position={position} rotation={rotation} scale={[size[0], size[1], depth]}
      map={map} polygonOffset polygonOffsetFactor={-6} depthWrite={false} />
  );
}

const _frameTex = {};
function frameTexture(kind) {
  if (_frameTex[kind]) return _frameTex[kind];
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const gold = '#e3b341';
  const grey = '#8a8474';
  g.clearRect(0, 0, 256, 256);
  if (kind === 'range') {
    g.fillStyle = 'rgba(227,179,65,.10)';
    g.fillRect(0, 0, 256, 256);
  }
  g.lineWidth = kind === 'select' ? 6 : 8;
  g.strokeStyle = kind === 'slot' ? grey : gold;
  g.globalAlpha = kind === 'range' ? 0.55 : 1;
  // 'pick' marks the selected placement zone: gold dashed, no plus mark.
  g.setLineDash(kind === 'select' ? [] : [22, 14]);
  g.strokeRect(14, 14, 228, 228);
  g.globalAlpha = 1;
  g.setLineDash([]);
  if (kind === 'slot') {
    // plus mark: "a logo goes here, tap to fill".
    g.fillStyle = grey;
    g.fillRect(118, 88, 20, 80);
    g.fillRect(88, 118, 80, 20);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _frameTex[kind] = t;
  return t;
}

// Flat overlay quad in the decal's own frame (same position + rotation, so
// it hugs tilted logos too). `size` is [w, h] in local units.
export function DecalFrame({ position, rotation, size, kind, onPointerDown }) {
  const map = useMemo(() => frameTexture(kind), [kind]);
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, 0.004]} onPointerDown={onPointerDown}>
        <planeGeometry args={size} />
        <meshBasicMaterial
          map={map}
          transparent
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-6}
        />
      </mesh>
    </group>
  );
}

// Small gold dot marking the selected placement: an indicator beside the
// artwork, never a frame around it.
let _dotTex = null;
function dotTexture() {
  if (_dotTex) return _dotTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0, '#FFC400');
  grad.addColorStop(0.55, '#FFC400');
  grad.addColorStop(1, 'rgba(255,196,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _dotTex = t;
  return t;
}

export function PlaceDot({ position, rotation, size }) {
  const map = useMemo(() => dotTexture(), []);
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial
          map={map}
          transparent
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-8}
        />
      </mesh>
    </group>
  );
}

// Aspect ratios (w/h) per logo id, read from the image itself. Projection
// decals map the texture across a square box — without this, a wide banner
// logo renders squeezed into a tall stamp. Buyer uploads resolve too.
export function useLogoAspects(ids) {
  const [aspects, setAspects] = useState({});
  const cache = useRef({});
  const key = [...new Set(ids.map(String))].sort().join('|');
  useEffect(() => {
    let live = true;
    const missing = key ? key.split('|').filter((id) => !(id in cache.current)) : [];
    if (!missing.length) {
      setAspects({ ...cache.current });
      return () => { live = false; };
    }
    missing.forEach((id) => {
      const img = new Image();
      img.onload = () => {
        cache.current[id] = img.width && img.height ? img.width / img.height : 1;
        if (live) setAspects({ ...cache.current });
      };
      img.onerror = () => {
        cache.current[id] = 1;
        if (live) setAspects({ ...cache.current });
      };
      img.src = LOGO_URL(id);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return aspects;
}

// A texture that 404s throws inside Canvas and unmounts the whole scene,
// so only ids that answer HEAD 200 ever reach <Sticker>.
// Buyer uploads (`upload:`) skip the check — they are local object URLs.
export function useValidLogos(ids) {
  const [valid, setValid] = useState([]);
  const sorted = [...new Set(ids.map(String))].sort();
  const key = sorted.join('|');
  useEffect(() => {
    let live = true;
    const isLocal = (id) => id.startsWith('upload:') || id.startsWith('club:');
    const local = sorted.filter(isLocal);
    const remote = sorted.filter((id) => !isLocal(id));
    if (!remote.length) { setValid(local); return () => { live = false; }; }
    Promise.all(
      remote.map(async (id) => {
        try {
          const r = await fetch(LOGO_URL(id), { method: 'HEAD' });
          // true = present, false = proven missing, null = network flake.
          return r.ok ? true : false;
        } catch { return null; }
      }),
    ).then((res) => {
      if (!live) return;
      // A flaky HEAD must never hide placed logos: only a definitive 404
      // removes an id; flakes keep their previous status.
      setValid((prev) => {
        const prevSet = new Set(prev);
        const next = new Set(local);
        remote.forEach((id, i) => {
          if (res[i] === true || (res[i] === null && prevSet.has(id))) next.add(id);
        });
        return [...next];
      });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return valid;
}
