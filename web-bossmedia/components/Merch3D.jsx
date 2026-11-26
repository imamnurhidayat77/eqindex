'use client';
import { Component, Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls, RoundedBox, useGLTF } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SlotFrameDecal, Sticker, slotRegion, useLogoAspects, useValidLogos } from './MerchDecals';
import { HorseScene } from './HorseStage';
import { FittedGear } from './HorseGear';
import { buildHoverTargets, canonicalFit, clampLogoOffset, clampShift, isHorseProduct, merchCatalogVersion, merchModel, merchPositions, poseFromHit, riderModelFile, slotFrame, slotPose, slotSizeUnits } from '../lib/merch.mjs';
import { GearShiftContext, GearSlotContext } from './HorseGear';
import { GARMENT_WIDTH_MM } from '../lib/merch-config.mjs';
import s from './MerchClient.module.css';

// GLB load failure must never blank the whole preview — fall back to the
// procedural mannequin for the same product.
class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* preview-level: fallback below takes over */ }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

// Quilted fabric texture drawn in the buyer's colour (blankets + rugs).
function useQuilt(color, stripe) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 384;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, 512, 384);
    g.strokeStyle = 'rgba(0,0,0,.28)';
    g.lineWidth = 3;
    for (let i = -384; i < 512 + 384; i += 42) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 384, 384); g.stroke();
      g.beginPath(); g.moveTo(i + 384, 0); g.lineTo(i, 384); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 10;
    g.strokeRect(14, 14, 512 - 28, 384 - 28);
    if (stripe) {
      g.fillStyle = '#e3b341';
      g.fillRect(0, 150, 512, 40);
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(0, 150, 512, 5);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [color, stripe]);
}

// DECALS sizes are heights; width follows each logo's real aspect ratio
// (useLogoAspects) so a wide banner never renders squeezed into a stamp.
// No module-level preload: each product page fetches only its own model
// (preloading every GLB here pulled the whole catalogue on any page).

// Client-supplied softshell jacket (black baked texture). Black renders
// as authored. Other colourways get a re-tinted albedo: fabric pixels take
// the buyer's colour (keeping the baked fold shading) while bright,
// low-saturation pixels — zipper teeth, pulls, hardware — keep coming
// through in their original gunmetal. A plain multiply would turn
// everything, hardware included, into the fabric colour.
// tintAll: the model's hardware is real geometry (polo buttons), so the
// painted white dots must take the fabric colour instead of staying white,
// otherwise they peek out around the button discs as blobs.
function recolorAlbedo(image, buyerHex, tintAll = false) {
  // 1024px: the garment never covers more than ~600 CSS px of the stage,
  // and a quarter of the pixels keeps colour swaps from freezing the page.
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
  const n = parseInt(String(buyerHex).replace('#', ''), 16);
  const br = (n >> 16) & 255;
  const bg = (n >> 8) & 255;
  const bb = n & 255;
  const sstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // Reference luminance of this albedo: dark sources (black softshell)
  // shade around ~0.12, light sources (tan cap) around ~0.65. Curves below
  // are relative to it, so any source colourway re-tints correctly.
  let sum = 0;
  const count = px.length / 4;
  for (let i = 0; i < px.length; i += 4) {
    sum += 0.2126 * (px[i] / 255) + 0.7152 * (px[i + 1] / 255) + 0.0722 * (px[i + 2] / 255);
  }
  const ref = sum / count;
  // Light-sourced albedos (tan cap, ref ~0.7) are near-white almost
  // everywhere, so the hardware mask below would swallow the whole fabric
  // (measured: 91% of the cap) and the buyer colour never shows. Those
  // models carry no metal hardware: tint every pixel.
  const lightSource = tintAll || ref > 0.45;
  // Hardware = ONLY near-white, low-saturation pixels (zipper teeth glints,
  // white buttons/contrast stitching). Fixed thresholds, deliberately NOT
  // ref-relative: mid-grey fold shading and gunmetal must always tint with
  // the fabric, otherwise every dark colourway grows white blotches.
  // White stitching staying white on black is intended contrast detailing.
  const hwLo = 0.75;
  const hwHi = 0.9;
  // Region-grow the mask from near-white seeds into connected mid-bright,
  // low-saturation pixels: hardware parts keep their whole source colour
  // (polo buttons including their AA edges, zipper pulls) instead of
  // half-tinting at the rims. Bright pixels join freely; dimmer ones only
  // within a few px of a seed, so fold shading streaks can never join.
  const seed = new Uint8Array(count);
  const level = new Uint8Array(count);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const r = px[i] / 255;
    const gg = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
    if (!lightSource && L >= hwHi && sat < 0.2) seed[j] = 1;
    if (sat < 0.3) level[j] = L > 0.5 ? 2 : L > 0.3 ? 1 : 0;
  }
  // Drop isolated sparkle seeds (JPEG noise): only seed clusters of 30px+
  // grow, so each speckle never earns its own halo below. States: 1 fresh,
  // 2 visiting, 3 kept.
  for (let j = 0; j < count; j++) {
    if (seed[j] !== 1) continue;
    const comp = [j];
    seed[j] = 2;
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k];
      const x = c % w;
      if (x > 0 && seed[c - 1] === 1) { seed[c - 1] = 2; comp.push(c - 1); }
      if (x < w - 1 && seed[c + 1] === 1) { seed[c + 1] = 2; comp.push(c + 1); }
      if (c >= w && seed[c - w] === 1) { seed[c - w] = 2; comp.push(c - w); }
      if (c < count - w && seed[c + w] === 1) { seed[c + w] = 2; comp.push(c + w); }
    }
    const keep = comp.length >= 30;
    for (const c of comp) seed[c] = keep ? 3 : 0;
  }
  const grown = new Uint8Array(count);
  const stack = [];
  const depth = new Int16Array(count).fill(-1);
  for (let j = 0; j < count; j++) {
    if (seed[j] !== 3 || grown[j]) continue;
    stack.push(j);
    grown[j] = 1;
    depth[j] = 0;
    while (stack.length) {
      const c = stack.pop();
      const dc = depth[c];
      const x = c % w;
      const stepTo = (n) => {
        if (grown[n] || level[n] < 1) return;
        if (level[n] < 2 && dc >= 6) return;
        grown[n] = 1;
        depth[n] = dc + 1;
        stack.push(n);
      };
      if (x > 0) stepTo(c - 1);
      if (x < w - 1) stepTo(c + 1);
      if (c >= w) stepTo(c - w);
      if (c < count - w) stepTo(c + w);
    }
  }
  // Whiten the shaded rim around kept hardware: button discs whose UVs
  // spill past the painted white sample dark surround texels. Only dim
  // (not deep-black), low-saturation neighbours within a few px turn white,
  // so placket fabric keeps its colour and no halo spreads onto the shirt.
  // Snapshot first: whitened pixels must not become new sources, otherwise
  // the white cascades across every connected mid-grey region.
  const wr = Math.max(2, Math.round(w / 700));
  const src = [];
  for (let j = 0; j < count; j++) {
    if (grown[j]) src.push(j);
  }
  for (const j of src) {
    const gx = j % w;
    const gy = (j / w) | 0;
    for (let dy = -wr; dy <= wr; dy++) {
      const ny = gy + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -wr; dx <= wr; dx++) {
        if (!dx && !dy) continue;
        const nx = gx + dx;
        if (nx < 0 || nx >= w) continue;
        const n = ny * w + nx;
        if (grown[n]) continue;
        const o = n * 4;
        const ar = px[o] / 255;
        const ag = px[o + 1] / 255;
        const ab = px[o + 2] / 255;
        const aL = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
        const asat = Math.max(ar, ag, ab) - Math.min(ar, ag, ab);
        if (aL > 0.12 && aL < 0.5 && asat < 0.35) {
          px[o] = 255; px[o + 1] = 255; px[o + 2] = 255;
          grown[n] = 1;
        }
      }
    }
  }
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const r = px[i] / 255;
    const gg = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
    const hardware = lightSource ? 0 : grown[j] ? 1 : sstep(hwLo, hwHi, L) * (sat < 0.2 ? 1 : 0);
    // Floor at 0.55: baked fold shading would otherwise drag light
    // colourways (Bone) down into dirty grey. Dark colourways still read
    // because their base values are dark to begin with.
    // tintAll: cap the brightness too, so painted white dots melt into the
    // fabric instead of showing as pale blobs beside the button geometry.
    const Ls = tintAll && L > 0.6 && sat < 0.2 ? ref : L;
    const fabricShade = 0.55 + 0.45 * Math.min(1, Math.max(0, Ls / (ref * 1.65)));
    px[i] = br * fabricShade * (1 - hardware) + px[i] * hardware;
    px[i + 1] = bg * fabricShade * (1 - hardware) + px[i + 1] * hardware;
    px[i + 2] = bb * fabricShade * (1 - hardware) + px[i + 2] * hardware;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // match GLTF texture convention
  t.anisotropy = 8;
  return t;
}

