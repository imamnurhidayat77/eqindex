// Unit: official series board input (browser copy / saved page) and
// matching its show columns to EQIndex events (no DB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseOfficialText, cellPoints, parseEventLabel, matchEvent } = require('./src/lib/seriesVerify.js');

// Shape of an EvoEvents series board copied with Cmd+A / Cmd+C (tabs between
// cells; columns scrolled out of view are still included).
const COPIED = [
  'RESULTS (INCLUDED PTS IN RED)',
  'Rider\tHorse\tPlace\tTotal\tWoodhill 23/08\tFeilding 19/09\tOtago 1710\tWairarapa A&P 1/11\tSCNO 29/11',
  'Sofia Williams\t\t1\t151\t\t10\t\t\t4',
  'Cole Sherborne\t\t10\t52\t8\t\t\t4/2\t',
  'Emily Oliver\t\t2\t121\t\t\t1\t6\t10',
].join('\n');

test('a browser-copied board keeps every show column and per-show points', () => {
  const b = parseOfficialText(COPIED);
  assert.deepEqual(b.events, ['Woodhill 23/08', 'Feilding 19/09', 'Otago 1710', 'Wairarapa A&P 1/11', 'SCNO 29/11']);
  assert.equal(b.rows.length, 3);
  assert.deepEqual(b.rows[0], { rider: 'Sofia Williams', horse: '', total: 151, cells: { 'Feilding 19/09': [10], 'SCNO 29/11': [4] } });
  assert.deepEqual(b.rows[1].cells['Wairarapa A&P 1/11'], [4, 2]); // two horses
});

test('a saved page (HTML) parses the same board', () => {
  const html = `<html><body><table><tr><th>Rider</th><th>Horse</th><th>Place</th><th>Total</th><th>Woodhill 23/08</th><th>Otago 1710</th></tr>
    <tr><td>Sofia&nbsp;Williams</td><td></td><td>1</td><td>151</td><td><span class="red">8</span></td><td></td></tr></table></body></html>`;
  const b = parseOfficialText(html);
  assert.deepEqual(b.events, ['Woodhill 23/08', 'Otago 1710']);
  assert.deepEqual(b.rows[0], { rider: 'Sofia Williams', horse: '', total: 151, cells: { 'Woodhill 23/08': [8] } });
});

test('plain "Name points" lines still work (totals only)', () => {
  const b = parseOfficialText('Lucy Fell 122\n2. Michelle Wakeling 113');
  assert.deepEqual(b.rows.map((r) => [r.rider, r.total]), [['Lucy Fell', 122], ['Michelle Wakeling', 113]]);
  assert.throws(() => parseOfficialText('nothing useful here'), /could not read the board/);
});

test('cellPoints and parseEventLabel read board quirks', () => {
  assert.deepEqual(cellPoints('4/2'), [4, 2]);
  assert.deepEqual(cellPoints(''), []);
  assert.deepEqual(cellPoints('0'), []);
  assert.deepEqual(parseEventLabel('Otago 1710'), { name: 'Otago', day: 17, month: 10, words: ['otago'] });
  assert.deepEqual(parseEventLabel('WHS & SJW 8/11'), { name: 'WHS & SJW', day: 8, month: 11, words: ['whs', 'sjw'] });
  assert.equal(parseEventLabel('Results').day, null);
});

test('matchEvent picks the event covering that day, preferring shared name words', () => {
  const ours = [
    { id: 'w1', name: 'Wairarapa A & P Show', date_start: '2026-10-31', date_end: '2026-11-01' },
    { id: 'w0', name: 'Wairarapa A & P Show', date_start: '2025-10-31', date_end: '2025-11-01' },
    { id: 'x', name: 'Some Other Show', date_start: '2026-11-01', date_end: '2026-11-01' },
    { id: 'o', name: 'Otago Show Jumping Spring Show', date_start: '2026-10-17', date_end: '2026-10-18' },
  ];
  assert.deepEqual(matchEvent('Wairarapa A&P 1/11', ours), { event: ours[0], confidence: 'name' }); // latest year, name wins
  assert.equal(matchEvent('Otago 1710', ours).event.id, 'o');
  assert.deepEqual(matchEvent('Taupo 27/11', ours), null); // not imported here
  const dateOnly = matchEvent('Feilding 1/11', ours);
  assert.equal(dateOnly.confidence, 'date'); // same day, no shared word: flagged as uncertain
  assert.equal(matchEvent('No date here', ours), null);
});
