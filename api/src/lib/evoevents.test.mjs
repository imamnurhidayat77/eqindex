// Regression test: a classified-but-not-finished round (e.g. retired in the
// jump-off but officially 2nd) must keep its placing alongside the status.
// Run: node --test src/lib/evoevents.test.mjs  (no DB, no network)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvoEvents } from './evoevents.js';

const text = [
  '6 Treadlite Young Rider Series 1.25m Art 238 2.2 Hide  View full',
  'RESULTS',
  'Back No  Horse  Rider  Place  Time',
  '12  Oaks Centurian  Sophia Maud  2  70.00  0  0  R',
  '13  Global PH Cupid  Ella McKay  1  68.00  0  0  0',
  '14  Amorcito  Bailey Benshaw  E  0  0',
  '15  Lonely Star  Jane Doe  R  0  0',
].join('\n');

test('retired-but-2nd keeps placing + status', () => {
  const { records } = parseEvoEvents(text);
  const sophia = records.find((r) => r.rider_name === 'Sophia Maud');
  assert.ok(sophia, 'sophia row parsed');
  assert.equal(sophia.placing, 2);
  assert.equal(sophia.status, 'retired');
  assert.equal(sophia.horse_name, 'Oaks Centurian');
});

test('finished winner untouched', () => {
  const { records } = parseEvoEvents(text);
  const ella = records.find((r) => r.rider_name === 'Ella McKay');
  assert.ok(ella, 'ella row parsed');
  assert.equal(ella.placing, 1);
  assert.ok(!ella.status, 'no status for finished round');
});

test('eliminated keeps placing when present, status set', () => {
  const { records } = parseEvoEvents(text);
  const elim = records.find((r) => r.rider_name === 'Bailey Benshaw');
  assert.ok(elim, 'eliminated row parsed');
  assert.equal(elim.status, 'eliminated');
});

test('bare retired with no placing stays unplaced', () => {
  const { records } = parseEvoEvents(text);
  const lone = records.find((r) => r.rider_name === 'Jane Doe');
  assert.ok(lone, 'lone retired row parsed');
  assert.equal(lone.status, 'retired');
  assert.ok(lone.placing === null || lone.placing === undefined);
});

