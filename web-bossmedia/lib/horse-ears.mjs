// The client's ear bonnet socks are slimmer than the horse's ears, so the
// ears poke through. While the bonnet is worn, each ear is shrunk toward
// its own base. Pure function on a flat xyz array; returns a new array,
// the input is untouched.
// EAR_BASE / defaults: horse-warmblood.glb (ears rise from y ~1.89 at
// x +/-0.075, z ~0.90 to tips at y 2.01).
export const EAR_BASE = { x: 0.075, y: 1.885, z: 0.9 };
// horse-client.glb: short ears that leave the poll at y 1.645 (x +/-0.08,
// z 0.84), tips at y 1.70.
export const CLIENT_EARS = { base: { x: 0.084, y: 1.64, z: 0.84 }, shrink: 0.6, from: 1.645, to: 1.69, zMin: 0.75 };

export function tuckEars(positions, { base = EAR_BASE, shrink = 0.45, from = 1.88, to = 1.93, zMin = 0.8 } = {}) {
  const out = new Float32Array(positions);
  for (let i = 0; i < out.length; i += 3) {
    const x = out[i], y = out[i + 1], z = out[i + 2];
    if (y <= from || z < zMin || Math.abs(x) < 0.015) continue;
    const t = Math.min(1, (y - from) / (to - from));
    const f = 1 - shrink * t * t * (3 - 2 * t);
    const bx = Math.sign(x) * base.x;
    out[i] = bx + (x - bx) * f;
    out[i + 1] = base.y + (y - base.y) * f;
    out[i + 2] = base.z + (z - base.z) * f;
  }
  return out;
}
