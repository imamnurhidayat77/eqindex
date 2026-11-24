// The client's ear bonnet socks are slimmer than horse-warmblood.glb's
// ears, so the ears poke through. While the bonnet is worn, each ear is
// shrunk toward its own base (measured: ears rise from y ~1.89 at
// x +/-0.075, z ~0.90 to tips at y 2.01). Pure function on a flat
// xyz array; returns a new array, the input is untouched.
export const EAR_BASE = { x: 0.075, y: 1.885, z: 0.9 };

export function tuckEars(positions, { shrink = 0.45, from = 1.88, to = 1.93 } = {}) {
  const out = new Float32Array(positions);
  for (let i = 0; i < out.length; i += 3) {
    const x = out[i], y = out[i + 1], z = out[i + 2];
    if (y <= from || z < 0.8 || Math.abs(x) < 0.015) continue;
    const t = Math.min(1, (y - from) / (to - from));
    const f = 1 - shrink * t * t * (3 - 2 * t);
    const bx = Math.sign(x) * EAR_BASE.x;
    out[i] = bx + (x - bx) * f;
    out[i + 1] = EAR_BASE.y + (y - EAR_BASE.y) * f;
    out[i + 2] = EAR_BASE.z + (z - EAR_BASE.z) * f;
  }
  return out;
}
