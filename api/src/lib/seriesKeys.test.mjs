// Regression test: series auto-tag from class names (grounded in prod).
// Run: node --test src/lib/seriesKeys.test.mjs  (no DB, no network)
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestSeriesKey, seriesLike, autoTagRecords } from './seriesKeys.js';

test('confident names map (prod precedents)', () => {
  assert.equal(suggestSeriesKey('6 Treadlite Young Rider Series 1.25m - 1.35 Art 238 2.2'), 'young-rider-series');
  assert.equal(suggestSeriesKey('29 Mainland Coachwork Junior Rider Series 1.15m-1.25m'), 'junior-rider-series');
  assert.equal(suggestSeriesKey('28 Dunstan Horse Feeds Amateur Rider Series 1.10-1.20m'), 'amateur-rider-series');
  assert.equal(suggestSeriesKey('5 Seahorse Supplements Pro Am Rider 1.20m - 1.30m'), 'pro-am-series');
  assert.equal(suggestSeriesKey('25 Property Brokers Horse Grand Prix 1.40m - 1.50m Art 261.5.1.2'), 'grand-prix-series');
  assert.equal(suggestSeriesKey('21 The Rider Shop Pony Grand Prix Series Art 261.5.1.2'), 'pony-grand-prix-series');
  assert.equal(suggestSeriesKey('20 NZPH 7 Year Old Young Horse Series'), 'seven-yo-series');
  assert.equal(suggestSeriesKey('East Coast Performance Horses 5 Year Old Young Horse Series 1.10m max'), 'five-yo-series');
  assert.equal(suggestSeriesKey('NZ Warmblood Association 6 Year Old Young Horse Series 1.20m max'), 'six-yo-series');
});

test('pony GP wins over plain GP', () => {
  assert.equal(suggestSeriesKey('AMS Saddlery Pony Grand Prix Series'), 'pony-grand-prix-series');
});

test('hunter national series never maps (different sport)', () => {
  assert.equal(suggestSeriesKey('*Summit Grains and Saddlery Amateur National Series 1m'), null);
  assert.equal(suggestSeriesKey('*Leaderbrand Junior National Series 1m'), null);
  assert.equal(suggestSeriesKey('53 Vero Insurance - Cat A National Series HOYQ 70cm Cat A'), null);
  assert.equal(suggestSeriesKey('54 BOP and Waikato SH 12 & under Equitation Series 70cm'), null);
});

test('ambiguous names stay null but flag verify', () => {
  for (const n of [
    '22 BMW Sport Horses Open Horse 1.10m (part of Main-Events 1.10m Series)',
    '58 ESNZ Cat B National Series HOYQ 80cm',
    '7 TiES Jumping Futurity Series 80-90cm',
    'Open Horse 1.10m Round 1: Richmond Saddlery Top of the South Series',
    '2 Groom & Gallop Open Horse 1.10m Art 238 2.1',
  ]) assert.equal(suggestSeriesKey(n), null, n);
  assert.equal(seriesLike('22 BMW Main-Events 1.10m Series'), true);
  assert.equal(seriesLike('2 Groom & Gallop Open Horse 1.10m Art 238 2.1'), false);
});

test('autoTagRecords tags confident, lists verify, keeps explicit', () => {
  const recs = [
    { class_name: '6 Treadlite Young Rider Series', rider_name: 'A', horse_name: 'B' },
    { class_name: '58 ESNZ Cat B National Series HOYQ 80cm', rider_name: 'A', horse_name: 'B' },
    { class_name: '2 Groom & Gallop Open Horse 1.10m', rider_name: 'A', horse_name: 'B' },
    { class_name: '9 SEAHORSE SUPPLEMENTS Pro Am', rider_name: 'A', horse_name: 'B', series_key: 'custom-series' },
  ];
  const { tagged, verify } = autoTagRecords(recs);
  assert.equal(tagged, 1);
  assert.equal(recs[0].series_key, 'young-rider-series');
  assert.equal(recs[0].series_suggested, true);
  assert.equal(recs[3].series_key, 'custom-series');
  assert.equal(verify.length, 1);
  assert.match(verify[0].name, /HOYQ/);
});

// Real 2026-27 class names found by comparing with the ESNZ annual series board.
test('Pro Amateur is Pro-Am; junior/amateur and amateur tour are not Amateur Rider', () => {
  const cases = {
    '7 Seahorse Supplements Pro Amateur Rider Series 1.20-1.30m Art238.2.2': 'pro-am-series',
    '1007 SEAHORSE SUPPLEMENTS Pro-Amateur Rider Series 1.20-1.30m Article 238.2.2': 'pro-am-series',
    '5 Seahorse Supplements Pro Am Rider 1.20m - 1.30m Art 238 2.2': 'pro-am-series',
    '6 Dunstan Horsefeeds Amateur Series in conj with CSJ Horsetrucks 1.10-1.20 Art 238.2.2': 'amateur-rider-series',
    '28 Dunstan Horse Feeds Amateur Rider Series.1.10-1.20m Art 238 2.2': 'amateur-rider-series',
    '26 EQUI-LISE Junior/Amateur 1.10-1.20m ART: 238.2.2': null,
    '10 South Island Junior Amateur Series 1.10m - 1.20m Article 238.2.2': null,
    '7 Still Waters Sport Horses South Island Junior - Amateur Series 1.10m - 1.20m *EquiLise South Island Series*': null,
    '47 Global Amateur Tour Open Horse 1.15m Article 238.2.2 IJO': null,
  };
  for (const [name, key] of Object.entries(cases)) assert.equal(suggestSeriesKey(name), key, name);
  assert.equal(seriesLike('26 EQUI-LISE Junior/Amateur 1.10-1.20m'), true); // still asks for a verdict
});

test('breeders series map by age', () => {
  assert.equal(suggestSeriesKey('44 NZPH 7 Year Old Breeders Series in conj with DJ Hewitt Builders 1.30m art 238.2.2'), 'seven-yo-series');
  assert.equal(suggestSeriesKey('East Coast Performance Horses 5 Year Old Breeders Series'), 'five-yo-series');
  assert.equal(suggestSeriesKey('New Zealand Warmblood Association 6 Year Old Breeders Series'), 'six-yo-series');
});