// Excerpt of a real EvoEvents RESULTS WEB PAGE printed to PDF (public
// results, Wanganui A&P 2026), extracted line-aware like the browser does.
const WEB_EXPORT = [
  "Results  /  Wanganui A&P Show JUMPING ONLY Show 2026",
  "Wanganui A&P Show JUMPING ONLY Show 2026 — Results",
  "\t‹ Event details",
  "14 Nov 2026 – 15 Nov 2026 · 356 classes",
  "↻  Refresh",
  "CLASSES",
  "10",
  "YARDING WAITLIST  Hide",
  "No entries or results to show for this class yet.",
  "276",
  "JAN DAVIS Masters class Open Horse 1.05m - 1.10M Art 238.2.2  ✓  Approved  Hide",
  "✓  Results approved, 30 Nov, 11:39am",
  "FIRST ROUND RESULTS  FINAL ROUND RESULTS (PRELIMINARY IF LIVE)",
  "Back No  Horse  Rider  Est Time  Place  SJ Time  SJ Time Pen  SJ Jump Pen  SJ Total  Rnd 1 Place  Rnd 2 Time  Rnd 2 TP  Rnd 2 JP  Rnd 2 Total",
  "3  Joeseffy  Jillian Watson  1  81.5  0  0  0  1",
  "2  Dancing Queen MW  Carolyn Hinton  2  68.19  0  8  8  2",
  "5  Gael Force  Todd Gloyn  3  73.02  0  8  8  3",
  "4  A & P Firenze  Bev Mulder  4  100.5  18  4  22  4",
  "",
  "FIRST ROUND RESULTS  FINAL ROUND RESULTS (PRELIMINARY IF LIVE)",
  "Back No  Horse  Rider  Est Time  Place  SJ Time  SJ Time Pen  SJ Jump Pen  SJ Total  Rnd 1 Place  Rnd 2 Time  Rnd 2 TP  Rnd 2 JP  Rnd 2 Total",
  "1  Cahlua Xtreme  Todd Gloyn  0  0  E  E",
  "HELEN THE PHYSIO Open Horse 1.10m Art 238.2.2 Art 245.3 IJO. INCLUDES MAIN-EVENTS 1.10m SERIES  ✓  Approved",
  "277  Hide",
  "Sponsored by Helen the physio",
  "✓  Results approved, 30 Nov, 11:39am",
  "FIRST ROUND RESULTS  FINAL ROUND RESULTS (PRELIMINARY IF LIVE)",
  "Back No  Horse  Rider  Est Time  Place  SJ Time  SJ Time Pen  SJ Jump Pen  SJ Total  Rnd 1 Place  Rnd 2 Time  Rnd 2 TP  Rnd 2 JP  Rnd 2 Total",
  "105  Wicked Mr Fox  Paris Karl-Fields  1  73.08  0  0  0  1  35.86  0  0  0",
  "195  Cahlua Xtreme  Todd Gloyn  2  75.26  0  0  0  3  36.16  0  0  0",
  "148  Haupouri Jedi  Madeline Honeyfield  3  73.23  0  0  0  2  37.45  0  0  0",
  "201  A & P Cenricho  Zara Sutton  4  76.41  0  0  0  4  38.96  0  0  0",
  "87  Pure Silhouette  Vania Mason  5  67.24  0  4  4  5",
  "56  Waimamaku Nikau  Heather O''Neill  6  70.58  0  4  4  6",
  "89  Centaire Max  $  Vania Mason  7  71.99  0  4  4  7",
  "133  Audi Xtreme  Laine Cameron  8  74.31  0  4  4  8",
  "149  Kabo Silver Lining  Pippa Honeyfield  9  75.69  0  8  8  9",
  "134  Brooklyn 99  Laine Cameron  10  77.39  0  8  8  10",
  "29  Ragnar of Valhalla  Jess Mangan  11  79.65  0  8  8  11",
  "115  Tallyho Lancaster  Daniella Jelliman  12  80.8  0  12  12  12",
  "46  Grand Central  Lauryn Hamblyn  13  85.57  3  16  19  13",
  "66  Papanui Just a Diamond  Maria Miller  14  99.79  17  4  21  14",
  "77  Roany  Kirsty Fabish  15  96.89  14  8  22  15",
  "",
  "FIRST ROUND RESULTS  FINAL ROUND RESULTS (PRELIMINARY IF LIVE)",
  "Back No  Horse  Rider  Est Time  Place  SJ Time  SJ Time Pen  SJ Jump Pen  SJ Total  Rnd 1 Place  Rnd 2 Time  Rnd 2 TP  Rnd 2 JP  Rnd 2 Total",
  "138  WSJ Dakota  Daniel Webb  16  110.68  28  16  44  16",
  "142  Bess Believe It  Olivia Wilson  0  0  R  R",
  "290  THE RIDER SHOP Pony Grand Prix series 1.20-1.30m Art 261.5.1.2 Winners rug sponsored by CJ NEWLAND LOGGING  ✓  Approved  Hide",
  "✓  Results approved, 30 Nov, 11:39am",
  "FIRST ROUND RESULTS  FINAL ROUND RESULTS (PRELIMINARY IF LIVE)",
  "Back No  Horse  Rider  Est Time  Place  SJ Time  SJ Time Pen  SJ Jump Pen  SJ Total  Rnd 1 Place  Rnd 2 Time  Rnd 2 TP  Rnd 2 JP  Rnd 2 Total",
  "2  Tallyho Scoundrel  Daniella Jelliman  1  80.65  0  4  4  1",
  "1  MN Crusader  Tayla Jamieson  0  0  E  E",
  "291  Property Brokers Horse Grand Prix Series1.40-1.50m Art 261.5.1.2 Winners rug sponsored by INTEGRITY MOTORS  Hide",
  "",
  "No entries or results to show for this class yet.",
  "295  Intro Pony 70cm 274.2.5.1 special 2 phase  ✓  Approved  Hide",
  "✓  Results approved, 30 Nov, 11:39am",
  "FIRST ROUND RESULTS  FINAL ROUND RESULTS (PRELIMINARY IF LIVE)",
  "Back No  Horse  Rider  Est Time  Place  SJ Time  SJ Time Pen  SJ Jump Pen  SJ Total  Rnd 1 Place  Rnd 2 Time  Rnd 2 TP  Rnd 2 JP  Rnd 2 Total",
  "3  Scott Free  Vinnie Drought  1  28.59  0  0  0  1  37.81  0  0  0",
  "13  Hawkdun Red Dazzler  Zoe Williams  2  29.96  0  0  0  1  40.35  0  0  0",
  "1  Onika off Guard  Abbey Clapison  3  39.1  0  0  0  1  42.87  0  0  0",
  "8  Windsor Gangster  Harriet McAree  4  35.62  0  0  0  1  44.56  0  0  0",
  "7  Little Explorer  Georgia McAree  5  47.78  0  0  0  1  48.31  3  0  3",
  "4  Windermere Silvery Moon  Issy Fenton  6  38.13  0  0  0  1  41.09  0  4  4",
  "5  Mahoe Moon Jay  Jayla Fleming  7  38.65  0  4  4  9  44.31  0  0  4",
  "6  Oh My Choux Fly  Quinn Hamilton  8  34.97  0  0  0  1  44.34  0  4  4",
  "2  Patches n Cream  Vinnie Drought  9  29.37  0  0  0  1  46.44  1  4  5",
  "12  The Last Gladiator  Lilly Raithby  10  42.15  0  8  8  10  42.34  0  0  8",
  "11  Invictus KH  Grace O''Leary  11  67.88  20  0  20  11  0  0  E  E",
  "9  Grassendale Fever  Abbie Meyer  0  0  E  E",
  "10  Fun House  Mya Nickalls  0  0  E  E",
].join('\n');

