// Unit: microinteraction guards (hold to confirm, step line, FAQ open).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('danger confirms need a hold, not a tap', () => {
  const modal = src('components/ConfirmModal.jsx');
  assert.match(modal, /danger && !prompt \? \(\s*\/\/[^\n]*\n\s*<HoldConfirmButton/);
});

test('hold timer and fill share one constant, fill is linear', () => {
  const js = src('components/HoldConfirmButton.jsx');
  const css = src('components/HoldConfirmButton.module.css');
  assert.match(js, /\}, HOLD_MS\);/);
  assert.match(js, /'--hold-duration': `\$\{HOLD_MS\}ms`/);
  assert.match(css, /transition: clip-path var\(--hold-duration\) linear/);
});

test('motion respects reduced-motion', () => {
  for (const f of ['components/HoldConfirmButton.module.css', 'components/StepProgress.module.css', 'app/faq/faq.module.css']) {
    assert.match(src(f), /prefers-reduced-motion: reduce/, f);
  }
});
