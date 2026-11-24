import test from 'node:test';
import assert from 'node:assert/strict';
import { EAR_BASE, tuckEars } from '../horse-ears.mjs';

test('ear tips are pulled toward the ear base, the rest stays put', () => {
  const tip = [0.067, 2.01, 0.951];
  const brow = [0, 1.8, 1.05];
  const neck = [0.1, 1.95, 0.6];
  const out = tuckEars(new Float32Array([...tip, ...brow, ...neck]));
  const d0 = Math.hypot(tip[0] - EAR_BASE.x, tip[1] - EAR_BASE.y, tip[2] - EAR_BASE.z);
  const d1 = Math.hypot(out[0] - EAR_BASE.x, out[1] - EAR_BASE.y, out[2] - EAR_BASE.z);
  assert.ok(d1 < d0 * 0.6, 'tip tucked');
  assert.deepEqual([...out.slice(3, 9)].map((v) => +v.toFixed(5)), [...brow, ...neck].map((v) => +v.toFixed(5)));
});

test('input array is not modified', () => {
  const a = new Float32Array([0.067, 2.01, 0.951]);
  tuckEars(a);
  assert.equal(a[1], new Float32Array([2.01])[0]);
});

test('client horse ears tuck toward their own base', async () => {
  const { CLIENT_EARS } = await import('../horse-ears.mjs');
  const tip = [0.084, 1.7, 0.86];
  const out = tuckEars(new Float32Array(tip), CLIENT_EARS);
  assert.ok(out[1] < 1.68, 'tip lowered');
  const muzzle = new Float32Array([0, 1.2, 1.1]);
  assert.deepEqual([...tuckEars(muzzle, CLIENT_EARS)], [...muzzle]);
});