// Client-supplied single-mesh product GLBs (black baked albedo).
// Black renders as authored; other colourways get a hardware-preserving
// re-tint (see recolorAlbedo). Geometry is shared from the GLTF cache —
// only the cloned material is disposed.
function useClientModel(file, color, tintAll = false) {
  const { scene } = useGLTF(file);
  const texCache = useRef({});
  const data = useMemo(() => {
    let g = null;
    let m = null;
    scene.traverse((o) => {
      if (!g && o.isMesh) { g = o.geometry; m = o.material; }
    });
    const mat = m.clone();
    // Generator PBR maps are unreliable (random shiny patches under the
    // studio lights — the jacket ships scalar factors and renders clean).
    // Force the same predictable fabric everywhere; keep the normal map
    // weave. specularIntensity covers KHR_materials_specular models.
    mat.metalness = 0;
    mat.roughness = 0.9;
    mat.metalnessMap = null;
    mat.roughnessMap = null;
    if ('specularIntensity' in mat) mat.specularIntensity = 0;
    // Every colourway goes through the adaptive re-tint: source albedos
    // differ (black softshell vs tan cap), so "render black as-is" would
    // show the wrong base colour on light-sourced models.
    const img = m.map?.image;
    if (img && img.width) {
      if (!texCache.current[color]) texCache.current[color] = recolorAlbedo(img, color, tintAll);
      mat.map = texCache.current[color];
      mat.color = new THREE.Color('#ffffff');
    } else {
      mat.map = null;
      mat.color = new THREE.Color(color);
    }
    mat.needsUpdate = true;
    return { geometry: g, material: mat };
  }, [scene, color, tintAll]);
  useEffect(() => () => { data.material.dispose(); }, [data.material]);
  useEffect(() => {
    const cache = texCache.current;
    return () => {
      Object.values(cache).forEach((t) => t.dispose());
    };
  }, []);
  return data;
}

// Same re-tint as useClientModel, plus normalization into canonical garment
// space (width 1, hem at y=0 — see canonicalFit): any Y-up, hem-at-bottom
// top mesh renders at identical stature, so ONE decal table fits every
// model and swapping the .glb needs no retuning. Clone before transforming;
// the GLTF cache stays pristine.
function useCanonicalModel(file, color, tintAll = false) {
  const { geometry, material } = useClientModel(file, color, tintAll);
  const normalized = useMemo(() => {
    if (!geometry) return null;
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    const { scale, offset } = canonicalFit({
      minX: b.min.x, maxX: b.max.x, minY: b.min.y,
      minZ: b.min.z, maxZ: b.max.z,
    });
    const g = geometry.clone();
    g.scale(scale, scale, scale);
    g.translate(offset[0], offset[1], offset[2]);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }, [geometry]);
  useEffect(() => () => { normalized?.dispose(); }, [normalized]);
  return { geometry: normalized, material, refW: 1 };
}