const byClass = (records) => records.reduce((m, r) => ((m[r.class_name] ||= []).push(r), m), {});

test('web-page export: every title layout is recognised (number before, after, same line)', () => {
  const { records, classesFound, resultsSections, blocking } = parseEvoEvents(WEB_EXPORT);
  const counts = Object.fromEntries(Object.entries(byClass(records)).map(([k, v]) => [k.split(' ')[0], v.length]));
  assert.deepEqual(counts, { 276: 5, 277: 17, 290: 2, 295: 13 }); // waitlist + 291 have no results
  assert.equal(classesFound, 4);
  assert.equal(resultsSections, 4);
  assert.equal(blocking, null);
  assert.equal(Object.keys(byClass(records))[0], '276 JAN DAVIS Masters class Open Horse 1.05m - 1.10M Art 238.2.2');
});

test('web-page export: a class continued after a page break stays one class, no duplicates', () => {
  const { records } = parseEvoEvents(WEB_EXPORT);
  for (const [cls, rows] of Object.entries(byClass(records))) {
    const keys = rows.map((r) => `${r.horse_name}|${r.rider_name}`);
    assert.equal(new Set(keys).size, keys.length, `duplicate horse+rider in ${cls}`);
  }
  assert.ok(byClass(records)['277 HELEN THE PHYSIO Open Horse 1.10m Art 238.2.2 Art 245.3 IJO. INCLUDES MAIN-EVENTS 1.10m SERIES']
    .some((r) => r.horse_name === 'WSJ Dakota' && r.placing === 16)); // row after the repeated header
});

test('web-page export: round 2 columns map to round2_*, round-2 eliminations keep the placing', () => {
  const { records } = parseEvoEvents(WEB_EXPORT);
  const fox = records.find((r) => r.horse_name === 'Wicked Mr Fox');
  assert.equal(fox.placing, 1); assert.equal(fox.time, 73.08);
  assert.equal(fox.round2_time, 35.86); assert.equal(fox.round2_faults, 0);
  const invictus = records.find((r) => r.horse_name === 'Invictus KH');
  assert.equal(invictus.placing, 11);
  assert.equal(invictus.status, undefined);
  assert.equal(invictus.notes, 'Round 2: eliminated');
  assert.equal(invictus.rider_name, "Grace O'Leary"); // export's O''Leary unescaped
  const cahlua = records.find((r) => r.horse_name === 'Cahlua Xtreme' && r.class_name.startsWith('276'));
  assert.equal(cahlua.status, 'eliminated'); // round-1 elimination stays a status
});

test('safety gate: fewer parsed classes than "Results approved" sections blocks the file', () => {
  const broken = WEB_EXPORT.replace('295  Intro Pony 70cm 274.2.5.1 special 2 phase  ✓  Approved  Hide', '295  Intro Pony 70cm 274.2.5.1 special 2 phase');
  // The unrecognised 295 title lets its rows fall under the empty class 291:
  // class counts still match (4 = 4), but those rows have no approval marker.
  const { classesFound, resultsSections, blocking } = parseEvoEvents(broken);
  assert.equal(classesFound, 4);
  assert.equal(resultsSections, 4);
  assert.match(blocking, /13 row\(s\) sit under a class with no results of its own/);
  assert.match(blocking, /evoevents\.co\.nz\/results/);
  // and a file whose titles are all missing is refused outright
  const none = WEB_EXPORT.replace(/  ✓  Approved  Hide|  Hide$/gm, '').replace(/✓  Approved/g, '');
  assert.ok(parseEvoEvents(none).blocking);
});
