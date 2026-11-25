// Unit: phone-feel guards in globals.css (see docs/UI_AUDIT_BOSSMEDIA.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('inputs are 16px on touch screens so iOS does not zoom', () => {
  assert.match(css, /@media \(pointer: coarse\) \{ input, select, textarea \{ font-size: 16px !important; \} \}/);
});

test('every hover that moves something is gated to a real mouse', () => {
  const ungated = css.split('\n').filter((l) => /:hover[^{]*\{[^}]*transform/.test(l) && !l.startsWith('@media (hover: hover) and (pointer: fine)'));
  assert.deepEqual(ungated, []);
});

test('no UI transition runs longer than 300ms', () => {
  const slow = [...css.matchAll(/transition:[^;}]*/g)].map((m) => m[0])
    // 600000s is the autofill-background hack, not motion.
    .filter((t) => !t.includes('background-color 600000s'))
    .filter((t) => [...t.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].some(([, n, u]) => (u === 's' ? n * 1000 : +n) > 300));
  assert.deepEqual(slow, []);
});
