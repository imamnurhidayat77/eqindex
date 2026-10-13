// Deterministic parser for EvoEvents results PDFs (Show Jumping Waitemata,
// Float Factory, … — same platform layout). The browser extracts the PDF
// line-aware (see web/app/admin/assistant/page.jsx pickFile): table rows
// survive as lines, class sections carry Hide/View-full + Sponsored-by
// markers, and lone rider-column fragments keep a tab prefix when the
// header geometry allows it. Anything unparsed falls through to the AI
// mapper (lib/ai.js).

const STATUS_WORD = {
  E: 'eliminated', EL: 'eliminated', ELIM: 'eliminated',
  R: 'retired', RET: 'retired',
  W: 'withdrawn', WD: 'withdrawn', NS: 'withdrawn',
  DQ: 'disqualified',
};

// Timetable rows (ignored, only counted): carry day/time/entries markers
// a results title never has.
const TIMETABLE_MARK = /\b(Sat|Sun)\b|out of|Finished|\(Planned\)|Scheduled|\bRING\b|Locn|Discipline/i;
// Rules-number, with or without the Art prefix (Article/Art:/Art238 and
// the spaced "Art 238 2.1" all seen). Bare 3-digit numbers also match —
// the Hide/Sponsored evidence + non-row guards below keep it precise.
const RULES_NUM = /(?:Art\w*\s*:?\s*)?\d{3}(?:\.\d)?(?:\.\d)?/i;
// A bare "12  Hide  View full" line after a title carries the class number.
const HIDE_LINE = /^\d*\s*Hide\s+View full/i;
// Two Titlecase words, neither shouty — very likely a person's name.
const PERSON_LIKE = /^[A-Z][a-z'-]+ [A-Z][a-z'-]+$/;

function looksEvoEvents(text) {
  const t = String(text || '');
  return /Back No/i.test(t) && (RULES_NUM.test(t) || /Hide\s+View full/i.test(t));
}

