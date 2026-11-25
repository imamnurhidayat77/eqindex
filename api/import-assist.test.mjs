// Unit: Import Assistant prompt fitting and the csv-rule mapper (no DB, no AI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fitPrompt } = require('./src/lib/ai.js');
const {
  csvRuleRecords, parseCsv, groundRecords, placingWarnings, isUsableSeriesPattern,
} = require('./src/lib/assist.js');

test('fitPrompt keeps the system head whole and the END of a long tail', () => {
  const head = 'SYSTEM RULES';
  const tail = `OLDEST ${'x'.repeat(20000)} NEWEST`;
  const out = fitPrompt(head, tail, 1000);
  assert.ok(out.startsWith(head));
  assert.ok(out.endsWith('NEWEST'));
  assert.ok(!out.includes('OLDEST'));
  assert.ok(out.length <= 1000);
});

test('fitPrompt leaves a short prompt untouched', () => {
  assert.equal(fitPrompt('sys', 'User: hi', 1000), 'sys\n\nUser: hi');
});

test('csvRuleRecords keeps quoted commas in one cell and maps header aliases', () => {
  const csv = 'Class,Rider,Horse,Finish Place\n"1.20m Open, Day 1","Smith, John",Bella,2\n';
  assert.deepEqual(csvRuleRecords(csv), [
    { class_name: '1.20m Open, Day 1', rider_name: 'Smith, John', horse_name: 'Bella', placing: '2' },
  ]);
});

test('csvRuleRecords returns null for text that is not a results CSV', () => {
  assert.equal(csvRuleRecords('Results for the Spring Show\nRider A on Horse B, 1st'), null);
  assert.equal(csvRuleRecords('class,rider,horse'), null); // header only
  assert.equal(csvRuleRecords(''), null);
});

test('parseCsv handles escaped quotes and CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n"say ""hi""",2\r\n'), [['a', 'b'], ['say "hi"', '2']]);
});

test('groundRecords flags names missing from the source, tolerating splits and reordering', () => {
  const source = 'Class 4  1.10m\n1  Bella Ro-\nse   SMITH John\n2  Zéphyr  Ann Lee';
  const recs = [
    { horse_name: 'Bella Rose', rider_name: 'John Smith' }, // split horse, reordered rider
    { horse_name: 'Zephyr', rider_name: 'Ann Lee' }, // accent stripped
    { horse_name: 'Invented Horse', rider_name: 'Ann Lee' },
    { horse_name: 'Bella Rose', rider_name: 'Nobody Here' },
  ];
  assert.equal(groundRecords(recs, source), 2);
  assert.equal(recs[0].ungrounded, undefined);
  assert.equal(recs[1].ungrounded, undefined);
  assert.deepEqual(recs[2].ungrounded, ['horse']);
  assert.deepEqual(recs[3].ungrounded, ['rider']);
});

test('placingWarnings accepts ties, flags gaps and impossible ties', () => {
  const cls = (name, places) => places.map((p) => ({ class_name: name, placing: String(p) }));
  assert.deepEqual(placingWarnings([...cls('Tied', [1, 1, 3]), ...cls('Clean', [2, 1, 3])]), []);
  const w = placingWarnings([...cls('Gap', [1, 2, 4]), ...cls('Bad tie', [1, 1, 2])]);
  assert.equal(w.length, 2);
  assert.match(w[0], /Check placings in "Gap": 1, 2, 4/);
  assert.match(w[1], /"Bad tie": 1, 1, 2/);
  // eliminated rows and blank placings are ignored
  assert.deepEqual(placingWarnings([...cls('E', [1, 2]), { class_name: 'E', placing: '5', status: 'eliminated' }, { class_name: 'E' }]), []);
});

test('series memory patterns need at least 4 characters', () => {
  assert.equal(isUsableSeriesPattern('am'), false);
  assert.equal(isUsableSeriesPattern('  pro '), false);
  assert.equal(isUsableSeriesPattern('pro-am'), true);
});

test('EvoEvents sign-in wall (403) becomes plain PDF advice, flagged for callers', async () => {
  const { evoeventsRecords, SIGN_IN_MESSAGE } = require('./src/lib/evoeventsFetch.js');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Sign in to see results', { status: 403 });
  try {
    await assert.rejects(() => evoeventsRecords('2135887670'), (e) => e.signIn === true && e.message === SIGN_IN_MESSAGE);
    assert.match(SIGN_IN_MESSAGE, /Save as PDF/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
