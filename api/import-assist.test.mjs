// Unit: Import Assistant prompt fitting and the csv-rule mapper (no DB, no AI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fitPrompt } = require('./src/lib/ai.js');
const { csvRuleRecords, parseCsv } = require('./src/lib/assist.js');

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