function num(v) {
  if (v === undefined || v === null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function splitFields(line) {
  return String(line).split(/\s{2,}|\t/).map((s) => s.trim()).filter((s) => s !== '');
}

function isNumericTok(t) {
  return /^[\d.]+$/.test(t) || STATUS_WORD[String(t).toUpperCase()] !== undefined;
}

// A number row starts with a back/draw number and carries at least two
// more result tokens (placing/time/penalties/status). A "13  Redcliffs
// G Six" style backNo+horse fragment has none, so it stays a fragment.
function isNumberRow(fields) {
  if (!fields.length || !/^\d+$/.test(fields[0])) return false;
  return fields.slice(1).filter(isNumericTok).length >= 2;
}

function parsePenalties(nums) {
  // [time_penalties, jump_penalties, total?] → faults = jump, tf = time.
  if (nums.length >= 2) return { faults: nums[1], time_faults: nums[0] };
  if (nums.length === 1) return { faults: nums[0], time_faults: 0 };
  return { faults: 0, time_faults: 0 };
}

function cleanTitle(raw) {
  let name = String(raw).trim().replace(/\s+/g, ' ');
  // Mid-line sponsor clause keeping the rules number:
  // "… 1.35 Sponsored by Auckland Show Jumping Art 238 2.2" → "… 1.35 Art 238 2.2".
  name = name.replace(/\s+(Kindly\s+)?Sponsor\w*(\s+by)?\s+(.+?)\s+((?:Art\w*\s*:?\s*)\d[\d.\s]*)$/i, ' $4');
  // Trailing sponsor clause: "… A5 Kindly Sponsored by Float Factory" → "… A5".
  name = name.replace(/\s+(Kindly\s+)?Sponsor\w*(\s+by)?\s.*$/i, '');
  name = name.replace(/\s+Hide\s+View full\s*$/i, '').trim();
  name = name.replace(/\s+Per Series Conditions\.?\s*$/i, '')
    .replace(/\s+As per series conditions\.?\s*$/i, '').trim();
  const lead = name.match(/^(\d+)\s+(.+)$/);
  if (lead) name = `${lead[1]} ${lead[2].trim()}`;
  return name;
}

// A class title: not timetable, not a row, with rules/Art evidence or a
// sponsor mention, plus a Hide/View-full neighbour (whose leading number
// is the class number). The neighbour may sit on the same line.
function isTitleBlock(lines, li) {
  const trimmed = lines[li].trim();
  if (!trimmed || trimmed.length < 12) return false;
  if (/^Sponsored by /i.test(trimmed) || /^CLASSES$/i.test(trimmed)) return false;
  if (TIMETABLE_MARK.test(trimmed)) return false;
  if (/Back No|RESULTS|FIRST ROUND/i.test(trimmed)) return false;
  if (/^No entries or results/i.test(trimmed)) return false;
  const f = splitFields(trimmed);
  if (isNumberRow(f)) return false;
  if (!RULES_NUM.test(trimmed) && !/Sponsor/i.test(trimmed)
    && !/Series|Stakes|Championship|Futurity|Grand Prix|Mini-Prix/i.test(trimmed)) return false;
  // A bare "18  Sponsored by GJ Gardner" overflow line is not a title:
  // without rules evidence the core must carry real words.
  if (!RULES_NUM.test(trimmed)) {
    const core = trimmed.replace(/^\d+\s+/, '').replace(/^Sponsor\w*(\s+by)?\s+/i, '')
      .replace(/\s+Sponsor\w*(\s+by)?.*$/i, '')
      .replace(/\s+Hide\s+View full\s*$/i, '').trim();
    if (core.split(/\s+/).filter(Boolean).length < 3) return false;
  }
  // Same-line sponsor mention is sufficient evidence (timetable sponsor
  // lines always carry day/entries markers and are excluded above).
  if (/Sponsor/i.test(trimmed) && !/^Sponsored by /i.test(trimmed)) return true;
  if (/Hide\s+View full/i.test(trimmed)) return true;
  for (let k = 1; k <= 4; k++) {
    if (HIDE_LINE.test((lines[li + k] || '').trim())) return true;
  }
  return false;
}

function parseEvoEvents(text) {
  const src = String(text || '');
  const rawLines = src.split(/\r?\n/);
  const hasTabs = /^\t/m.test(src);
  const records = [];
  let dropped = 0;
  let ambiguous = 0;
  const warnings = [];
  const classSizes = new Map();

  let classesExpected = 0;
  const headMatch = src.match(/(\d+)\s*classes/);
  if (headMatch) classesExpected = parseInt(headMatch[1], 10);

  let inResults = false;
  let mode = null; // 'single' | 'double'
  let titleTail = false; // just after a title: skip until the table header
  let currentTitle = null;
  let titlesDetected = 0;
  let hideMarkers = 0;
  let orphans = []; // rows parsed before any title (assigned to next title)
  let pendH = [], pendR = [], pendSingles = [];
  // Pending row awaiting trailing name fragments (single-frag lines right
  // after its number row extend it; anything else closes it).
  let pendingRow = null;
  let trailSide = null; // 'horse' | 'rider' | 'alt'
  let linesSinceFlush = 99;

  const finalizePending = () => {
    if (pendingRow && (!pendingRow.horse_name || !pendingRow.rider_name)) {
      const ix = records.indexOf(pendingRow);
      if (ix >= 0) records.splice(ix, 1);
      const ox = orphans.indexOf(pendingRow);
      if (ox >= 0) orphans.splice(ox, 1);
      dropped++;
    }
    pendingRow = null;
    trailSide = null;
    linesSinceFlush = 99;
  };

  const flushOrphans = (title) => {
    for (const r of orphans) {
      r.class_name = title;
      records.push(r);
      classSizes.set(title, (classSizes.get(title) || 0) + 1);
    }
    orphans = [];
  };

  const emit = (rec) => {
    if (currentTitle) {
      rec.class_name = currentTitle;
      records.push(rec);
      classSizes.set(currentTitle, (classSizes.get(currentTitle) || 0) + 1);
    } else {
      orphans.push(rec);
    }
  };

  // Merge pair-derived fragments + a number row's own name fields.
  // texts: non-numeric fields after backNo (0-2: horse and/or rider).
  const mergeNames = (texts) => {
    const pool = pendSingles.splice(0);
    let horse = pendH.join(' ').trim();
    let rider = pendR.join(' ').trim();
    // Single-mode rows are complete lines: stray pair fragments must not
    // corrupt them — count and drop instead.
    if (mode === 'single' && texts.length >= 2 && (horse || rider)) {
      ambiguous += pendH.length + pendR.length;
      horse = ''; rider = '';
    }
    pendH = []; pendR = [];
    if (texts.length >= 2) {
      horse = [horse, texts[0]].join(' ').trim();
      rider = [rider, texts[1]].join(' ').trim();
      if (pool.length) ambiguous += pool.length;
    } else if (texts.length === 1) {
      const t = texts[0];
      if (horse && !rider) rider = [pool.join(' '), t].join(' ').trim();
      else if (rider && !horse) horse = [horse, t, pool.join(' ')].join(' ').trim();
      else if (!horse && !rider) {
        // Lone name field: a person-like "Anya Wade" is the rider, a
        // "Aria GNZ" the horse; the pool fills the other side.
        if (PERSON_LIKE.test(t)) rider = [pool.join(' '), t].join(' ').trim();
        else horse = [t, pool.join(' ')].join(' ').trim();
      } else {
        horse = [horse, t].join(' ').trim();
        if (pool.length) ambiguous += pool.length;
      }
    } else {
      const h = horse ? [horse] : [], r = rider ? [rider] : [];
      pool.forEach((frag, idx) => { (idx % 2 === 0 ? h : r).push(frag); });
      horse = h.join(' ').trim();
      rider = r.join(' ').trim();
    }
    return { horse_name: horse || null, rider_name: rider || null };
  };

  // Single-item digit-led lines ("3  Tennessee  Hannah  1  64.01 …"):
  // positional parse, names split 1/1 or 2/2, else pooled.
  const parseFlatRow = (line) => {
    const toks = line.trim().split(/\s+/);
    if (!/^\d+$/.test(toks[0] || '') || toks.length < 6) return null;
    let end = toks.length;
    const trailStatus = [];
    while (end > 1 && STATUS_WORD[String(toks[end - 1]).toUpperCase()] !== undefined) {
      trailStatus.unshift(toks[end - 1]);
      end--;
    }
    while (end > 1 && /^[\d.]+$/.test(toks[end - 1])) end--;
    const nums = toks.slice(end, end + (toks.length - end - trailStatus.length)).map(Number);
    const middle = toks.slice(1, end);
    if (middle.some((t) => isNumericTok(t))) return null;
    if (!trailStatus.length && nums.length < 2) return null;
    let texts = [];
    if (middle.length === 2) texts = [middle[0], middle[1]];
    else if (middle.length === 4) texts = [`${middle[0]} ${middle[1]}`, `${middle[2]} ${middle[3]}`];
    else if (middle.length === 1) texts = middle;
    else return null;
    return { texts, nums, flatStatus: trailStatus.length ? STATUS_WORD[String(trailStatus[0]).toUpperCase()] : null };
  };

  const takeTitle = (titleText) => {
    finalizePending();
    currentTitle = titleText;
    titlesDetected++;
    flushOrphans(titleText);
    pendH = []; pendR = []; pendSingles = [];
    titleTail = true;
  };

  for (let li = 0; li < rawLines.length; li++) {
    const line = rawLines[li];
    if (!line.trim()) continue;
    const trimmed = line.trim();
    if (/Hide\s+View full/i.test(trimmed)) hideMarkers++;

    // Section boundaries.
    if (/PRELIMINARY TIMETABLE|ARENA TIMETABLES|Timetable for |Live Scoring/i.test(trimmed)) {
      finalizePending();
      inResults = false; mode = null; titleTail = false;
      pendH = []; pendR = []; pendSingles = [];
      continue;
    }
    if (/^(Contact|About|Unsubscribe|Terms of Service|Privacy|Cookie|OUR SPONSORS)/i.test(trimmed)
      || /EvoEvents\. All rights|What should we build/i.test(trimmed)) {
      finalizePending();
      inResults = false; mode = null; titleTail = false;
      continue;
    }
    if (/RESULTS|FIRST ROUND/i.test(trimmed) && !/Back No/i.test(trimmed)) {
      finalizePending();
      inResults = true;
      titleTail = false;
      if (/FIRST ROUND/i.test(trimmed)) mode = 'double';
      continue;
    }
    if (/Back No/i.test(trimmed)) {
      finalizePending();
      inResults = true;
      titleTail = false;
      mode = /Rnd 1|JO Time/i.test(trimmed) ? 'double' : 'single';
      pendH = []; pendR = []; pendSingles = [];
      continue;
    }

    // Class title (works inside and outside results: the first title of
    // the day prints before its RESULTS block, after the timetable).
    if (isTitleBlock(rawLines, li)) {
      let raw = trimmed;
      if (/^[-–]\s/.test(trimmed) && li > 0) {
        const prev = (rawLines[li - 1] || '').trim();
        if (prev && !TIMETABLE_MARK.test(prev) && !/Back No|RESULTS/i.test(prev)) raw = `${prev} ${trimmed}`;
      }
      let name = cleanTitle(raw);
      for (let k = 1; k <= 3; k++) {
        const nxt = (rawLines[li + k] || '').trim();
        const mNum = nxt.match(/^(\d+)\s*(Hide.*)?$/i);
        if (mNum && !/^\d+\s/.test(name)) {
          name = `${mNum[1]} ${name}`;
          li += k;
          if (/^Hide\s+View full$/i.test((rawLines[li + 1] || '').trim())) li++;
          break;
        }
        // "5  Wrightsons Real Estate  Hide  View full": sponsor overflow
        // carrying the class number + Hide marker — take the number but
        // don't consume the line (titleTail skips it next). Same when the
        // Hide marker sits on the following line ("18  Sponsored …").
        const mOverflow = nxt.match(/^(\d+)\b/);
        if (mOverflow && !/^\d+\s/.test(name)
          && (/Hide\s+View full/i.test(nxt) || HIDE_LINE.test((rawLines[li + k + 1] || '').trim()))) {
          name = `${mOverflow[1]} ${name}`;
          break;
        }
        if (!/^(\d+)?\s*$/.test(nxt) && k > 1) break;
      }
      takeTitle(name);
      continue;
    }
    if (!inResults) continue;
    if (titleTail) continue; // sponsor overflow, class number, Hide lines…
    if (/^CLASSES$/i.test(trimmed) || /^Hide\s+View full$/i.test(trimmed)
      || /^Sponsored by /i.test(trimmed) || /^No entries or results/i.test(trimmed)) {
      continue;
    }
    if (/^\d+$/.test(trimmed)) continue; // stray class numbers

    const tabbed = /^\t/.test(line);
    const fields = splitFields(line);

    const handleRow = (texts, nums, flatStatus) => {
      const names = mergeNames(texts);
      let status = flatStatus || null;
      if (!status) {
        for (const f of texts) {
          const w = STATUS_WORD[String(f).toUpperCase()];
          if (w) { status = w; break; }
        }
      }
      const rec = { ...names };
      if (status) {
        rec.status = status;
      } else {
        rec.placing = nums.length ? nums[0] : null;
        if (rec.placing === 0) rec.placing = null;
        rec.time = nums.length > 1 ? nums[1] : null;
        Object.assign(rec, parsePenalties(nums.slice(2, 5)));
        if (mode === 'double' && nums.length > 5) rec.format = 'Jump-off';
      }
      linesSinceFlush = 0;
      if (!rec.horse_name || !rec.rider_name) {
        const hasHorse = !!rec.horse_name, hasRider = !!rec.rider_name;
        trailSide = hasHorse && !hasRider ? 'rider' : (!hasHorse && hasRider ? 'horse' : 'alt');
        emit(rec);
        pendingRow = rec;
      } else {
        trailSide = null;
        emit(rec);
        pendingRow = null;
        linesSinceFlush = 99;
      }
    };

    if (isNumberRow(fields)) {
      const rest = fields.slice(1);
      const texts = rest.filter((f) => !isNumericTok(f));
      const nums = rest.filter((f) => /^[\d.]+$/.test(f)).map(Number);
      handleRow(texts, nums);
      continue;
    }
    const flat = fields.length <= 1 ? parseFlatRow(line) : null;
    if (flat) {
      handleRow(flat.texts, flat.nums, flat.flatStatus);
      continue;
    }
    if (fields.length <= 1 && /^\s*\d+\s+\S/.test(line)
      && line.trim().split(/\s+/).filter(isNumericTok).length >= 4) {
      // Digit-led line with plenty of numbers that no rule could place —
      // count it as lost rather than leaking its words into other rows.
      dropped++;
      continue;
    }

    // Fragment line (wrapped horse/rider names).
    linesSinceFlush++;
    if (pendingRow && trailSide && linesSinceFlush <= 3) {
      if (tabbed) {
        pendingRow.rider_name = `${pendingRow.rider_name || ''} ${trimmed}`.trim();
      } else if (fields.length >= 2) {
        let [left, right] = [fields[0], fields.slice(1).join('  ')];
        const bm = left.match(/^(\d+)\s+(.+)$/);
        if (bm) left = bm[2];
        pendingRow.horse_name = `${pendingRow.horse_name || ''} ${left}`.trim();
        pendingRow.rider_name = `${pendingRow.rider_name || ''} ${right}`.trim();
      } else if (fields.length === 1) {
        const frag = fields[0];
        const bm = frag.match(/^(\d+)\s+(.+)$/);
        const val = bm ? bm[2] : frag;
        if (!hasTabs) {
          if (trailSide === 'horse') pendingRow.horse_name = `${pendingRow.horse_name || ''} ${val}`.trim();
          else if (trailSide === 'rider') pendingRow.rider_name = `${pendingRow.rider_name || ''} ${val}`.trim();
          else if (trailSide === 'alt') {
            pendingRow.rider_name = `${pendingRow.rider_name || ''} ${val}`.trim();
            trailSide = 'alt2';
          } else {
            pendingRow.horse_name = `${pendingRow.horse_name || ''} ${val}`.trim();
            trailSide = 'alt';
          }
        } else if (bm) {
          pendingRow.horse_name = `${pendingRow.horse_name || ''} ${val}`.trim();
        } else {
          ambiguous++;
          pendingRow = null;
          trailSide = null;
        }
      }
      continue;
    }
    if (pendingRow) finalizePending();

    if (tabbed) {
      pendR.push(trimmed);
    } else if (fields.length >= 2) {
      let [left, right] = [fields[0], fields.slice(1).join('  ')];
      const bm = left.match(/^(\d+)\s+(.+)$/);
      if (bm && !isNumberRow(fields)) left = bm[2];
      pendH.push(left);
      if (right) pendR.push(right);
    } else if (fields.length === 1) {
      const frag = fields[0];
      const bm = frag.match(/^(\d+)\s+(.+)$/);
      // Column geometry (tab = rider) beats guessing; without tabs the
      // fragment pools for the next number row to resolve.
      if (bm) pendH.push(bm[2]);
      else if (hasTabs) pendH.push(frag);
      else pendSingles.push(frag);
    }
  }
  finalizePending();

  if (pendH.length || pendR.length || pendSingles.length) {
    ambiguous += pendH.length + pendR.length + pendSingles.length;
  }

  const classesFound = classSizes.size;
  if (dropped) warnings.push(`${dropped} row(s) skipped (missing class/rider/horse)`);
  if (ambiguous) warnings.push(`${ambiguous} name fragment(s) could not be paired confidently — check split names`);
  // The header class total includes empty and not-yet-run classes, so a
  // shortfall alone is not evidence of loss. Every class section carries a
  // Hide/View-full marker — warn only if some markers never became titles.
  if (titlesDetected < hideMarkers) {
    warnings.push(`found ${titlesDetected} of ~${hideMarkers} class sections — upload the missing days/rings separately or paste them`);
  } else if (classesExpected && classesFound < classesExpected - 4) {
    warnings.push(`timetable lists ~${classesExpected} classes but only ${classesFound} had rows (the rest may be empty or not yet run)`);
  }

  return { records, dropped, ambiguous, warnings, classesExpected, classesFound };
}

module.exports = { parseEvoEvents, looksEvoEvents, isTitleBlock };
