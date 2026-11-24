'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useValidLogos } from './MerchDecals';
import { FittedGear } from './HorseGear';
import { tuckEars } from '../lib/horse-ears.mjs';

const HORSE_FILE = '/models/horse/horse-warmblood.glb';

// Show-ring groom: a slightly deeper bay and a glossier coat than the raw
// scan, so the horse reads like a turned-out show jumper under the studio
// environment light. Tuned on the cached material once (shared scene).
function groom(scene) {
  scene.traverse((o) => {
    if (!o.isMesh || o.userData.groomed) return;
    o.userData.groomed = true;
    const m = o.material;
    m.color.set('#e2d3c9');
    m.roughness = 0.62;
    m.metalness = 0;
    m.envMapIntensity = 1.15;
    m.needsUpdate = true;
  });
}

// Base horse. Rendered as its own object — gear is never merged into it.
// With the ear bonnet on, a copy with the ears tucked into the socks is
// drawn instead (the client's socks are slimmer than this horse's ears).
export function HorseModel({ earsTucked = false }) {
  const { scene } = useGLTF(HORSE_FILE);
  useMemo(() => groom(scene), [scene]);
  const tucked = useMemo(() => {
    if (!earsTucked) return null;
    let mesh = null;
    scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
    if (!mesh) return null;
    const g = mesh.geometry.clone();
    // The loader interleaves position/normal/uv: copy xyz out first.
    // Authored normals are kept, the ears end up inside the socks anyway.
    const src = g.attributes.position;
    const xyz = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) {
      xyz[i * 3] = src.getX(i);
      xyz[i * 3 + 1] = src.getY(i);
      xyz[i * 3 + 2] = src.getZ(i);
    }
    g.setAttribute('position', new THREE.BufferAttribute(tuckEars(xyz), 3));
    return { geometry: g, material: mesh.material };
  }, [scene, earsTucked]);
  useEffect(() => () => tucked?.geometry.dispose(), [tucked]);
  if (tucked) return <mesh geometry={tucked.geometry} material={tucked.material} />;
  return <primitive object={scene} />;
}

// Display head for the ear bonnet without the horse: the horse's own head
// and upper neck as a plain matte form (like a shop mannequin), cut behind
// the jaw by a clipping plane. The bonnet is shaped on this head, so it
// sits exactly as it does on the horse.
const HEAD_CUT = new THREE.Plane(new THREE.Vector3(0, 0.35, 1).normalize(), 0);
HEAD_CUT.constant = -HEAD_CUT.normal.dot(new THREE.Vector3(0, 1.5, 0.6));
export function DisplayHead() {
  const { scene } = useGLTF(HORSE_FILE);
  const gl = useThree((st) => st.gl);
  useEffect(() => { gl.localClippingEnabled = true; }, [gl]);
  const geometry = useMemo(() => {
    let g = null;
    scene.traverse((o) => { if (!g && o.isMesh) g = o.geometry; });
    return g;
  }, [scene]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#6f6a63', roughness: 0.8, metalness: 0, envMapIntensity: 0.55, clippingPlanes: [HEAD_CUT], side: THREE.DoubleSide,
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} />;
}

export function HorseScene({ productId, color, slots, zoom, aspects }) {
  const filledIds = useMemo(() => [...new Set(Object.values(slots).filter(Boolean).map(String))], [slots]);
  const valid = useValidLogos(filledIds);
  return (
    <>
      <HorseModel earsTucked={productId === 'ear-bonnet'} />
      <FittedGear productId={productId} color={color} slots={slots} valid={valid} zoom={zoom} aspects={aspects} draped />
    </>
  );
}