// Every rider top (jacket/polo/tee/…) renders through here. New top product
// = one RIDER_MODELS row; no component, no decal table, no scale to tune.
// Polo buttons are real geometry, not texture: the generator's button UVs
// straddle the painted dots, so no albedo trick can recolour them cleanly.
// Three flat tone-on-tone discs (collar band + two placket buttons) like a
// real knit polo: narrower than the placket, a shade off the fabric so they
// read without looking like white pearls. Each disc caps one of the model's
// own button bumps (x/y in model units, measured on the mesh), and z is found
// by casting onto the shirt so the disc sits on the cloth. The painted white
// dots (offset from the bumps by the generator) are toned down in
// recolorAlbedo instead.
const POLO_BUTTONS = [
  { x: -0.025, y: 1.055 },
  { x: 0.009, y: 0.996 },
  { x: 0.009, y: 0.933 },
];
const POLO_BUTTON_RADIUS = 0.0105;
// A shade lighter on dark fabric, a shade darker on light fabric.
function buttonTone(hex) {
  const c = new THREE.Color(hex);
  const hsl = c.getHSL({});
  return c.setHSL(hsl.h, hsl.s * 0.85, hsl.l < 0.5 ? Math.min(1, hsl.l + 0.07) : hsl.l - 0.08).getStyle();
}
function usePoloButtons(geometry, on) {
  return useMemo(() => {
    if (!on || !geometry) return [];
    const mesh = new THREE.Mesh(geometry);
    const ray = new THREE.Raycaster();
    const out = [];
    for (const b of POLO_BUTTONS) {
      ray.set(new THREE.Vector3(b.x, b.y, 2), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(mesh, false)[0];
      if (!hit) continue;
      const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 0, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      out.push({ key: b.y, position: hit.point.clone().addScaledVector(n, 0.002).toArray(), quaternion: q.toArray() });
    }
    return out;
  }, [geometry, on]);
}
export function TopGLB({ file, productId, color, slots, valid, zoom, shift, onShift, selectedPos, onSelectPos, draggingPos, onDragging, onDragVis, tipRef, posLabels, aspects, clean, hotspots, buttons, onPlace, onMoveSlot }) {
  const { geometry, material } = useCanonicalModel(file, color, Boolean(buttons));
  const refW = 1; // canonical width by construction
  const anchors = useSlotAnchors(DECALS['top-glb'], { productId, slots, valid, zoom, aspects, shift, refW, space: 'product' });
  const gdrag = useGarmentDrag(anchors, { refW, onSelectPos, onShift, onDragging, onDragVis, tipRef, posLabels, selectedPos, onPlace, onMoveSlot, space: 'product' });
  const poloButtons = usePoloButtons(geometry, Boolean(buttons));
  if (!geometry) return null;
  return (
    <group position={[0, -1.0, 0]} scale={1.8}>
      <mesh geometry={geometry} material={material} {...gdrag.props}>
        <SlotStickers anchors={anchors} depth={0.44} selectedPos={selectedPos} draggingPos={draggingPos} clean={clean} hotspots={hotspots} geometry={geometry} />
      </mesh>
      {poloButtons.map((b) => (
        <mesh key={b.key} position={b.position} quaternion={b.quaternion}>
          <cylinderGeometry args={[POLO_BUTTON_RADIUS, POLO_BUTTON_RADIUS * 0.92, 0.0035, 24]} />
          <meshStandardMaterial color={buttonTone(color)} roughness={0.35} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

const CAP_FILE = '/models/rider/cap.glb';

// Cap logo rays in the GLB's asset units (crown ~0.66 wide, brim along Z):
// cast from outside the crown, plant the patch where the ray actually hits.
// A miss renders nothing — never a floating logo.
const CAP_RAYS = {
  front: { origin: [0, 0.42, 1.2], dir: [0, -0.12, -1], wFrac: 0.3 },
  // Side patches sit mid side panel: the crown runs z -0.42..0.17 at this
  // height (measured), so its side centre is z -0.12. At z 0.05 they hugged
  // the front panel.
  'side-left': { origin: [-1.2, 0.34, -0.12], dir: [1, -0.1, 0], wFrac: 0.24 },
  'side-right': { origin: [1.2, 0.34, -0.12], dir: [-1, -0.1, 0], wFrac: 0.24 },
  // Rear crown curves tight: the patch needs extra clearance (0.02) or
  // its edges sink into the crown (clipped logo).
  back: { origin: [0, 0.68, -1.2], dir: [0, -0.3, 1], wFrac: 0.34, eps: 0.02 },
};

const _ray = new THREE.Raycaster();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _probe = new THREE.Mesh();
function raycastPatch(geometry, origin, dir, eps = 0.006) {
  _o.set(...origin);
  _d.set(...dir).normalize();
  _ray.set(_o, _d);
  _probe.geometry = geometry;
  _probe.updateMatrixWorld();
  const hits = _ray.intersectObject(_probe, false);
  const hit = hits[0];
  if (!hit) return null;
  const n = hit.face?.normal || new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(_zAxis, n.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const p = hit.point.clone().addScaledVector(n.clone().normalize(), eps);
  return { position: [p.x, p.y, p.z], rotation: [e.x, e.y, e.z] };
}

// Slot pose from a surface hit: normal out of the crown, "up" as close to
// world up as the surface allows (a minimal-rotation quaternion would turn
// the rear logo upside down).
const _up = new THREE.Vector3(0, 1, 0);
function capSlotDef(geometry, ray, depth) {
  const placed = raycastPatch(geometry, ray.origin, ray.dir, 0);
  if (!placed) return null;
  // Face along the (symmetric) ray, not the hit triangle's normal: one
  // skewed triangle on the crown tilted the whole rear logo.
  const n = new THREE.Vector3(...ray.dir).normalize().negate();
  const right = new THREE.Vector3().crossVectors(_up, n).normalize();
  const up = new THREE.Vector3().crossVectors(n, right);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
  const [x, y, z] = placed.position;
  return { x, y, z, rx: e.x, ry: e.y, rz: e.z, depth };
}

export function CapGLB({ productId = 'cap', color, slots, valid, zoom, shift, onShift, selectedPos, onSelectPos, draggingPos, onDragging, onDragVis, tipRef, posLabels, aspects, clean, hotspots, onPlace, onMoveSlot }) {
  const { geometry, material } = useClientModel(CAP_FILE, color);
  const capW = useMemo(() => {
    if (!geometry) return 0.66;
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    return Math.max(0.1, b.max.x - b.min.x);
  }, [geometry]);
  // Cap slots come from where each ray actually hits the crown, then share
  // the same slot records, decals, drag and clamp as every other product.
  const defs = useMemo(() => {
    if (!geometry) return {};
    const out = {};
    for (const pos of Object.keys(CAP_RAYS)) {
      const d = capSlotDef(geometry, CAP_RAYS[pos], 0.3 * capW);
      if (d) out[pos] = d;
    }
    return out;
  }, [geometry, capW]);
  const anchors = useSlotAnchors(defs, { productId, slots, valid, zoom, aspects, shift, refW: capW, space: 'product' });
  const gdrag = useGarmentDrag(anchors, { refW: capW, onSelectPos, onShift, onDragging, onDragVis, tipRef, posLabels, selectedPos, onPlace, onMoveSlot, space: 'product' });
  if (!geometry) return null;
  return (
    <group position={[0, -0.3, 0]} scale={1.6}>
      <mesh geometry={geometry} material={material} {...gdrag.props}>
        <SlotStickers anchors={anchors} depth={0.3 * capW} selectedPos={selectedPos} draggingPos={draggingPos} clean={clean} hotspots={hotspots} geometry={geometry} />
      </mesh>
    </group>
  );
}

const DECALS = {
  // [x, y, z, rotX, rotY, wFrac] — positions tuned per mesh; wFrac sizes the
  // logo as a fraction of the garment's measured width (refW at each call
  // site), so proportions survive model swaps.
  // [x, y, z, rotX, rotY, wFrac] in CANONICAL garment space (width 1, hem
  // at y=0 — every rider top normalizes into it, see canonicalFit). wFrac
  // sizes the logo as a fraction of the garment width. ONE table fits all
  // top models: swapping the .glb needs no retuning while proportions stay
  // shirt-like (chest ≈ y 0.82, sleeves ≈ ±0.39 — the measured mean of the
  // jacket + polo meshes). A model breaking that assumption gets its own
  // layout here instead.
  'top-glb': {
    'chest-left': [-0.20, 0.82, 0.22, 0, -0.25, 0.14],
    'chest-right': [0.20, 0.82, 0.22, 0, 0.25, 0.14],
    // Sleeve-outer patches: the flat ±x-facing band, NOT the shoulder top
    // (whose upward normal clips the print). Shallow per-slot depth keeps
    // the print off the torso wall behind the arm. Shoulder patches sit on
    // the shoulder seam, tilted up-forward to meet its normal.
    'sleeve-left': [-0.46, 0.72, -0.01, 0, -1.25, 0.18, 0.12],
    'sleeve-right': [0.46, 0.72, -0.01, 0, 1.25, 0.18, 0.12],
    'shoulder-left': [-0.32, 1.05, 0.13, -0.85, -0.47, 0.14],
    'shoulder-right': [0.32, 1.05, 0.13, -0.85, 0.47, 0.14],
    back: [0, 0.76, -0.246, 0, Math.PI, 0.55],
  },
  top: {
    'chest-left': [-0.23, 0.32, 0.44, 0, 0, 0.22],
    'chest-right': [0.23, 0.32, 0.44, 0, 0, 0.22],
    'sleeve-left': [-0.44, 0.66, 0.27, 0, -0.55, 0.14],
    'sleeve-right': [0.44, 0.66, 0.27, 0, 0.55, 0.14],
    // Procedural fallback only (jacket GLB missing): seam-top shoulder patches.
    'shoulder-left': [-0.42, 0.86, 0.22, -0.6, -0.45, 0.13],
    'shoulder-right': [0.42, 0.86, 0.22, -0.6, 0.45, 0.13],
    back: [0, 0.3, -0.44, 0, Math.PI, 0.45],
  },
  // Cap GLB placement is raycast (CAP_RAYS above), not tabled: the logo
  // lands where the ray hits the crown, so model swaps can't float it.
  // Procedural cap fallback (cap GLB missing), same slot ids as the GLB.
  cap: {
    front: [0, 0.52, 0.78, -0.35, 0, 0.22],
    'side-left': [-0.8, 0.42, 0.28, -0.2, -1.05, 0.14],
    'side-right': [0.8, 0.42, 0.28, -0.2, 1.05, 0.14],
    back: [0, 0.52, -0.78, 0.35, Math.PI, 0.45],
  },
  flat: {
    // box top face: plane rotated flat, logo top points away.
    'side-left': [-0.5, 0.1, 0.25, -Math.PI / 2, 0, 0.2],
    'side-right': [0.5, 0.1, 0.25, -Math.PI / 2, 0, 0.2],
    back: [0, 0.1, -0.02, -Math.PI / 2, 0, 0.35],
  },
  bonnet: {
    forehead: [0, 0.1, 0.26, 0, 0, 0.35],
    'ear-left': [-0.28, 0.32, 0.2, 0, -0.4, 0.2],
    'ear-right': [0.28, 0.32, 0.2, 0, 0.4, 0.2],
  },
};

// Slot records for one garment: only the slots this product offers, each
// sized from its print area in mm (slotSizeUnits). `space` names the mesh
// the defs live in (SLOT_SPACES): an admin-placed pose there wins over the
// code default and is the only pose of an admin-added slot. Procedural
// fallbacks pass none, their units differ.
function useSlotAnchors(defs, { productId, slots, valid, zoom, aspects, shift, refW, space }) {
  const validKey = valid.join('|');
  const version = merchCatalogVersion();
  return useMemo(() => {
    const own = {};
    for (const { id } of merchPositions(productId)) {
      const d = (space && slotPose(productId, id, space)) || defs?.[id];
      if (d) own[id] = d;
    }
    return buildHoverTargets(own, {
      slots, ok: new Set(valid), zoom, aspects, shift, refW,
      slotSize: (pos) => slotSizeUnits(productId, pos, refW),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs, productId, slots, validKey, zoom, aspects, shift, refW, space, version]);
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Slot under a point on the garment (mesh-local). The point is measured
// in the slot's own right/up frame, so side and shoulder slots hit-test as
// well as the chest. Slots facing away from the camera never win, and the
// smallest slot wins an overlap (a chest slot over the large back area).
function pickSlot(anchors, p, cam) {
  let best = null;
  let bestArea = Infinity;
  for (const a of anchors || []) {
    if (a.fx * cam[0] + a.fy * cam[1] + a.fz * cam[2] <= 0.05) continue;
    const d = [p.x - a.sx, p.y - a.sy, p.z - a.sz];
    const u = dot3(d, a.right);
    const v = dot3(d, a.up);
    const n = dot3(d, [a.fx, a.fy, a.fz]);
    if (Math.abs(u) > a.slotW * 0.6 || Math.abs(v) > a.slotH * 0.6) continue;
    if (Math.abs(n) > Math.max(a.slotW, a.slotH)) continue;
    const area = a.slotW * a.slotH;
    if (area < bestArea) { best = a; bestArea = area; }
  }
  return best;
}

// Press a logo to select it and drag it in the same gesture; press an
// empty slot to select it; press anywhere else to orbit. The logo follows
// the pointer ON the surface: each move raycasts the garment and projects
// the travel onto the slot's right/up axes, so a back or shoulder logo
// moves the way the hand moves. The logo stays inside its print area and
// snaps to the centre lines. One commit on release = one undo step.
const SNAP_IN = 0.03;
const SNAP_OUT = 0.06;
// Admin spot drag: snap to the centre line within 1.2% of the garment width.
const SLOT_SNAP = 0.012;

function useGarmentDrag(anchors, { refW, selectedPos, onSelectPos, onShift, onDragging, onDragVis, tipRef, posLabels, onPlace, onMoveSlot, space }) {
  const controls = useThree((st) => st.controls);
  const gl = useThree((st) => st.gl);
  const camera = useThree((st) => st.camera);
  const drag = useRef(null);
  const movingSlot = useRef(false); // admin spot drag in progress
  const meshRef = useRef(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const live = useRef({});
  live.current = { anchors, refW, selectedPos, onSelectPos, onShift, onDragging, onDragVis, tipRef, posLabels, place: space && onPlace ? (pose) => onPlace(pose, space) : null,
    moveSlot: space && onMoveSlot ? (pos, pose, done) => onMoveSlot(pos, pose, space, done) : null };
  const camDir = () => {
    const th = controls ? controls.getAzimuthalAngle() : 0;
    const ph = controls ? controls.getPolarAngle() : Math.PI / 2;
    return [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
  };
  // Garment point under the pointer, in mesh-local units (null off-garment).
  const hitAt = (clientX, clientY) => {
    const m = meshRef.current;
    if (!m) return null;
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(m, false);
    return hits.length ? m.worldToLocal(hits[0].point.clone()) : null;
  };
  const showTip = (clientX, clientY, hit) => {
    const { tipRef, posLabels, place, onShift, moveSlot } = live.current;
    // View-only stage (an order page): no hints, nothing to grab.
    if (!onShift && !moveSlot && !place) return;
    if (place) {
      // Admin placing a slot: the whole surface is a target.
      document.body.style.cursor = hit ? 'crosshair' : '';
      if (tipRef?.current) tipRef.current.style.opacity = '0';
      return;
    }
    document.body.style.cursor = !hit ? '' : hit.id || live.current.moveSlot ? 'grab' : 'pointer';
    const el = tipRef?.current;
    if (!el) return;
    if (!hit) { el.style.opacity = '0'; return; }
    const rect = gl.domElement.getBoundingClientRect();
    el.firstChild.textContent = posLabels?.[hit.pos] || hit.pos;
    el.lastChild.textContent = live.current.moveSlot ? 'Drag to move the spot' : hit.id ? 'Drag to move' : 'Click to add a logo';
    el.style.transform = `translate(${Math.round(clientX - rect.left + 14)}px,${Math.round(clientY - rect.top + 12)}px)`;
    el.style.opacity = '1';
  };
  // Hover runs on a plain canvas listener with its own raycast, so the hint
  // never depends on which decal child the 3D event pipeline reports.
  useEffect(() => {
    const el = gl.domElement;
    if (!el) return;
    const onMove = (ev) => {
      if (ev.buttons !== 0) return;
      const p = hitAt(ev.clientX, ev.clientY);
      showTip(ev.clientX, ev.clientY, live.current.place ? p : p && pickSlot(live.current.anchors, p, camDir()));
    };
    const onLeave = () => {
      const tip = live.current.tipRef?.current;
      if (tip) tip.style.opacity = '0';
      document.body.style.cursor = '';
    };
    // The canvas allows vertical page scroll on touch (touch-action: pan-y).
    // While a logo is being dragged, block that scroll so the drag is not
    // cancelled when the finger moves up or down.
    const onTouchMove = (ev) => { if (drag.current || movingSlot.current) ev.preventDefault(); };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('touchmove', onTouchMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, controls]);
  return useMemo(() => {
    const end = (commit) => {
      const d = drag.current;
      drag.current = null;
      if (controls) controls.enabled = true;
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', winMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      const { onShift, onDragging, onDragVis } = live.current;
      onDragging?.(null);
      onDragVis?.(null);
      if (commit && d && d.moved && onShift) onShift(d.pos, { x: clampShift(d.nx), y: clampShift(d.ny) });
    };
    const onUp = () => end(true);
    const onCancel = () => end(false);
    // The pointer is mapped onto the slot's flat print plane, not the cloth:
    // a mesh raycast jitters over folds and loses the logo off the edge.
    const winMove = (e) => {
      const d = drag.current;
      if (!d) return;
      const ndc = new THREE.Vector2(((e.clientX - d.rect.left) / d.rect.width) * 2 - 1, -((e.clientY - d.rect.top) / d.rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const w = raycaster.ray.intersectPlane(d.plane, new THREE.Vector3());
      if (!w) return; // plane edge-on to the camera: hold the last spot
      const p = d.m.worldToLocal(w);
      const a = (live.current.anchors || []).find((x) => x.pos === d.pos) || d.a;
      const delta = [p.x - d.p0.x, p.y - d.p0.y, p.z - d.p0.z];
      const off = clampLogoOffset({
        slotW: a.slotW, slotH: a.slotH, w: a.w, h: a.h, spinDeg: a.spin,
        x: d.u0 + dot3(delta, a.right),
        y: d.v0 + dot3(delta, a.up),
      });
      // Centre-line snap with hysteresis: enter within 3% of the slot,
      // release only past 6%, so the logo never sticks then jumps.
      const snapAxis = (v, size, was) => Math.abs(v) < (was ? SNAP_OUT : SNAP_IN) * size;
      d.snapX = snapAxis(off.x, a.slotW, d.snapX);
      d.snapY = snapAxis(off.y, a.slotH, d.snapY);
      const rw = live.current.refW || 1;
      d.nx = d.snapX ? 0 : (off.x / rw) * 100;
      d.ny = d.snapY ? 0 : (off.y / rw) * 100;
      if (Math.abs(d.nx - d.x0) + Math.abs(d.ny - d.y0) > 0.3) d.moved = true;
      if (d.raf) cancelAnimationFrame(d.raf);
      d.raf = requestAnimationFrame(() => {
        if (drag.current === d) live.current.onDragVis?.(d.pos, { x: d.nx, y: d.ny });
      });
    };
    // Admin: drag a whole spot over the surface. Each move re-casts the
    // garment and re-derives the pose there (centre line snap on front and
    // back faces); one commit on release = one undo step.
    const startSlotMove = (e, pos) => {
      e.stopPropagation();
      if (controls) controls.enabled = false;
      const g = e.eventObject;
      const rect = gl.domElement.getBoundingClientRect();
      const sd = { pose: null, raf: 0 };
      movingSlot.current = true;
      document.body.style.cursor = 'grabbing';
      const onMove = (ev) => {
        const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const h = raycaster.intersectObject(g, false)[0];
        if (!h?.face) return; // off the garment: hold the last spot
        const local = g.worldToLocal(h.point.clone()).toArray();
        const n = h.face.normal.toArray();
        const rw = live.current.refW || 1;
        if (Math.abs(n[2]) > 0.7 && Math.abs(local[0]) < SLOT_SNAP * rw) local[0] = 0;
        sd.pose = poseFromHit(local, n);
        if (sd.raf) cancelAnimationFrame(sd.raf);
        sd.raf = requestAnimationFrame(() => live.current.moveSlot?.(pos, sd.pose, false));
      };
      const finish = (commit) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        if (sd.raf) cancelAnimationFrame(sd.raf);
        movingSlot.current = false;
        if (controls) controls.enabled = true;
        document.body.style.cursor = '';
        live.current.moveSlot?.(pos, commit ? sd.pose : null, true);
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    };
    return {
      props: {
        ref: (o) => { meshRef.current = o; },
        onPointerDown: (e) => {
          const tipEl = live.current.tipRef?.current;
          if (tipEl) tipEl.style.opacity = '0';
          if (live.current.place) {
            // Cast against the garment itself, never a logo decal on it.
            const g = e.eventObject;
            raycaster.set(e.ray.origin, e.ray.direction);
            const h = raycaster.intersectObject(g, false)[0];
            if (!h?.face) return;
            e.stopPropagation();
            live.current.place(poseFromHit(g.worldToLocal(h.point.clone()).toArray(), h.face.normal.toArray()));
            return;
          }
          const m = e.object;
          const p0 = m.worldToLocal(e.point.clone());
          const hit = pickSlot(live.current.anchors, p0, camDir());
          if (!hit) return; // empty space: orbit as usual
          const { selectedPos, onSelectPos, onDragging, refW: rw } = live.current;
          if (hit.pos !== selectedPos) onSelectPos?.(hit.pos);
          if (live.current.moveSlot) { startSlotMove(e, hit.pos); return; }
          if (!hit.id || !live.current.onShift) return; // empty slot or view-only: nothing to drag
          e.stopPropagation();
          if (controls) controls.enabled = false;
          onDragging?.(hit.pos);
          // Start from where the logo really is (already clamped), not the
          // stored value, so an old out-of-range value has no dead zone.
          const rel = [hit.x - hit.sx, hit.y - hit.sy, hit.z - hit.sz];
          const u0 = dot3(rel, hit.right);
          const v0 = dot3(rel, hit.up);
          const x0 = (u0 / (rw || 1)) * 100;
          const y0 = (v0 / (rw || 1)) * 100;
          const nWorld = new THREE.Vector3(...hit.right).cross(new THREE.Vector3(...hit.up))
            .transformDirection(m.matrixWorld);
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(nWorld, e.point.clone());
          const rect = gl.domElement.getBoundingClientRect();
          drag.current = { pos: hit.pos, a: hit, m, plane, rect, p0, u0, v0, x0, y0, nx: x0, ny: y0, moved: false, snapX: false, snapY: false };
          document.body.style.cursor = 'grabbing';
          window.addEventListener('pointermove', winMove);
          window.addEventListener('pointerup', onUp);
          window.addEventListener('pointercancel', onCancel);
          window.addEventListener('blur', onCancel);
        },
        onPointerOut: () => {
          const el = live.current.tipRef?.current;
          if (el) el.style.opacity = '0';
        },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, gl, camera]);
}

// Logos and slot outlines for one garment, all from the same slot records.
// The selected slot shows its print area; with `hotspots` on, every empty
// slot shows a faint marker you can tap.
// `geometry` (optional): the garment mesh geometry, so each slot projects
// against its own small patch instead of the whole mesh (see slotRegion).
function SlotStickers({ anchors, depth, selectedPos, draggingPos, clean, hotspots, geometry }) {
  if (clean) return null;
  return anchors.map((a) => {
    const frameRot = [a.rx, a.ry, a.rz];
    const d = a.depth || depth;
    const active = a.pos === selectedPos || a.pos === draggingPos;
    const region = slotRegion(geometry, [a.sx, a.sy, a.sz], [a.slotW, a.slotH], frameRot);
    // Stable key per placement: the logo survives nudges, zooms and drags
    // without remounting (a remount flashes the decal mid-gesture).
    return (
      <Fragment key={`${a.pos}:${a.id || ''}`}>
        {a.id && (
          <Sticker id={a.id} position={[a.x, a.y, a.z]}
            rotation={[a.rx, a.ry, a.rz + (a.spin * Math.PI) / 180]}
            scale={[a.w, a.h, d]} mirror={a.mirror} region={region} />
        )}
        {active && <SlotFrameDecal position={[a.sx, a.sy, a.sz]} rotation={frameRot} size={[a.slotW, a.slotH]} depth={d} kind="range" region={region} />}
        {!active && !a.id && hotspots && (
          <SlotFrameDecal position={[a.sx, a.sy, a.sz]} rotation={frameRot} size={[a.slotW, a.slotH]} depth={d} kind="slot" region={region} />
        )}
      </Fragment>
    );
  });
}

// Horse gear with the same slot pipeline as the rider tops: decals that
// wrap the cloth, press-and-drag on the 3D model, print-area outline.
// The gear GLBs are in metres, so the garment width in mm sets refW and
// the print areas come out at their real size on the rug.
function GearSlotLayer({ geometry, material, defs, productId, slots, valid, zoom, aspects, shift, onShift, selectedPos, onSelectPos, draggingPos, onDragging, onDragVis, tipRef, posLabels, clean, hotspots, onPlace, onMoveSlot, space }) {
  const refW = (GARMENT_WIDTH_MM[merchModel(productId)] || 1000) / 1000;
  const anchors = useSlotAnchors(defs, { productId, slots, valid, zoom, aspects, shift, refW, space });
  const gdrag = useGarmentDrag(anchors, { refW, selectedPos, onSelectPos, onShift, onDragging, onDragVis, tipRef, posLabels, onPlace, onMoveSlot, space });
  return (
    <mesh geometry={geometry} material={material} {...gdrag.props}>
      <SlotStickers anchors={anchors} depth={Math.max(0.15 * refW, 0.08)} selectedPos={selectedPos} draggingPos={draggingPos} clean={clean} hotspots={hotspots} geometry={geometry} />
    </mesh>
  );
}

function TopGarment({ productId, hotspots, color, kind, slots, valid, zoom, shift, onShift, selectedPos, onSelectPos, draggingPos, onDragging, onDragVis, tipRef, posLabels, aspects, clean }) {
  const refW = 1.24; // authored torso diameter (radius 0.62)
  const torso = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.62, 0.55, 1.9, 48);
    geo.scale(1, 1, 0.72);
    return geo;
  }, []);
  const sleeve = useMemo(() => new THREE.CylinderGeometry(0.155, 0.175, 0.85, 24), []);
  const mat = { color, roughness: 0.85, metalness: 0 };
  const anchors = useSlotAnchors(DECALS.top, { productId, slots, valid, zoom, aspects, shift, refW });
  const gdrag = useGarmentDrag(anchors, { refW, selectedPos, onSelectPos, onShift, onDragging, onDragVis, tipRef, posLabels });
  return (
    <group>
      <mesh geometry={torso} {...gdrag.props}>
        <meshStandardMaterial {...mat} />
        <SlotStickers anchors={anchors} depth={0.35} selectedPos={selectedPos} draggingPos={draggingPos} clean={clean} hotspots={hotspots} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={sleeve} position={[side * 0.7, 0.52, 0]} rotation={[0, 0, side * -0.45]}>
          <meshStandardMaterial {...mat} />
        </mesh>
      ))}
      <mesh position={[0, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, kind === 'tee' ? 0.055 : 0.075, 12, 32]} />
        <meshStandardMaterial {...mat} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.06, 24]} />
        <meshStandardMaterial color="#0b0b0b" roughness={1} />
      </mesh>
      {kind === 'jacket' && (
        <mesh position={[0, 0.02, 0.452]}>
          <boxGeometry args={[0.035, 1.72, 0.02]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
        </mesh>
      )}
      {kind === 'polo' && (
        <>
          <mesh position={[0, 0.72, 0.43]}>
            <boxGeometry args={[0.1, 0.3, 0.02]} />
            <meshStandardMaterial {...mat} roughness={0.9} />
          </mesh>
          {[0.78, 0.66].map((y) => (
            <mesh key={y} position={[0, y, 0.445]}>
              <sphereGeometry args={[0.022, 12, 12]} />
              <meshStandardMaterial color="#f3ecd9" roughness={0.4} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

function CapGarment({ productId, hotspots, color, slots, valid, zoom, shift, onShift, selectedPos, onSelectPos, draggingPos, onDragging, onDragVis, tipRef, posLabels, aspects, clean }) {
  const refW = 2.0; // authored crown diameter
  const crown = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.52);
    geo.scale(1, 0.9, 1.02);
    return geo;
  }, []);
  const anchors = useSlotAnchors(DECALS.cap, { productId, slots, valid, zoom, aspects, shift, refW });
  const gdrag = useGarmentDrag(anchors, { refW, selectedPos, onSelectPos, onShift, onDragging, onDragVis, tipRef, posLabels });
  return (
    <group position={[0, -0.35, 0]}>
      <mesh geometry={crown} {...gdrag.props}>
        <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
        <SlotStickers anchors={anchors} depth={0.35} selectedPos={selectedPos} draggingPos={draggingPos} clean={clean} hotspots={hotspots} />
      </mesh>
      <mesh position={[0, 0, 0.12]}>
        <cylinderGeometry args={[1.08, 1.12, 0.07, 32, 1, false, -Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
}

function FlatGarment({ productId, hotspots, color, slots, valid, zoom, shift, onShift, selectedPos, onSelectPos, draggingPos, onDragging, onDragVis, tipRef, posLabels, wide, stripe, aspects, clean }) {
  const refW = wide ? 2.5 : 2.3; // authored RoundedBox width
  const quilt = useQuilt(color, stripe);
  const anchors = useSlotAnchors(DECALS.flat, { productId, slots, valid, zoom, aspects, shift, refW });
  const gdrag = useGarmentDrag(anchors, { refW, selectedPos, onSelectPos, onShift, onDragging, onDragVis, tipRef, posLabels });
  return (
    <group position={[0, -0.35, 0]}>
      <RoundedBox args={wide ? [2.5, 0.2, 1.9] : [2.3, 0.16, 1.7]} radius={0.06} smoothness={4} {...gdrag.props}>
        <meshStandardMaterial map={quilt} roughness={0.95} />
        <SlotStickers anchors={anchors} depth={0.35} selectedPos={selectedPos} draggingPos={draggingPos} clean={clean} hotspots={hotspots} />
      </RoundedBox>
    </group>
  );
}

function BonnetGarment({ productId, hotspots, color, slots, valid, zoom, shift, onShift, selectedPos, onSelectPos, draggingPos, onDragging, onDragVis, tipRef, posLabels, aspects, clean }) {
  const refW = 0.72; // authored box width
  const anchors = useSlotAnchors(DECALS.bonnet, { productId, slots, valid, zoom, aspects, shift, refW });
  const gdrag = useGarmentDrag(anchors, { refW, selectedPos, onSelectPos, onShift, onDragging, onDragVis, tipRef, posLabels });
  return (
    <group position={[0, -0.2, 0]}>
      <mesh {...gdrag.props}>
        <boxGeometry args={[0.72, 0.95, 0.5]} />
        <meshStandardMaterial color={color} roughness={0.95} />
        <SlotStickers anchors={anchors} depth={0.35} selectedPos={selectedPos} draggingPos={draggingPos} clean={clean} hotspots={hotspots} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.24, 0.68, 0]} rotation={[0, 0, side * -0.18]}>
          <coneGeometry args={[0.15, 0.55, 20]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
      ))}
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, 0.05, 0.26]}>
          <sphereGeometry args={[0.075, 16, 16]} />
          <meshStandardMaterial color="#0b0b0b" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

const FRAMING = {
  // Rider tops fill ~75% of the preview height at this distance; the
  // tall collar needs real headroom, so the target sits well above center
  // and the whole garment hangs clear of the top view controls.
  studio: { pos: [0, 0.4, 4.3], target: [0, 0.3, 0] },
  // Tuned on the client's horse (horse-client.glb, 1.70 tall, ears at
  // y 1.70, z 0.86).
  horse: { pos: [3.4, 1.5, 3.9], target: [0, 0.92, 0] },
  bonnet: { pos: [0.9, 1.92, 2.0], target: [0, 1.72, 0.75] },
  // Bonnet on its own (studio file, centred at y 1.63, z 0.83, ~0.27 wide).
  bonnetSolo: { pos: [0.5, 1.72, 1.54], target: [0, 1.63, 0.82] },
  // Fitted gear without the horse: per-size frames (the bonnet reuses
  // its head close-up, which fits with or without the horse).
  gearBlanket: { pos: [1.3, 1.41, 1.9], target: [0, 1.16, -0.25] },
  // Rugs sit in horse space (back at y ~1.3, hem at 0.7).
  gearRug: { pos: [2.3, 1.71, 3.1], target: [0, 0.94, -0.2] },
};

// Camera azimuth that looks straight at a slot (null: no sideways facing,
// e.g. a slot on top of a flat blanket).
function slotAzimuth(productId, pos) {
  const model = merchModel(productId);
  const placed = slotPose(productId, pos, 'product');
  let n = null;
  if (placed) {
    n = slotFrame(placed.rx, placed.ry, placed.rz).normal;
  } else if (model === 'cap') {
    const r = CAP_RAYS[pos];
    if (r) n = [-r.dir[0], -r.dir[1], -r.dir[2]];
  } else {
    const layout = model === 'ear-bonnet' ? 'bonnet'
      : ['saddle-blanket', 'rug-light', 'rug-warm'].includes(model) ? 'flat' : 'top-glb';
    const d = DECALS[layout]?.[pos];
    if (d) n = slotFrame(d[3], d[4], 0).normal;
  }
  if (!n || Math.hypot(n[0], n[2]) < 0.2) return null;
  return Math.atan2(n[0], n[2]);
}

function Rig({ view, face, zoomReq, resetReq, framing }) {
  const controls = useThree((state) => state.controls);
  const camera = useThree((state) => state.camera);
  // `view` is { angle, n }: n changes on every press, so pressing the same
  // preset again after a manual orbit still swings the camera back.
  useEffect(() => {
    if (view && controls) controls.setAzimuthalAngle(view.angle);
  }, [view, controls]);
  // Selecting a slot turns the garment only when that slot is hard to see
  // from here, so picking the chest while looking at the chest never moves.
  useEffect(() => {
    if (!face || !controls) return;
    if (Math.cos(controls.getAzimuthalAngle() - face.angle) < 0.75) controls.setAzimuthalAngle(face.angle);
  }, [face, controls]);
  useEffect(() => {
    if (!zoomReq || !controls) return;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    const len = THREE.MathUtils.clamp(dir.length() * (zoomReq.dir > 0 ? 0.8 : 1.25), 1.2, 14);
    dir.setLength(len);
    camera.position.copy(controls.target).add(dir);
    controls.update();
  }, [zoomReq, controls, camera]);
  // One shared coordinate system; reframe when the staged subject changes.
  // The reframed pose becomes the reset baseline for the dock button.
  useEffect(() => {
    if (!controls || !framing) return;
    camera.position.set(...framing.pos);
    controls.target.set(...framing.target);
    controls.update();
    controls.saveState?.();
  }, [framing, controls, camera]);
  useEffect(() => {
    if (resetReq && controls) controls.reset();
  }, [resetReq]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Horse studio: the flat five-light rig made the coat read muddy (no
// reflections, no shape). A soft room environment gives the coat and cloth
// real highlights; one key and one rim light keep the form readable.
function HorseLights() {
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const rt = pm.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.85;
    invalidate();
    return () => {
      scene.environment = null;
      rt.dispose();
      pm.dispose();
      invalidate();
    };
  }, [gl, scene, invalidate]);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#5a554c', 0.35]} />
      <directionalLight position={[3, 5, 4]} intensity={1.5} />
      <directionalLight position={[-4, 3, 2]} intensity={0.35} />
      <directionalLight position={[0, 4, -6]} intensity={1.1} />
    </>
  );
}

export default function Merch3D({ productId, color, slots, zoom, shift, onShift, selectedPos, onSelectPos, switching, stageRef, clean, hotspots, onAspects, onReady, onUndo, onRedo, canUndo, canRedo, onPlace, onMoveSlot }) {
  const [spin, setSpin] = useState(false);
  const [draggingPos, setDraggingPos] = useState(null);
  // Transient pointer offset while a logo is being dragged: visuals follow
  // every animation frame through effShift, the buyer transform commits
  // once on release (single undo step, no history spam).
  const [dragVis, setDragVis] = useState(null);
  const onDragVis = (pos, xy) => setDragVis(xy ? { pos, x: xy.x, y: xy.y } : null);
  const effShift = useMemo(() => (
    dragVis
      ? { ...shift, [dragVis.pos]: { ...(shift[dragVis.pos] || {}), x: dragVis.x, y: dragVis.y } }
      : shift
  ), [shift, dragVis]);
  // Front is the resting angle, so it starts active (same pose as the
  // default camera — setting it changes nothing visually).
  const [view, setViewState] = useState({ angle: 0, n: 0 });
  const setView = (angle) => setViewState({ angle, n: Date.now() });
  const [zoomReq, setZoomReq] = useState(null);
  const [resetReq, setResetReq] = useState(null);
  const [ready, setReady] = useState(false);
  // Tell the parent the first frame is up so it can retire the onboarding
  // hint — it never returns, product switches keep the last frame mounted.
  useEffect(() => { if (ready) onReady?.(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // Horse gear shows the product alone first; the buyer opts into the horse.
  const [showHorse, setShowHorse] = useState(false);
  // Picking a slot the camera cannot see (back, far shoulder) turns the
  // garment to face it. Horse gear only knows its rear slot.
  const [face, setFace] = useState(null);
  const lastPos = useRef(null);
  useEffect(() => {
    const prev = lastPos.current;
    lastPos.current = selectedPos;
    if (!selectedPos || prev === null || prev === selectedPos) return;
    const angle = isHorseProduct(productId)
      ? (selectedPos === 'back' ? Math.PI : null)
      : slotAzimuth(productId, selectedPos);
    if (angle !== null) setFace({ angle, n: Date.now() });
  }, [selectedPos, productId]);
  // 3D branches follow the product's model: a new product reuses one.
  const model = merchModel(productId);
  const group = (() => {
    if (model === 'cap') return 'cap';
    if (model === 'ear-bonnet') return 'bonnet';
    if (model === 'saddle-blanket') return 'flat-narrow';
    if (model === 'rug-light' || model === 'rug-warm') return 'flat-wide';
    return 'top';
  })();
  const kind = model === 'jacket' ? 'jacket' : model === 'polo' ? 'polo' : 'tee';
  const isHorse = isHorseProduct(productId);
  // The ear bonnet is shown on its own for now (Imam: no horse for it).
  const canShowHorse = isHorse && model !== 'ear-bonnet';
  const horseOn = showHorse && canShowHorse;
  const topFile = riderModelFile(productId);
  const filledIds = useMemo(() => [...new Set(Object.values(slots).filter(Boolean).map(String))], [slots]);
  const valid = useValidLogos(filledIds);
  const aspects = useLogoAspects(filledIds);
  useEffect(() => { onAspects?.(aspects); }, [aspects]); // eslint-disable-line react-hooks/exhaustive-deps
  // Hover labels for the supported placement under the pointer.
  const tipRef = useRef(null);
  const posLabels = useMemo(
    () => Object.fromEntries(merchPositions(productId).map((p) => [p.id, p.label])),
    [productId],
  );
  // Product-only framing for horse gear; the horse keeps its wide frame.
  const framing = !isHorse ? FRAMING.studio
    : model === 'ear-bonnet' ? FRAMING.bonnetSolo
    : horseOn ? FRAMING.horse
    : model === 'saddle-blanket' ? FRAMING.gearBlanket : FRAMING.gearRug;
  // Shared garment props (every product component takes the same set).
  const gp = {
    productId, color, slots, valid, zoom, shift: effShift, onShift,
    onDragging: setDraggingPos, onDragVis, draggingPos, tipRef, posLabels,
    selectedPos, onSelectPos, aspects, clean, hotspots, onPlace, onMoveSlot,
  };
  // Studio = the item alone, horse = worn: two meshes, two slot poses.
  const gearLayer = { Layer: GearSlotLayer, props: { ...gp, space: horseOn ? 'horse' : 'product' } };
  const bumpZoom = (dir) => setZoomReq({ dir, n: Date.now() });
  const goFullscreen = () => {
    const el = stageRef?.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };

  return (
    <>
      <div className={s.viewBar} role="group" aria-label="Preview views">
        <button type="button" className={s.viewBtn} aria-pressed={view.angle === 0} onClick={() => setView(0)}>Front</button>
        <button type="button" className={s.viewBtn} aria-pressed={view.angle === Math.PI} onClick={() => setView(Math.PI)}>Back</button>
        <button type="button" className={s.viewBtn} aria-pressed={view.angle === -Math.PI / 2} onClick={() => setView(-Math.PI / 2)}>Left</button>
        <button type="button" className={s.viewBtn} aria-pressed={view.angle === Math.PI / 2} onClick={() => setView(Math.PI / 2)}>Right</button>
        {canShowHorse && (
          <button type="button" className={s.viewBtn} aria-pressed={horseOn} onClick={() => setShowHorse((v) => !v)}>
            {horseOn ? 'Hide horse' : 'Show horse'}
          </button>
        )}
        <button type="button" className={s.viewBtn} aria-pressed={spin} onClick={() => setSpin((v) => !v)}>
          {spin ? 'Stop 360° spin' : 'Auto-spin 360°'}
        </button>
        {switching && <span className={s.switchBadge} role="status">Loading…</span>}
      </div>
      <div className={s.gl} role="application" aria-label={`Drag to rotate the 3D ${productId} — + and − buttons zoom`}>
        <Canvas
          // Idle stage draws nothing: frames only on camera moves, prop
          // changes and texture loads (OrbitControls invalidates on change).
          // Auto-spin needs a continuous loop.
          frameloop={spin ? 'always' : 'demand'}
          dpr={[1, 1.75]}
          camera={{ position: [0, 0.4, 4.8], fov: 38 }}
          gl={{ antialias: true, alpha: true }}
          onCreated={() => setReady(true)}
        >
          {isHorse ? <HorseLights /> : (
            <>
              <ambientLight intensity={0.9} />
              <hemisphereLight args={['#ffffff', '#232323', 0.75]} />
              <directionalLight position={[3, 5, 4]} intensity={1.7} />
              <directionalLight position={[0, 1, 6]} intensity={1.15} />
              <directionalLight position={[-2, 6, 5]} intensity={0.9} />
              <directionalLight position={[-4, 2, -3]} intensity={0.7} />
              <directionalLight position={[0, 4, -6]} intensity={2.0} />
            </>
          )}
          <Suspense fallback={null}>
            {isHorse ? (
              <SceneErrorBoundary
                fallback={model === 'ear-bonnet'
                  ? <BonnetGarment {...gp} />
                  : <FlatGarment {...gp} wide={model !== 'saddle-blanket'} stripe={model === 'saddle-blanket'} />}
              >
                <GearShiftContext.Provider value={clean ? null : effShift}>
                  <GearSlotContext.Provider value={gearLayer}>
                    {horseOn
                      ? <HorseScene productId={model} color={color} slots={slots} zoom={zoom} aspects={aspects} />
                      // "Show horse" puts the gear on the full horse.
                      : <FittedGear productId={model} color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} />}
                  </GearSlotContext.Provider>
                </GearShiftContext.Provider>
              </SceneErrorBoundary>
            ) : (
              <>
                {group === 'top' && (topFile
                  ? <TopGLB {...gp} file={topFile} buttons={model === 'polo'} />
                  : <TopGarment {...gp} kind={kind} />)}
                {group === 'cap' && <CapGLB {...gp} />}
                {group === 'flat-narrow' && <FlatGarment {...gp} wide={false} stripe />}
                {group === 'flat-wide' && <FlatGarment {...gp} wide stripe={false} />}
                {group === 'bonnet' && <BonnetGarment {...gp} />}
              </>
            )}
          </Suspense>
          <ContactShadows position={[0, isHorse ? 0.02 : -1.25]} opacity={0.45} scale={isHorse ? 9 : 6} blur={2.4} far={2.5} color="#000000" />
          <OrbitControls
            makeDefault
            enablePan={false}
            minDistance={1.2}
            maxDistance={isHorse ? 14 : 9}
            minPolarAngle={0.45}
            maxPolarAngle={Math.PI * 0.62}
            autoRotate={spin}
            autoRotateSpeed={2.2}
          />
          <Rig
            view={view}
            face={face}
            zoomReq={zoomReq}
            resetReq={resetReq}
            framing={framing}
          />
        </Canvas>
        <div ref={tipRef} className={s.hoverTip} aria-hidden="true"><strong /><small>Select in Branding</small></div>
        {!ready && (
          <div className={s.loadVeil} role="status" aria-label="Loading 3D preview">
            <span className={s.spinner} aria-hidden="true" />
            <span>Preparing 3D preview…</span>
          </div>
        )}
        <div className={s.dock} role="group" aria-label="Camera controls">
          <button type="button" className={s.dockBtn} onClick={() => bumpZoom(1)} aria-label="Zoom in">+</button>
          <button type="button" className={s.dockBtn} onClick={() => bumpZoom(-1)} aria-label="Zoom out">−</button>
          {!clean && onUndo && (
            <>
              <button type="button" className={s.dockBtn} onClick={onUndo} disabled={!canUndo} aria-label="Undo change">↩</button>
              <button type="button" className={s.dockBtn} onClick={onRedo} disabled={!canRedo} aria-label="Redo change">↪</button>
            </>
          )}
          <button type="button" className={s.dockBtn} onClick={() => setResetReq({ n: Date.now() })} aria-label="Reset view">⟲</button>
          <button type="button" className={s.dockBtn} onClick={goFullscreen} aria-label="Fullscreen preview">⛶</button>
        </div>
      </div>
    </>
  );
}
