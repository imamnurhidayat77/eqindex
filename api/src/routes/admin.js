const { randomUUID } = require('node:crypto');
const pool = require('../db');
const privacy = require('../privacy');
const { asyncH } = require('../lib/async');
const { paging } = require('../lib/http');
const { audit } = require('../lib/audit');
const { needRole } = require('../lib/auth');
const { bustCache, bustPublic } = require('../middleware/cache');
const { bustVisibility, excludedClassTypes } = require('../lib/filters');
const { canonCategoryKey, masterCategoryKeys, bustCategoryKeys } = require('../lib/categories');
const {
  summarizeAssist, loadSeriesMap, applySeriesMap, parseCsv, csvRuleRecords,
  normName, groundRecords, ungroundedWarning, loadSeriesKeys,
} = require('../lib/assist');
const { suggestSeriesKey, seriesLike } = require('../lib/seriesKeys');
const {
  isBatchId, emptyCreated, similarNames, isUngroundedCell, fillIfNull, openBatch, closeBatch, undoBatch, UndoError,
} = require('../lib/importBatch');

module.exports = function mountAdminRoutes(app) {
  // ---- Rank snapshots: capture today's points ranks (idempotent per day) ----
  app.post('/admin/snapshots', needRole('ADMIN'), asyncH(async (req, res) => {
    await captureSnapshots();
    audit(req, 'admin.snapshot', 'system', null, {});
    res.json({ ok: true });
  }));

  async function captureSnapshots() {
    try {
      const h = await pool.query(
        'SELECT horse_id AS id, ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank, total_points AS points FROM horse_point_stats WHERE total_starts > 0');
      for (const r of h.rows) {
        await pool.query(
          `INSERT INTO ranking_snapshots (entity_type, entity_id, period, rank, points)
           VALUES ('horse', $1, CURRENT_DATE, $2, $3)
           ON CONFLICT (entity_type, entity_id, period) DO UPDATE SET rank = EXCLUDED.rank, points = EXCLUDED.points`,
          [r.id, r.rank, r.points]);
      }
      const rd = await pool.query(
        'SELECT rider_id AS id, ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank, total_points AS points FROM rider_point_stats WHERE total_starts > 0');
      for (const r of rd.rows) {
        await pool.query(
          `INSERT INTO ranking_snapshots (entity_type, entity_id, period, rank, points)
           VALUES ('rider', $1, CURRENT_DATE, $2, $3)
           ON CONFLICT (entity_type, entity_id, period) DO UPDATE SET rank = EXCLUDED.rank, points = EXCLUDED.points`,
          [r.id, r.rank, r.points]);
      }
    } catch { /* best effort */ }
  }

  app.get('/claims', needRole('ADMIN'), asyncH(async (req, res) => {
    const status = req.query.status || 'pending';
    const { rows } = await pool.query(
      `SELECT c.*, r.name AS rider, u.name AS claimant FROM rider_claims c
       JOIN riders r ON r.id = c.rider_id JOIN users u ON u.id = c.user_id
       WHERE c.status = $1 ORDER BY c.created_at`, [status]);
    res.json({ data: rows });
  }));

  app.post('/claims/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const { approve } = req.body || {};
    const q = await pool.query('SELECT * FROM rider_claims WHERE id = $1', [req.params.id]);
    if (!q.rows.length) return res.status(404).json({ error: 'not found' });
    const c = q.rows[0];
    if (approve) {
      await pool.query("UPDATE rider_claims SET status='approved' WHERE id=$1", [c.id]);
      audit(req, 'claim.approve', 'rider', c.rider_id, { user: c.user_id });
      await pool.query('UPDATE riders SET user_id=$2, claim_status=$3 WHERE id=$1', [c.rider_id, c.user_id, 'verified']);
    } else {
      await pool.query("UPDATE rider_claims SET status='rejected' WHERE id=$1", [c.id]);
      audit(req, 'claim.reject', 'rider', c.rider_id, { user: c.user_id });
      await pool.query("UPDATE riders SET claim_status='unclaimed' WHERE id=$1 AND user_id IS NULL", [c.rider_id]);
    }
    res.json({ ok: true, approved: !!approve });
  }));

  // ---- Audit activity feed (admin) ----
  app.get('/admin/activity', needRole('ADMIN'), asyncH(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const conds = [], params = [];
    if (req.query.action) { params.push(req.query.action); conds.push(`action = $${params.length}`); }
    if (req.query.entity) { params.push(req.query.entity); conds.push(`entity_type = $${params.length}`); }
    if (req.query.actor) { params.push(`%${req.query.actor}%`); conds.push(`actor ILIKE $${params.length}`); }
    if (req.query.since && /^\d{4}-\d{2}-\d{2}$/.test(req.query.since)) { params.push(req.query.since); conds.push(`created_at >= $${params.length}::date`); }
    if (req.query.until && /^\d{4}-\d{2}-\d{2}$/.test(req.query.until)) { params.push(req.query.until); conds.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`); }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT * FROM entity_audit ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT $${params.length}`, params);
    res.json({ data: rows });
  }));

  // Distinct audit actions for the admin filter dropdown.
  app.get('/admin/activity/actions', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT action, COUNT(*)::INT AS n FROM entity_audit GROUP BY action ORDER BY n DESC LIMIT 100');
    res.json({ data: rows });
  }));

  // Daily platform stats for the admin overview charts: competition rounds
  // (by class date) + imported rows (by log date) over the trailing window.
  app.get('/admin/stats/daily', needRole('ADMIN'), asyncH(async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days || '90', 10) || 90, 7), 365);
    const { rows } = await pool.query(
      `WITH cal AS (
         SELECT (CURRENT_DATE - (s || ' days')::INTERVAL)::DATE AS day
         FROM generate_series(0, $1 - 1) s
       ),
       r AS (
         SELECT c.class_date AS day, COUNT(*)::INT AS rounds
         FROM round_results rr JOIN classes c ON c.id = rr.class_id
         WHERE c.class_date >= CURRENT_DATE - ($1 - 1)
         GROUP BY 1
       ),
       im AS (
         SELECT created_at::DATE AS day, SUM(rows_ok)::INT AS imported
         FROM import_logs
         WHERE created_at >= CURRENT_DATE - ($1 - 1)
         GROUP BY 1
       )
       SELECT cal.day, COALESCE(r.rounds, 0) AS rounds, COALESCE(im.imported, 0) AS imported
       FROM cal LEFT JOIN r ON r.day = cal.day LEFT JOIN im ON im.day = cal.day
       ORDER BY cal.day`, [days]);
    const totalRounds = rows.reduce((t, x) => t + x.rounds, 0);
    const totalImported = rows.reduce((t, x) => t + x.imported, 0);
    res.json({ data: rows, summary: { days, totalRounds, totalImported } });
  }));

  // ---- Import Assistant: link/file → canonical records → human reviews →
  // existing dry-run preview → Commit. Deterministic rules first (Equipe
  // API, known CSV headers); AI (Muse Spark) only for unknown text formats.
  // Nothing here writes to the database.
  app.post('/admin/import/assist', needRole('ADMIN'), asyncH(async (req, res) => {
    const { source_url, text, filename, series_map, skip_practice } = req.body || {};
    if (source_url) {
      const m = String(source_url).match(/online\.equipe\.com\/shows\/(\d+)/);
      const em = String(source_url).match(/evoevents\.co\.nz\/results\/(\d+)/);
      if (!m && !em) return res.status(400).json({ error: 'Auto-read supports Equipe show URLs (online.equipe.com/shows/…) and EvoEvents results URLs (evoevents.co.nz/results/…). For anything else, paste the results text.' });
      if (em) {
        const { evoeventsRecords } = require('../lib/evoeventsFetch');
        let out;
        try {
          out = await evoeventsRecords(em[1]);
        } catch (e) {
          return res.status(502).json({ error: `Could not read EvoEvents event: ${e.message}` });
        }
        return res.json({ data: summarizeAssist('evoevents', { meeting: out.meeting }, out.records, out.skipped) });
      }
      const { equipeRecords } = require('../lib/equipe');
      let out;
      try {
        out = await equipeRecords(m[1], { seriesMap: series_map || {}, skipPractice: skip_practice !== false });
      } catch (e) {
        return res.status(502).json({ error: `Could not read Equipe show: ${e.message}` });
      }
      return res.json({ data: summarizeAssist('equipe', { meeting: out.meeting }, out.records, out.skipped) });
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'need {source_url} or {text}' });
    }
    // Deterministic CSV path: known headers incl. the 3 required columns.
    const csvRecords = csvRuleRecords(text);
    if (csvRecords) {
      return res.json({ data: summarizeAssist('csv-rule', { filename: filename || null }, csvRecords, []) });
    }
    // Deterministic EvoEvents path (no AI needed for these PDFs).
    const evo = await evoAssist(text, filename, req.authUser?.id);
    if (evo) return res.json({ data: evo.analysis });
    // AI fallback for unknown formats.
    try {
      const { aiMapRecords, aiAvailable } = require('../lib/ai');
      if (!aiAvailable()) {
        return res.status(503).json({ error: 'Format not recognised and AI is not configured. Use the CSV/JSON template instead.' });
      }
      const { records, dropped, truncated } = await aiMapRecords({ text, hint: filename ? `Source file: ${filename}.` : '' });
      const warnings = dropped ? [`${dropped} row(s) dropped (missing class/rider/horse)`] : [];
      const ungrounded = groundRecords(records, text);
      if (ungrounded) warnings.unshift(ungroundedWarning(ungrounded));
      if (truncated) warnings.push('File is very long — only the first ~72KB was mapped. Split the file and send the rest separately.');
      return res.json({ data: { ...summarizeAssist('ai', { filename: filename || null }, records, []), warnings } });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }));

  // Deterministic EvoEvents path: EvoEvents results PDFs (pasted or
  // browser-extracted) map without AI. Returns null when the text isn't
  // EvoEvents-shaped or nothing mappable was found (caller falls to AI).
  // Remembered series mappings auto-tag matching classes (counted aloud).
  async function evoAssist(blob, filename, userId) {
    const { parseEvoEvents, looksEvoEvents } = require('../lib/evoevents');
    if (!looksEvoEvents(blob)) return null;
    const parsed = parseEvoEvents(blob);
    if (!parsed.records.length) return null;
    const tagged = await applySeriesMap(parsed.records, userId);
    const warnings = [...parsed.warnings];
    if (tagged) warnings.push(`${tagged} row(s) tagged from your remembered series mappings`);
    return {
      reply: `Read ${filename || 'your file'} directly — ${parsed.records.length} rounds across ${parsed.classesFound} classes, no AI needed.`,
      analysis: { ...summarizeAssist('evoevents-rule', { filename: filename || null }, parsed.records, []), warnings },
    };
  }

  // ---- Import Assistant chat (separate menu from CSV import).
  // Conversational: link, pasted text, or uploaded file (PDF/CSV/TXT/JSON)
  // → canonical records + summary. NEVER writes; commit happens only via
  // the existing dry-run → Commit flow on this page or CSV import.
  app.post('/admin/import/chat', needRole('ADMIN'), asyncH(async (req, res) => {
    const multer = require('multer');
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
    upload.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: `upload failed: ${err.message}` });
      try {
        const out = await assistChat({
          messages: safeJson(req.body.messages, []),
          session: req.body.session,
          context: safeJson(req.body.context, null),
          file: req.file || null,
          filename: typeof req.body.filename === 'string' ? req.body.filename.slice(0, FILENAME_MAX) : '',
          userId: req.authUser?.id || null,
        });
        res.json({ data: out });
      } catch (e) {
        res.status(502).json({ error: e.message });
      }
    });
  }));

  // ---- Import Assistant background jobs (Phase 3): poll mapping progress.
  app.get('/admin/import/jobs/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id || '')) return res.status(404).json({ error: 'job not found' });
    const { getJob } = require('../lib/agentJobs');
    const job = await getJob({ id: req.params.id, userId: req.authUser?.id });
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json({
      data: {
        id: job.id,
        status: job.status,
        progress: job.progress || null,
        error: job.error || null,
        ...(job.status === 'done' && job.output ? job.output : {}),
      },
    });
  }));

  const FILENAME_MAX = 200;
  const FILE_CONTENTS_PREFIX = 'File contents (';
  // Earlier file dumps would eat the whole prompt budget — keep a short
  // marker instead; the newest message is left as sent.
  function omitOldFileContents(messages) {
    return messages.map((m, i) => (
      i < messages.length - 1 && m.role === 'user' && String(m.content || '').startsWith(FILE_CONTENTS_PREFIX)
        ? { ...m, content: `[file contents omitted: ${String(m.content).slice(FILE_CONTENTS_PREFIX.length).split('):', 1)[0]}]` }
        : m));
  }

  function safeJson(v, fb) {
    try { const j = typeof v === 'string' ? JSON.parse(v) : v; return j ?? fb; } catch { return fb; }
  }

  async function assistChat({ messages, session, context, file, filename: sentName, userId }) {
    const { aiAgent, aiAvailable } = require('../lib/ai');
    const { TOOL_DEFS, runTool } = require('../lib/agentTools');
    const { equipeRecords } = require('../lib/equipe');
    const lastUser = [...(messages || [])].reverse().find((m) => m.role === 'user');
    const raw = String(lastUser?.content || '');
    // Browser-extracted files arrive as "File contents (name):\n<text>" —
    // drop that label line so a CSV's first line is its header row.
    const text = raw.startsWith(FILE_CONTENTS_PREFIX) ? raw.slice(raw.indexOf('\n') + 1) : raw;
    const url = text.match(/online\.equipe\.com\/shows\/(\d+)/);

    // 1. File attachment → extract text.
    let fileText = '', filename = file ? '' : String(sentName || '');
    if (file) {
      filename = file.originalname || 'upload';
      if (/\.pdf$/i.test(filename)) {
        const pdf = require('pdf-parse');
        fileText = (await pdf(file.buffer)).text || '';
      } else {
        fileText = file.buffer.toString('utf8');
      }
      if (!fileText.trim()) {
        return { reply: `I couldn't read any text from ${filename}. For PDFs, a text-based export works best — scanned images can't be read. Try pasting the results or uploading a CSV instead.`, analysis: null };
      }
    }
    const blob = [text, fileText].filter(Boolean).join('\n\n');

    // 2. Equipe link → deterministic fetch.
    if (url) {
      const out = await equipeRecords(url[1], { skipPractice: true });
      const withSeries = out.records.filter((r) => r.series_key).length;
      return {
        reply: `${out.meeting}: ${out.records.length} rounds across the show-jumping classes (${withSeries} already mapped to a series, ${out.records.filter((r) => r.start_order).length} with start order). ${out.skipped.length ? `${out.skipped.length} skipped (${out.skipped[0][2]}…). ` : ''}Have a look at the summary below — if it looks right, load it into the editor, validate, then commit. Nothing is saved yet.`,
        analysis: summarizeAssist('equipe', { meeting: out.meeting }, out.records, out.skipped),
      };
    }

    // 2b. EvoEvents link → deterministic fetch (no PDF needed).
    const evoUrl = text.match(/evoevents\.co\.nz\/results\/(\d+)/);
    if (evoUrl) {
      const { evoeventsRecords } = require('../lib/evoeventsFetch');
      let out;
      try {
        out = await evoeventsRecords(evoUrl[1]);
      } catch (e) {
        return { reply: `I couldn't read that EvoEvents page: ${e.message}. Check the link, or upload the results PDF instead.`, analysis: null };
      }
      return {
        reply: `${out.meeting} (${out.event.date_start} → ${out.event.date_end}): ${out.records.length} rounds across the show-jumping classes. ${out.skipped.length ? `${out.skipped.length} skipped. ` : ''}Have a look at the summary below — if it looks right, load it into the editor, validate, then commit. Nothing is saved yet.`,
        analysis: summarizeAssist('evoevents', { meeting: out.meeting }, out.records, out.skipped),
      };
    }

    // 3. Results text (pasted or from file) → csv-rule, evoevents-rule, else AI.
    if (blob.trim().length > 40) {
      const records = csvRuleRecords(blob);
      if (records) {
        return {
          reply: `That looks like a CSV with known headers — mapped ${records.length} rows directly (no AI needed). Check the summary, then validate & commit when ready.`,
          analysis: summarizeAssist('csv-rule', { filename: filename || null }, records, []),
        };
      }
      const evo = await evoAssist(blob, filename, userId);
      if (evo) {
        const noSeries = evo.analysis.records.filter((r) => !r.series_key).length;
        return {
          reply: `${evo.reply} ${noSeries ? `${noSeries} have no series — tell me which classes are series classes (e.g. "class 9 is pro-am") and I'll tag them. ` : ''}Review below, then validate & commit — nothing saved yet.`,
          analysis: evo.analysis,
        };
      }
      // Short typed text without results markers is a question, not results
      // (previously any message over 40 chars was force-sent to AI mapping
      // and wrongly told the admin "couldn't find result rows"). Long
      // pastes and file attachments still try AI mapping below.
      const { looksEvoEvents } = require('../lib/evoevents');
      if (!filename && !looksEvoEvents(blob) && blob.trim().length <= 500) {
        // fall through to free chat (step 4)
      } else {
        if (!aiAvailable()) {
          return { reply: 'I can see results text but the format is unfamiliar and my AI mapping is not configured. Please reshape it to the CSV template (Admin → CSV Import has one), or ask your admin to set the AI key.', analysis: null };
        }
        // AI mapping runs as a background job: big files take longer than
        // the ~30s proxy limit. The client polls the job until done.
        const { queueAiMapJob } = require('../lib/agentJobs');
        const jobId = await queueAiMapJob({
          userId,
          text: blob,
          hint: filename ? `Source file: ${filename}.` : '',
          filename: filename || null,
        });
        return {
          reply: `Mapping ${filename || 'your text'} in the background — I'll post the summary here when it's done. Nothing is saved until you validate & commit.`,
          analysis: null,
          job: { id: jobId },
        };
      }
    }

    // 4. Free chat about importing — agentic: the model can look up
    // shows, events, horses, riders and series via tools before answering,
    // and remember lasting preferences via memory tools. It can never save
    // results; Commit stays human.
    const ctx = context ? `Last analysis: ${JSON.stringify(context).slice(0, 800)}.` : 'No analysis yet this session.';
    const memMaps = await loadSeriesMap(userId);
    const memLine = memMaps.length
      ? `Remembered series mappings for this admin: ${memMaps.map((m) => `"${m.pattern}" → ${m.series_key}`).join(', ')}. Apply them when tagging; mention counts.`
      : 'No remembered series mappings for this admin yet.';
    const { reply } = await aiAgent({
      session,
      system: `You are the EQIndex Import Assistant. You help an admin import show-jumping results. Capabilities: read Equipe show URLs (online.equipe.com/shows/ID) and EvoEvents results URLs (evoevents.co.nz/results/ID) directly — no PDF needed for those, map pasted results text or uploaded files (PDF/CSV/TXT/JSON) to canonical records, explain warnings (missing series_key means 0 series points, skipped rows), and guide the validate-then-commit flow. You have tools: use equipe_show for show links instead of guessing, events_list to help pick an import target, horses_search/riders_search to check whether names already exist, series_list for the exact series vocabulary (never invent a series_key). When the admin states a lasting preference (e.g. "class 9 is pro-am", "remember my venue is X"), store it with memory_save (series_map keys are lowercase class-name fragments); recall with memory_list when unsure. ${memLine} Rules: never claim anything is saved (only dry-run preview then human Commit saves); use tools when the answer needs real data, otherwise answer directly; keep replies short and practical. ${ctx}`,
      messages: omitOldFileContents((messages || []).slice(-8)),
      tools: TOOL_DEFS,
      runTool,
      toolCtx: { userId },
      maxIter: 2,
    });
    return { reply, analysis: null };
  }

  // Fallback height from the class name when no height column/field came
  // through ("Pony Points Prize 1.10 Championship" → 110). Unit-based
  // first (upper bound of ranges), then bare "1.10" style — never Article
  // numbers (238.2.2), years, or money. JS-import-only (the Python mirror
  // has its own parser); returns cm or null.
  function parseClassHeight(name) {
    const s = String(name || '');
    let m = s.match(/(\d+(?:\.\d+)?)\s*[-/]\s*(\d+(?:\.\d+)?)\s*(cm|m)\b/i);
    if (m) {
      const v = Number(m[2]) * (m[3].toLowerCase() === 'm' ? 100 : 1);
      if (v >= 50 && v <= 200) return Math.round(v);
    }
    m = s.match(/(\d+(?:\.\d+)?)\s*(cm|m)\b/i);
    if (m) {
      const v = Number(m[1]) * (m[2].toLowerCase() === 'm' ? 100 : 1);
      if (v >= 50 && v <= 200) return Math.round(v);
    }
    m = s.match(/(?<![\d.])(\d)\.(\d{2})(?!\.\d)/);
    if (m) {
      const v = Number(`${m[1]}.${m[2]}`) * 100;
      if (v >= 50 && v <= 200) return Math.round(v);
    }
    return null;
  }

  // ---- Admin CSV import (spec §8A): paste/upload → validate → preview → commit.
  // Body: { event_id?, event?: {name,date_start,date_end,venue,region,arena_type},
  //         csv, filename?, source?, dry_run? }
  // One file may span MULTIPLE events: rows carrying event_name + date_start
  // (+date_end) are routed to their own event (auto-created); rows without fall
  // back to the request target. Target required only when some row lacks it.
  // Header vocab (case-insensitive): class_name|class, class_type, class_date,
  // rider_name|rider, horse_name|horse, placing|finish_place, faults|jump_faults,
  // time|time_seconds, time_faults, height_cm, format (Two-phase|Jump-off|Speed|Power & Speed),
  // event_name|event, date_start|event_date, date_end,
  // status (finished|E|R|W|DQ...), notes.
  // dry_run runs the SAME writes inside a rolled-back transaction: preview points
  // come from the real trigger, never a duplicated formula.
  const CLASS_TYPES = ['Grand Prix', 'Premier', 'Open', 'Standard', 'Young Horse', 'Amateur', 'Pony'];
  const FORMATS = ['Two-phase', 'Jump-off', 'Speed', 'Power & Speed'];
  const STATUS_MAP = { E: 'eliminated', R: 'retired', W: 'withdrawn', DQ: 'disqualified', ELIM: 'eliminated', RET: 'retired', WD: 'withdrawn', NS: 'withdrawn', FINISHED: 'finished', ELIMINATED: 'eliminated', RETIRED: 'retired', WITHDRAWN: 'withdrawn', DISQUALIFIED: 'disqualified' };

  // Canonical import record (JSON mode uses these exact keys; CSV headers map to them).
  const IMPORT_FIELDS = ['class_name', 'class_type', 'class_date', 'rider_name', 'horse_name',
    'placing', 'faults', 'time', 'time_faults', 'height_cm', 'format', 'status', 'notes', 'series_key',
    'field_size',
    'breed', 'age', 'gender', 'sire', 'dam', 'damsire', 'breeder', 'country', 'color', 'year_of_birth',
    'arena_name', 'arena_type', 'surface', 'start_time',
    'round2_faults', 'round2_time', 'jumpoff_faults', 'jumpoff_time', 'prize',
    'start_order', 'nominated', 'is_world_cup',
    'region', 'rider_region', 'series_category', 'rider_series', 'nationality', 'rider_nationality',
    'venue', 'venue_country', 'arena_type', 'event_name', 'date_start', 'date_end'];
  // Optional enrichment columns (fill-if-null only — never overwrites curated data).
  const GENDERS = ['Mare', 'Gelding', 'Stallion', 'Filly', 'Colt', 'Mare/Other', 'Unknown'];
  // Rider category vocabulary comes from the rider_categories master table
  // (see lib/categories.js) — never a hardcoded list here.
  const canon = (v, list) => {
    const t = String(v || '').trim().toLowerCase();
    if (!t) return null;
    return list.find((x) => x.toLowerCase() === t) || null;
  };
  const cleanAge = (v) => {
    const t = String(v ?? '').trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isInteger(n) && n >= 0 && n <= 40 ? n : null;
  };
  const JUNK = new Set(['', 'unknown', 'n/a', 'na', 'n-a', '-', '--', 'unsure', 'nil', 'tbd']);
  const cleanName = (v) => {
    const t = String(v ?? '').trim();
    if (!t || JUNK.has(t.toLowerCase())) return null;
    return t.slice(0, 100);
  };
  const cleanYob = (v) => {
    const t = String(v ?? '').trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isInteger(n) && n >= 1980 && n <= 2100 ? n : null;
  };
  const ARENA_TYPES = ['Indoor', 'Outdoor', 'Covered outdoor arena', 'Unknown'];
  const SURFACES = ['Grass', 'Sand', 'Fibre-sand', 'Synthetic', 'Other', 'Unknown'];
  const canonSurface = (v) => {
    const t = String(v || '').trim().toLowerCase();
    if (!t) return null;
    if (t.startsWith('fibre') || t.startsWith('fiber')) return 'Fibre-sand';
    return canon(v, SURFACES);
  };

  app.post('/admin/import', needRole('ADMIN'), asyncH(async (req, res) => {
    const { event_id, event, csv, records, filename, source, dry_run, batch_id } = req.body || {};
    const src = ['CSV', 'MANUAL', 'ESNZ', 'EQUIPE', 'FEI'].includes(source) ? source : 'CSV';
    if (batch_id !== undefined && batch_id !== null && !isBatchId(batch_id)) {
      return res.status(400).json({ error: 'batch_id must be a UUID' });
    }
    let grid, head;
    if (Array.isArray(records)) {
      if (!records.length) return res.status(400).json({ error: 'records is empty' });
      const keys = [...new Set(records.flatMap((r) => Object.keys(r || {})))];
      const normKey = (k) => String(k).trim().toLowerCase().replace(/\s+/g, '_');
      head = keys.map(normKey);
      grid = [head, ...records.map((r) => head.map((_, i) => {
        const orig = keys[i];
        const v = r[orig];
        return v === null || v === undefined ? '' : String(v);
      }))];
    } else {
      if (!csv || typeof csv !== 'string' || !csv.trim()) {
        return res.status(400).json({ error: 'need {csv} text or {records} array' });
      }
      grid = parseCsv(csv.trim());
      if (grid.length < 2) return res.status(400).json({ error: 'csv needs a header row + data' });
      head = grid[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
    }
    const col = (...names) => { const i = head.findIndex((h) => names.includes(h)); return i; };
    const ci = {
      cls: col('class_name', 'class'), ctype: col('class_type'), cdate: col('class_date', 'date'),
      rider: col('rider_name', 'rider'), horse: col('horse_name', 'horse'),
      place: col('placing', 'finish_place', 'place'), faults: col('faults', 'jump_faults'),
      time: col('time', 'time_seconds'), tfaults: col('time_faults'), height: col('height_cm', 'height'),
      format: col('format'), status: col('status'), notes: col('notes'),
      color: col('color', 'colour'), yob: col('year_of_birth', 'born', 'yob'),
      damsire: col('damsire', 'dam_sire', 'dam-sire'),
      arena_name: col('arena_name', 'arena', 'location'),
      arena_type_c: col('class_arena_type'), surface: col('surface'),
      start_time: col('start_time', 'time_started'),
      r2f: col('round2_faults'), r2t: col('round2_time'),
      jof: col('jumpoff_faults'), jot: col('jumpoff_time'), prize: col('prize', 'prize_money'),
      start_order: col('start_order'), nominated: col('nominated'),
      wc: col('is_world_cup', 'world_cup', 'wc'),
      fsize: col('field_size', 'starters', 'field'),
      breed: col('breed'), age: col('age'), gender: col('gender'), sire: col('sire'), dam: col('dam'),
      breeder: col('breeder'), country: col('country'),
      region: col('region'), rider_region: col('rider_region'),
      series_category: col('series_category', 'rider_series'), nationality: col('nationality', 'rider_nationality'),
      venue: col('venue'), venue_country: col('venue_country'), arena_type: col('arena_type'),
      event_name: col('event_name', 'event'), date_start: col('date_start', 'event_date'), date_end: col('date_end'),
    };
    ci.series = col('series_key', 'series');
    ci.suggested = col('series_suggested');
    for (const k of ['cls', 'rider', 'horse']) {
      if (ci[k] < 0) return res.status(400).json({ error: `missing required column for ${k} (class_name, rider_name, horse_name)` });
    }
    // Name gate (mirrors the review UI): rows whose AI-mapped names were not
    // found in the source need an explicit names_ack before they are saved.
    // The flag column itself is never written anywhere.
    ci.ungrounded = col('ungrounded');
    if (!dry_run && !req.body.names_ack && ci.ungrounded >= 0) {
      const flagged = grid.slice(1).map((r, i) => ({ line: i + 2, value: r[ci.ungrounded] }))
        .filter((x) => isUngroundedCell(x.value)).map(({ line, value }) => ({ line, fields: String(value) }));
      if (flagged.length) {
        return res.status(409).json({
          error: `${flagged.length} row(s) have names not found in the source text — check them and confirm (names_ack) before commit`,
          ungrounded: flagged,
        });
      }
    }
    const num = (v) => { const t = String(v ?? '').trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Bulk speed: the AFTER share trigger recalculates the WHOLE class
      // per inserted row (O(n^2) over a slow link). Disable it for the load
      // and recalculate each touched class ONCE afterwards. The BEFORE
      // points trigger is disabled too (we insert the 0 placeholder; the
      // recalc stamps points + points_version). Transactional —
      // COMMIT/ROLLBACK restores both triggers automatically.
      // Undo support (migration 117): a commit belongs to one batch; the
      // browser reuses its id across chunks and Resume, else one per request.
      const batchId = dry_run ? null : (batch_id || randomUUID());
      const created = emptyCreated();
      const fills = [];
      if (batchId) {
        const refusal = await openBatch(client, {
          id: batchId, actorId: req.authUser?.id, actorName: req.authUser?.name, source: src, filename,
        });
        if (refusal) { await client.query('ROLLBACK'); return res.status(409).json({ error: refusal }); }
      }
      await client.query('ALTER TABLE round_results DISABLE TRIGGER round_results_esnz_share_trg');
      await client.query('ALTER TABLE round_results DISABLE TRIGGER round_results_points_trg');
      const touchedClasses = new Set();
      // In-request caches: the DB link is ~50ms RTT, so per-row lookups
      // would cost minutes on big files. Preload small tables once; lazily
      // cache classes, events and per-class dup sets. All writes go through
      // the same transaction, so caches stay consistent.
      const catKeys = await masterCategoryKeys(pool);
      const sireMap = new Map((await client.query(
        'SELECT normalized_alias, canonical_name FROM sire_aliases')).rows
        .map((r) => [r.normalized_alias, r.canonical_name]));
      const horseCache = new Map((await client.query(
        'SELECT normalized_name, id FROM horses')).rows.map((r) => [r.normalized_name, r.id]));
      const riderCache = new Map((await client.query(
        'SELECT normalized_name, id FROM riders')).rows.map((r) => [r.normalized_name, r.id]));
      const classCache = new Map(); // `${eventId}|${name}|${date}` -> row
      const eventCache = new Map(); // `${name}|${date}` -> {id, name}
      const dupCache = new Map();   // classId -> Set(`horse|rid`)
      let evId = event_id || null;
      const ensureVenue = async (name, region) => {
        if (!name) return null;
        const nn = String(name).trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
        if (!nn) return null;
        let v = (await client.query('SELECT id FROM venues WHERE normalized_name = $1', [nn])).rows[0];
        if (!v) {
          v = (await client.query('INSERT INTO venues (name, normalized_name, region) VALUES ($1,$2,$3) RETURNING id',
            [String(name).trim(), nn, region || null])).rows[0];
          created.venues.push(v.id);
        }
        return v.id;
      };
      if (!evId && event && event.name && event.date_start) {
        const ex = await client.query('SELECT id FROM events WHERE name = $1 AND date_start = $2', [event.name, event.date_start]);
        if (ex.rows.length) evId = ex.rows[0].id;
        else {
          const season = (() => { const y = Number(String(event.date_start).slice(0, 4)); const m = Number(String(event.date_start).slice(5, 7)); return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`; })();
          const ins = await client.query(
            `INSERT INTO events (name, date_start, date_end, venue, region, arena_type, season, source)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'MANUAL') RETURNING id`,
            [event.name, event.date_start, event.date_end || event.date_start, event.venue || 'Unknown',
             event.region || null, event.arena_type || null, season]);
          evId = ins.rows[0].id;
          created.events.push(evId);
        }
      }
      // multi-event: rows may carry their own event_name + date_start
      const rowsHaveEvents = grid.slice(1).some((r) => String(r[ci.event_name] ?? '').trim());
      if (!evId && !rowsHaveEvents) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'need event_id, event{name,date_start}, or per-row event_name+date_start' });
      }
      const evNames = {}, perEvent = {};
      const bump = (id, name, k) => {
        evNames[id] = name;
        (perEvent[id] ||= { ok: 0, failed: 0, name });
        perEvent[id][k]++;
      };
      const seasonOf = (ds) => {
        const y = Number(String(ds).slice(0, 4)), m = Number(String(ds).slice(5, 7));
        return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
      };
      const resolveRowEvent = async (rname, ds, de, hint) => {
        if (!rname) {
          if (!evId) return { error: 'no target event; add event_name + date_start to this row' };
          return { id: evId, name: evNames[evId] || 'event' };
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ds || '')) return { error: 'row event needs date_start YYYY-MM-DD' };
        const ex = await client.query('SELECT id, name, is_active FROM events WHERE name = $1 AND date_start = $2', [rname, ds]);
        if (ex.rows.length) {
          if (ex.rows[0].is_active === false) return { error: `event "${rname}" is switched off — enable it in Admin → Events` };
          return { id: ex.rows[0].id, name: ex.rows[0].name };
        }
        const ins = await client.query(
          `INSERT INTO events (name, date_start, date_end, venue, region, arena_type, season, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'MANUAL') RETURNING id, name`,
          [rname, ds, de || ds, (hint && hint.venue) || 'Unknown',
           (hint && hint.region) || null, (hint && hint.arena) || null, seasonOf(ds)]);
        created.events.push(ins.rows[0].id);
        return { id: ins.rows[0].id, name: ins.rows[0].name };
      };
      if (evId) {
        const evRow = (await client.query('SELECT name, season, venue, region, venue_id, is_active FROM events WHERE id = $1', [evId])).rows[0];
        if (!evRow) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'event not found' }); }
        if (evRow.is_active === false) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'event is switched off — enable it in Admin → Events' }); }
        evNames[evId] = evRow.name;
        if (!evRow.venue_id) {
          const vid = await ensureVenue(evRow.venue, evRow.region);
          if (vid) fills.push(...await fillIfNull(client, 'events', evId, { venue_id: vid }));
        }
      }

      const out = [];
      let okCount = 0, enriched = 0, seriesTagged = 0, seriesMemory = 0, heightInferred = 0;
      const seriesVerify = new Map(); // class name -> rows, series-like but no key match
      const heightMissing = new Set(); // new class names still without height
      // Remembered series mappings (per admin) fill gaps the name rules miss.
      const memMaps = await loadSeriesMap(req.authUser?.id).catch(() => []);
      // Registry gate: explicit keys must exist; auto-suggested ones that
      // don't are dropped (row stays, untagged). null = empty registry.
      const validSeries = await loadSeriesKeys(); // pool, not client: a failed read must not abort the tx
      const knownSeries = (k) => !validSeries || validSeries.has(k);
      const memHit = (cls) => {
        const name = String(cls || '').toLowerCase();
        const hit = memMaps.find((m) => name.includes(m.pattern));
        return hit ? hit.series_key : null;
      };
      const evFills = {};
      for (let li = 1; li < grid.length; li++) {
        const r = grid[li];
        const g = (i) => (i < 0 ? '' : String(r[i] ?? '').trim());
        const errs = [];
        const rider = g(ci.rider), horse = g(ci.horse), cls = g(ci.cls);
        if (!rider) errs.push('rider_name required');
        if (!horse) errs.push('horse_name required');
        if (!cls) errs.push('class_name required');
        let ctype = g(ci.ctype) || 'Standard';
        if (!CLASS_TYPES.includes(ctype)) errs.push(`class_type must be ${CLASS_TYPES.join('|')}`);
        const fmtRaw = g(ci.format);
        if (fmtRaw && !FORMATS.includes(fmtRaw)) errs.push(`format must be ${FORMATS.join('|')}`);
        const fmt = fmtRaw || null;
        const cArenaType = canon(g(ci.arena_type_c), ARENA_TYPES);
        if (g(ci.arena_type_c) && !cArenaType) errs.push(`class arena_type must be ${ARENA_TYPES.join('|')}`);
        const cSurface = canonSurface(g(ci.surface));
        if (g(ci.surface) && !cSurface) errs.push(`surface must be ${SURFACES.join('|')}`);
        const cArenaName = g(ci.arena_name) || null;
        const cStart = g(ci.start_time) || null;
        if (cStart && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cStart)) errs.push('start_time must be HH:MM');
        const r2f = num(g(ci.r2f)), r2t = num(g(ci.r2t)), jof = num(g(ci.jof)), jot = num(g(ci.jot));
        const prize = num(g(ci.prize));
        for (const [v, n] of [[r2f, 'round2_faults'], [r2t, 'round2_time'], [jof, 'jumpoff_faults'], [jot, 'jumpoff_time'], [prize, 'prize']]) {
          if (v !== null && (typeof v !== 'number' || Number.isNaN(v))) errs.push(`${n} must be numeric`);
        }
        const place = g(ci.place) === '' ? null : parseInt(g(ci.place), 10);
        if (g(ci.place) !== '' && !(place >= 1)) errs.push('placing must be a positive integer');
        const faults = num(g(ci.faults)); const tsec = num(g(ci.time));
        const tf = num(g(ci.tfaults)); const hcm = num(g(ci.height));
        for (const [v, n] of [[faults, 'faults'], [tsec, 'time'], [tf, 'time_faults'], [hcm, 'height_cm']]) {
          if (v !== null && (typeof v !== 'number' || Number.isNaN(v))) errs.push(`${n} must be numeric`);
        }
        // Starter count (Model B field/place multipliers read it; 0/blank =
        // unknown -> falls back to actual DB starters, never "field of 0").
        const fsizeRaw = g(ci.fsize);
        const fsize = fsizeRaw === '' ? null : parseInt(fsizeRaw, 10);
        if (fsizeRaw !== '' && !(fsize >= 1)) errs.push('field_size must be a positive integer');
        let status = 'finished';
        const stRaw = g(ci.status).toUpperCase();
        if (stRaw) {
          if (['FINISHED', 'E', 'R', 'W', 'DQ', 'NS', 'ELIM', 'RET', 'WD', 'ELIMINATED', 'RETIRED', 'WITHDRAWN', 'DISQUALIFIED'].includes(stRaw)) {
            status = STATUS_MAP[stRaw] || 'finished';
          } else errs.push('status must be finished|E|R|W|DQ|NS');
        }
        const cdate = g(ci.cdate) || null;
        if (cdate && !/^\d{4}-\d{2}-\d{2}$/.test(cdate)) errs.push('class_date must be YYYY-MM-DD');
        const startOrder = g(ci.start_order) === '' ? null : parseInt(g(ci.start_order), 10);
        if (g(ci.start_order) !== '' && !(startOrder >= 1)) errs.push('start_order must be a positive integer');
        // Manual nomination lock (Charles rule): true = nominated, false =
        // not. Blank = automatic (first horse into the ring by start_order).
        let nominated = null;
        const nomRaw = g(ci.nominated).toLowerCase();
        if (nomRaw) {
          if (['true', '1', 'yes', 'y'].includes(nomRaw)) nominated = true;
          else if (['false', '0', 'no', 'n'].includes(nomRaw)) nominated = false;
          else errs.push('nominated must be true|false');
        }
        // World Cup class flag (Charles sheet WC column): counts toward the
        // World Cup division instead of height bands. Blank = false.
        let worldCup = null;
        const wcRaw = g(ci.wc).toLowerCase();
        if (wcRaw) {
          if (['true', '1', 'yes', 'y', 'world cup', 'wc'].includes(wcRaw)) worldCup = true;
          else if (['false', '0', 'no', 'n'].includes(wcRaw)) worldCup = false;
          else errs.push('is_world_cup must be true|false');
        }
        const givenSeries = g(ci.series);
        const givenSuggested = g(ci.suggested) === 'true';
        if (givenSeries && !givenSuggested && !knownSeries(givenSeries)) errs.push(`unknown series_key ${givenSeries.slice(0, 60)}`);
        if (errs.length) { out.push({ line: li + 1, ok: false, errors: errs }); continue; }

        // per-row event (multi-event files) or the request target
        const rowEv = await resolveRowEvent(g(ci.event_name), g(ci.date_start), g(ci.date_end), {
          venue: g(ci.venue) || null, region: g(ci.region) || null, arena: g(ci.arena_type) || null,
        });
        if (rowEv.error) { out.push({ line: li + 1, ok: false, errors: [rowEv.error] }); continue; }
        const rEvId = rowEv.id;

        // identity (mirrors ingest/normalize.py)
        const rn = normName(rider), hn = normName(horse);
        // sire spelling: resolve known variants to canonical (sire_aliases,
        // migration 046) so one sire never splits into two rankings again.
        let sireName = cleanName(g(ci.sire));
        if (sireName) sireName = sireMap.get(normName(sireName)) || sireName;
        // optional enrichment (fill-if-null only — curated values always win)
        const hEn = {
          breed: g(ci.breed) || null, age: cleanAge(g(ci.age)),
          gender: canon(g(ci.gender), GENDERS), sire: sireName, dam: cleanName(g(ci.dam)),
          damsire: cleanName(g(ci.damsire)), breeder: cleanName(g(ci.breeder)),
          country: g(ci.country) || null, color: g(ci.color) || null,
          year_of_birth: cleanYob(g(ci.yob)),
        };
        const rEn = {
          region: g(ci.rider_region) || null,
          series_category: canonCategoryKey(g(ci.series_category), catKeys),
          nationality: g(ci.nationality) || null,
        };
        for (const k of ['venue', 'venue_country', 'region', 'arena_type']) {
          const v = g(ci[k]);
          const ef = (evFills[rEvId] ||= {});
          if (v && ef[k] === undefined) ef[k] = v;
        }
        // fill-if-null, recorded so an undo can revert exactly these values
        const fillNull = async (table, id, obj) => {
          const changed = await fillIfNull(client, table, id, obj);
          fills.push(...changed);
          return changed.length ? 1 : 0;
        };
        let hId = horseCache.get(hn), rId = riderCache.get(rn);
        const newHorse = !hId, newRider = !rId;
        if (!hId) {
          const hk = Object.keys(hEn).filter((k) => hEn[k] !== null);
          hId = (await client.query(
            `INSERT INTO horses (name, normalized_name${hk.length ? ', ' + hk.join(', ') : ''})
             VALUES ($1,$2${hk.map((_, i) => `,$${i + 3}`).join('')}) RETURNING id`,
            [horse, hn, ...hk.map((k) => hEn[k])])).rows[0].id;
          horseCache.set(hn, hId);
          created.horses.push(hId);
        } else {
          enriched += await fillNull('horses', hId, hEn);
        }
        if (!rId) {
          const rk = Object.keys(rEn).filter((k) => rEn[k] !== null);
          rId = (await client.query(
            `INSERT INTO riders (name, normalized_name${rk.length ? ', ' + rk.join(', ') : ''})
             VALUES ($1,$2${rk.map((_, i) => `,$${i + 3}`).join('')}) RETURNING id`,
            [rider, rn, ...rk.map((k) => rEn[k])])).rows[0].id;
          riderCache.set(rn, rId);
          created.riders.push(rId);
        } else {
          enriched += await fillNull('riders', rId, rEn);
        }
        const explicitSeries = givenSeries && knownSeries(givenSeries) ? givenSeries : '';
        const memKey = !explicitSeries ? memHit(cls) : null;
        const autoKey = !explicitSeries && !memKey ? suggestSeriesKey(cls) : null;
        const seriesKey = explicitSeries || memKey || (autoKey && knownSeries(autoKey) ? autoKey : null);
        const seriesSuggested = !explicitSeries && !!seriesKey;
        if (seriesSuggested) seriesTagged++;
        if (memKey) seriesMemory++;
        if (!seriesKey && cls && seriesLike(cls)) seriesVerify.set(cls, (seriesVerify.get(cls) || 0) + 1);
        const ck = `${rEvId}|${cls}|${cdate || ''}`;
        let cRow = classCache.get(ck);
        if (cRow === undefined) {
          cRow = (await client.query('SELECT id, series_key, is_active, is_world_cup FROM classes WHERE event_id = $1 AND name = $2 AND COALESCE(class_date::TEXT,\'\') = COALESCE($3,\'\')', [rEvId, cls, cdate])).rows[0] || null;
          classCache.set(ck, cRow);
        }
        const newClass = !cRow;
        if (cRow && cRow.is_active === false) {
          out.push({ line: li + 1, ok: false, errors: [`class "${cls}" is switched off — enable it in Admin → Classes`] });
          bump(rEvId, rowEv.name, 'failed');
          continue;
        }
        if (!cRow) {
          const classHcm = hcm ?? parseClassHeight(cls);
          if ((hcm === null || hcm === undefined) && classHcm === null) heightMissing.add(cls);
          if ((hcm === null || hcm === undefined) && classHcm !== null) heightInferred++;
          cRow = (await client.query(
            'INSERT INTO classes (event_id, name, class_date, height_cm, class_type, format, series_key, arena_name, arena_type, surface, start_time, is_world_cup, field_size, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,\'MANUAL\') RETURNING id',
            [rEvId, cls, cdate || null, classHcm, ctype, fmt, seriesKey, cArenaName, cArenaType, cSurface, cStart, worldCup === true, fsize])).rows[0];
          classCache.set(ck, cRow);
          created.classes.push(cRow.id);
        } else {
          if (seriesKey && !cRow.series_key) cRow.series_key = seriesKey;
          fills.push(...await fillIfNull(client, 'classes', cRow.id, {
            series_key: seriesKey || null, arena_name: cArenaName, arena_type: cArenaType,
            surface: cSurface, start_time: cStart, field_size: fsize || null,
          }));
          if (worldCup === true && !cRow.is_world_cup) {
            await client.query('UPDATE classes SET is_world_cup = true WHERE id = $1', [cRow.id]);
            fills.push({ table: 'classes', id: cRow.id, column: 'is_world_cup', old: false, new: true });
            cRow.is_world_cup = true;
          }
        }
        let dupSet = dupCache.get(cRow.id);
        if (!dupSet) {
          const existing = await client.query(
            'SELECT horse_id, rider_id FROM round_results WHERE class_id = $1', [cRow.id]);
          dupSet = new Set(existing.rows.map((r) => `${r.horse_id}|${r.rider_id}`));
          dupCache.set(cRow.id, dupSet);
        }
        if (dupSet.has(`${hId}|${rId}`)) {
          out.push({ line: li + 1, ok: false, errors: ['duplicate of an existing round'] });
          bump(rEvId, rowEv.name, 'failed');
          continue;
        }
        const tot = (faults ?? 0) + (tf ?? 0);
        const ins = await client.query(
          `INSERT INTO round_results (event_id, class_id, horse_id, rider_id, jump_faults, time_faults,
            total_faults, time_seconds, finish_place, clear_round, height_cm, status, notes, source, points,
            round2_faults, round2_time_seconds, jumpoff_faults, jumpoff_time_seconds, prize_money,
            start_order, nominated_manual, import_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'MANUAL',0,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id, points`,
          [rEvId, cRow.id, hId, rId, faults ?? 0, tf ?? 0, tot, tsec, place,
           status === 'finished' && tot === 0, hcm, status, g(ci.notes) || null, r2f, r2t, jof, jot, prize,
           startOrder, nominated, batchId]);
        dupSet.add(`${hId}|${rId}`);
        okCount++;
        bump(rEvId, rowEv.name, 'ok');
        touchedClasses.add(cRow.id);
        // Points are recalculated once per class after the loop (see below),
        // so store the row id and patch the preview then.
        out.push({ line: li + 1, ok: true, errors: [], rid: ins.rows[0].id, preview: {
          event: rowEv.name, rider, horse, class: cls, place, points: 0,
          series_key: seriesKey || null, series_suggested: seriesSuggested || false,
          new_horse: newHorse, new_rider: newRider, new_class: newClass,
        }});
      }
      // Recalculate each touched class once (replaces the disabled per-row
      // trigger), then patch honest points into the previews. All still
      // inside the transaction, so dry_run ROLLBACK discards everything.
      for (const cid of touchedClasses) {
        await client.query('SELECT esnz_recalc_class($1)', [cid]);
      }
      if (touchedClasses.size) {
        const ids = out.filter((x) => x.ok && x.rid).map((x) => x.rid);
        if (ids.length) {
          const pts = await client.query('SELECT id, points FROM round_results WHERE id = ANY($1)', [ids]);
          const byId = Object.fromEntries(pts.rows.map((r) => [r.id, r.points]));
          for (const x of out) {
            if (x.ok && x.rid) {
              x.preview.points = byId[x.rid] ?? 0;
              delete x.rid;
            }
          }
        }
      }
      // event-level enrichment from row columns (fill-if-null, first non-empty wins;
      // 'Unknown' venue counts as blank — it is the auto-created placeholder)
      for (const [eid, fill] of Object.entries(evFills)) {
        if (!Object.keys(fill).length) continue;
        const evChanged = await fillIfNull(client, 'events', eid, fill);
        fills.push(...evChanged);
        if (evChanged.length) enriched++;
        const evNow = (await client.query('SELECT venue, venue_id, region FROM events WHERE id = $1', [eid])).rows[0];
        if (evNow && !evNow.venue_id && evNow.venue) {
          const vid = await ensureVenue(evNow.venue, evNow.region);
          if (vid) fills.push(...await fillIfNull(client, 'events', eid, { venue_id: vid }));
        }
      }
      const evList = Object.entries(perEvent).map(([id, v]) => ({ id, ...v }));
      // Series gate (anti-Sophia): series-like classes without a key block
      // the commit unless explicitly acknowledged or previously judged
      // non-series. Judged names live in series_verdicts (exact match).
      const { loadVerdicts, normClass } = require('../lib/seriesVerify');
      const verdicts = await loadVerdicts();
      const blocking = [...seriesVerify.entries()]
        .filter(([name]) => !verdicts.has(normClass(name)))
        .map(([name, rows]) => ({ name, rows }));
      const summary = {
        total: grid.length - 1, ok: okCount, failed: out.filter((x) => !x.ok).length,
        enriched, events: evList, series_tagged: seriesTagged, series_memory: seriesMemory,
        series_verify: [...seriesVerify.entries()].map(([name, rows]) => ({ name, rows })),
        series_blocking: blocking,
        height_inferred: heightInferred, height_missing: [...heightMissing],
      };
      if (dry_run) {
        await client.query('ROLLBACK');
        // "similar to an existing horse/rider" hints for new names (pool, after rollback)
        const newOf = (flag, field) => out.filter((x) => x.ok && x.preview?.[flag]).map((x) => normName(x.preview[field]));
        const [simHorse, simRider] = await Promise.all([
          similarNames(pool, 'horses', newOf('new_horse', 'horse')),
          similarNames(pool, 'riders', newOf('new_rider', 'rider')),
        ]);
        for (const x of out) {
          if (!x.ok) continue;
          if (x.preview.new_horse && simHorse.has(normName(x.preview.horse))) x.preview.similar_horse = simHorse.get(normName(x.preview.horse));
          if (x.preview.new_rider && simRider.has(normName(x.preview.rider))) x.preview.similar_rider = simRider.get(normName(x.preview.rider));
        }
        return res.json({ data: { dry_run: true, rows: out, summary } });
      }
      if (blocking.length && !req.body.series_ack) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `${blocking.length} classe(s) look like series classes but have no series tag — tag them or confirm they are not series`,
          verify: blocking,
        });
      }
      const seriesAck = !!req.body.series_ack, namesAck = !!req.body.names_ack;
      await closeBatch(client, batchId, {
        ok: okCount, failed: summary.failed, seriesAck, namesAck, created, fills,
      });
      for (const ev of evList) {
        await client.query(
          'INSERT INTO import_logs (actor, source, filename, event_id, rows_total, rows_ok, rows_failed) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [(req.authUser && req.authUser.name) || 'admin', src, filename || null, ev.id, ev.ok + ev.failed, ev.ok, ev.failed]);
        audit(req, 'import.commit', 'event', ev.id, { ...summary, filename, event: ev.name, batch_id: batchId, series_ack: seriesAck, names_ack: namesAck });
      }
      await client.query('COMMIT');
      captureSnapshots();
      bustCache('/events');
      res.status(201).json({ data: { dry_run: false, rows: out, summary, batch_id: batchId } });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      throw e;
    } finally {
      client.release();
    }
  }));

  // ---- Series Review (verify workflow): untagged classes, verdicts,
  // height specs, official-board diff. Nothing here scores — tagging and
  // height fills recalc automatically via class triggers.
  app.get('/admin/series/untagged', needRole('ADMIN'), asyncH(async (req, res) => {
    const { listUntaggedClasses, loadVerdicts } = require('../lib/seriesVerify');
    const rows = await listUntaggedClasses({ limit: Math.min(parseInt(req.query.limit, 10) || 200, 500) });
    const verdicts = await loadVerdicts();
    res.json({ data: rows, verdicts: verdicts.size });
  }));

  app.post('/admin/series/verdicts', needRole('ADMIN'), asyncH(async (req, res) => {
    const { tagClasses, recordVerdicts, normClass } = require('../lib/seriesVerify');
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const toTag = items.filter((it) => it.series_key && it.series_key !== 'non_series');
    const toJudge = items.filter((it) => it.series_key === 'non_series').map((it) => it.name || it.class_name);
    const { tagged } = await tagClasses(toTag.map((it) => ({
      class_id: it.class_id || null, name: it.name || it.class_name, series_key: it.series_key,
    })));
    const judged = await recordVerdicts(toJudge, req.authUser?.id, req.body?.note || null);
    for (const it of toTag) audit(req, 'series.tag', 'class', it.class_id || it.name, { series_key: it.series_key });
    if (toJudge.length) audit(req, 'series.judge', 'series', 'non_series', { names: toJudge });
    bustCache('/events');
    res.json({ data: { tagged, judged } });
  }));

  app.get('/admin/series/heights', needRole('ADMIN'), asyncH(async (req, res) => {
    const { listHeightSpecs } = require('../lib/seriesVerify');
    res.json({ data: await listHeightSpecs() });
  }));

  app.post('/admin/series/heights', needRole('ADMIN'), asyncH(async (req, res) => {
    const { upsertHeightSpec } = require('../lib/seriesVerify');
    const row = await upsertHeightSpec(req.body || {});
    audit(req, 'series.height', 'series', row.series_key, { cm: row.default_height_cm });
    res.status(201).json({ data: row });
  }));

  app.delete('/admin/series/heights/:key', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query('DELETE FROM series_height_specs WHERE series_key = $1 RETURNING series_key', [req.params.key]);
    if (!rows.length) return res.status(404).json({ error: 'spec not found' });
    audit(req, 'series.height.delete', 'series', req.params.key, {});
    res.json({ ok: true });
  }));

  app.post('/admin/series/heights/apply', needRole('ADMIN'), asyncH(async (req, res) => {
    const { applyHeightSpecs } = require('../lib/seriesVerify');
    const out = await applyHeightSpecs();
    audit(req, 'series.height.apply', 'series', 'all', out.bySeries);
    bustCache('/events');
    res.json({ data: out });
  }));

  app.post('/admin/series/check', needRole('ADMIN'), asyncH(async (req, res) => {
    const { fetchOfficialBoard, parseOfficialText, diffSeriesBoard } = require('../lib/seriesVerify');
    const { series_key, official_url, official_text } = req.body || {};
    if (!series_key) return res.status(400).json({ error: 'need {series_key} + {official_url} or {official_text}' });
    const official = official_url ? await fetchOfficialBoard(official_url) : parseOfficialText(official_text);
    res.json({ data: { ...(await diffSeriesBoard(series_key, official)), officialEvents: official.events || [] } });
  }));

  app.get('/admin/overview', needRole('ADMIN'), asyncH(async (req, res) => {
    const q = async (sql, args = []) => (await pool.query(sql, args)).rows[0];
    const horses = await q('SELECT COUNT(*)::INT AS n FROM horses');
    const riders = await q('SELECT COUNT(*)::INT AS n FROM riders');
    const events = await q('SELECT COUNT(*)::INT AS n FROM events');
    const rounds = await q('SELECT COUNT(*)::INT AS n FROM round_results');
    const pendingReview = await q("SELECT COUNT(*)::INT AS n FROM review_queue WHERE status='pending'");
    const pendingClaims = await q("SELECT COUNT(*)::INT AS n FROM rider_claims WHERE status='pending'");
    const openCorrections = await q("SELECT COUNT(*)::INT AS n FROM correction_reports WHERE status='open'");
    const { listUntaggedClasses } = require('../lib/seriesVerify');
    const untaggedClasses = (await listUntaggedClasses({ limit: 500 })).length;
    const users = await q('SELECT COUNT(*)::INT AS n FROM users');
    const lastImport = await q('SELECT created_at, rows_ok, rows_failed FROM import_logs ORDER BY created_at DESC LIMIT 1');
    const recent = (await pool.query(
      'SELECT action, actor, entity_type, created_at FROM entity_audit ORDER BY created_at DESC LIMIT 8')).rows;
    res.json({ data: {
      counts: { horses: horses.n, riders: riders.n, events: events.n, rounds: rounds.n,
                pendingReview: pendingReview.n, pendingClaims: pendingClaims.n,
                openCorrections: openCorrections.n, untaggedClasses, users: users.n },
      lastImport: lastImport || null, recent,
    }});
  }));

  app.get('/admin/lookup', needRole('ADMIN'), asyncH(async (req, res) => {
    const t = req.query.type, q = `%${String(req.query.q || '').trim()}%`;
    if (!['horse', 'rider', 'event', 'class'].includes(t) || String(req.query.q || '').trim().length < 2) {
      return res.json({ data: [] });
    }
    const map = {
      horse: 'SELECT id, name FROM horses WHERE name ILIKE $1 ORDER BY name LIMIT 8',
      rider: 'SELECT id, name FROM riders WHERE name ILIKE $1 ORDER BY name LIMIT 8',
      event: 'SELECT id, name FROM events WHERE name ILIKE $1 ORDER BY date_start DESC LIMIT 8',
      class: 'SELECT c.id, c.name, c.class_date FROM classes c WHERE c.name ILIKE $1 ORDER BY c.class_date DESC NULLS LAST LIMIT 8',
    };
    const { rows } = await pool.query(map[t], [q]);
    res.json({ data: rows });
  }));

  app.get('/admin/event-classes', needRole('ADMIN'), asyncH(async (req, res) => {
    if (!req.query.event_id) return res.status(400).json({ error: 'need ?event_id=' });
    const { rows } = await pool.query(
      'SELECT id, name, class_date, height_cm, class_type, is_active FROM classes WHERE event_id = $1 ORDER BY class_date, name',
      [req.query.event_id]);
    res.json({ data: rows });
  }));

  // ---- Class visibility admin: per-class switch + per-category kill list ----
  app.get('/admin/classes', needRole('ADMIN'), asyncH(async (req, res) => {
    const { limit } = paging(req, 50, 200);
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.class_date, c.height_cm, c.class_type, c.is_active, c.rider_category, c.is_world_cup,
         e.name AS event_name, e.season,
         (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.class_id = c.id) AS round_count
       FROM classes c JOIN events e ON e.id = c.event_id
       ${q.length >= 2 ? 'WHERE c.name ILIKE $1 OR e.name ILIKE $1' : ''}
       ORDER BY c.class_date DESC NULLS LAST, c.name LIMIT $${q.length >= 2 ? 2 : 1}`,
      q.length >= 2 ? [like, limit] : [limit]
    );
    res.json({ data: rows });
  }));

  const CLASS_FIELDS = ['class_type', 'height_cm', 'is_active', 'rider_category', 'is_world_cup'];

  app.get('/admin/visibility', needRole('ADMIN'), asyncH(async (req, res) => {
    const excluded = await excludedClassTypes();
    const { rows: byType } = await pool.query(
      `SELECT c.class_type, COUNT(DISTINCT c.id)::INT AS classes, COUNT(rr.id)::INT AS rounds
       FROM classes c LEFT JOIN round_results rr ON rr.class_id = c.id
       GROUP BY c.class_type ORDER BY 2 DESC`);
    const inactive = (await pool.query(
      'SELECT COUNT(*)::INT AS n FROM classes WHERE is_active IS FALSE')).rows[0].n;
    res.json({ data: { excluded_class_types: excluded, by_type: byType, inactive_classes: inactive } });
  }));

  app.put('/admin/visibility', needRole('ADMIN'), asyncH(async (req, res) => {
    const list = req.body?.excluded_class_types;
    if (!Array.isArray(list) || !list.every((t) => CLASS_TYPES.includes(t))) {
      return res.status(400).json({ error: `excluded_class_types must be an array of ${CLASS_TYPES.join('|')}` });
    }
    await pool.query(
      `INSERT INTO admin_settings (key, value, updated_at) VALUES ('excluded_class_types', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(list)]
    );
    bustVisibility(); bustPublic();
    audit(req, 'visibility.edit', 'admin_settings', 'excluded_class_types', { excluded: list });
    res.json({ data: { excluded_class_types: list } });
  }));

  app.post('/admin/results', needRole('ADMIN'), asyncH(async (req, res) => {
    const { class_id, event_id, new_class, horse_id, horse_name, rider_id, rider_name,
      placing, jump_faults, time_faults, time_seconds, status, notes } = req.body || {};
    const errs = [];
    const place = placing === null || placing === undefined || placing === '' ? null : parseInt(placing, 10);
    if (place !== null && !(place >= 1)) errs.push('placing must be a positive integer');
    const num = (v, n) => {
      if (v === null || v === undefined || v === '') return null;
      const x = Number(v);
      if (!Number.isFinite(x)) errs.push(`${n} must be numeric`);
      return x;
    };
    const jf = num(jump_faults, 'jump_faults'), tf = num(time_faults, 'time_faults'),
      ts = num(time_seconds, 'time_seconds');
    const st = ['finished', 'eliminated', 'withdrawn', 'retired', 'disqualified'].includes(status) ? status : 'finished';
    if (!class_id && !(event_id && new_class)) errs.push('need class_id or event_id + new_class');
    if (!horse_id && !horse_name) errs.push('need horse_id or horse_name');
    if (!rider_id && !rider_name) errs.push('need rider_id or rider_name');
    if (errs.length) return res.status(400).json({ error: errs.join('; ') });

    const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const idOf = async (table, id, name, label) => {
      if (id) {
        const ex = await pool.query(`SELECT id FROM ${table} WHERE id = $1`, [id]);
        if (!ex.rows.length) throw Object.assign(new Error(`${label} not found`), { status: 404 });
        return id;
      }
      const nn = norm(name);
      const ex = await pool.query(`SELECT id FROM ${table} WHERE normalized_name = $1`, [nn]);
      if (ex.rows.length) return ex.rows[0].id;
      const col = table === 'horses' ? 'name, normalized_name' : 'name, normalized_name';
      return (await pool.query(`INSERT INTO ${table} (${col}) VALUES ($1,$2) RETURNING id`, [String(name).trim(), nn])).rows[0].id;
    };
    try {
      let cid = class_id || null;
      if (!cid) {
        const ev = await pool.query('SELECT id, is_active FROM events WHERE id = $1', [event_id]);
        if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
        if (ev.rows[0].is_active === false) return res.status(400).json({ error: 'event is switched off — enable it in Admin → Events' });
        cid = (await pool.query(
          'INSERT INTO classes (event_id, name, class_date, source) VALUES ($1,$2,$3,\'MANUAL\') RETURNING id',
          [event_id, String(new_class).trim(), null])).rows[0].id;
      }
      const hid = await idOf('horses', horse_id, horse_name, 'horse');
      const rid = await idOf('riders', rider_id, rider_name, 'rider');
      const dup = await pool.query(
        'SELECT id FROM round_results WHERE class_id = $1 AND horse_id = $2 AND rider_id = $3', [cid, hid, rid]);
      if (dup.rows.length) return res.status(409).json({ error: 'duplicate of an existing round' });
      const tot = (jf ?? 0) + (tf ?? 0);
      const ev = (await pool.query(
        'SELECT c.event_id, c.is_active AS class_active, e.is_active FROM classes c JOIN events e ON e.id = c.event_id WHERE c.id = $1',
        [cid])).rows[0];
      if (ev.is_active === false) return res.status(400).json({ error: 'event is switched off — enable it in Admin → Events' });
      if (ev.class_active === false) return res.status(400).json({ error: 'class is switched off — enable it in Admin → Classes' });
      const { rows } = await pool.query(
        `INSERT INTO round_results (event_id, class_id, horse_id, rider_id, jump_faults, time_faults,
          total_faults, time_seconds, finish_place, clear_round, status, notes, source, points)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'MANUAL',0) RETURNING id, points`,
        [ev.event_id, cid, hid, rid, jf ?? 0, tf ?? 0, tot, ts, place,
         st === 'finished' && tot === 0, st, notes || null]);
      audit(req, 'result.create', 'result', rows[0].id, { class_id: cid, place });
      bustCache('/events');
      res.status(201).json({ data: rows[0] });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.status ? e.message : 'internal error' });
    }
  }));

  app.get('/admin/imports', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT l.*, e.name AS event_name FROM import_logs l
       LEFT JOIN events e ON e.id = l.event_id ORDER BY l.created_at DESC LIMIT 50`);
    res.json({ data: rows });
  }));

  // ---- Import batches (migration 117): undoable commits, newest first.
  const BATCH_LIST_MAX = 50;
  app.get('/admin/import-batches', needRole('ADMIN'), asyncH(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), BATCH_LIST_MAX);
    const { rows } = await pool.query(
      `SELECT b.id, b.actor_name, b.source, b.filename, b.status, b.rows_ok, b.rows_failed, b.chunks,
              b.series_ack, b.names_ack, b.created_at, b.undone_at, b.undo_summary,
              (SELECT COUNT(*)::INT FROM round_results r WHERE r.import_batch_id = b.id) AS results_now,
              (SELECT string_agg(DISTINCT e.name, ', ') FROM round_results r JOIN events e ON e.id = r.event_id
                WHERE r.import_batch_id = b.id) AS event_names
         FROM import_batches b ORDER BY b.created_at DESC LIMIT $1`, [limit]);
    res.json({ data: rows });
  }));

  // Undo one import batch. dry_run (default) runs the whole undo and rolls
  // back, so the preview is exactly what Confirm will do.
  app.post('/admin/imports/:id/undo', needRole('ADMIN'), asyncH(async (req, res) => {
    if (!isBatchId(req.params.id)) return res.status(404).json({ error: 'import batch not found' });
    const dryRun = req.body?.dry_run !== false;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const summary = await undoBatch(client, req.params.id, { actorId: req.authUser?.id });
      if (dryRun || summary.already_undone) {
        await client.query('ROLLBACK');
        return res.json({ data: { dry_run: dryRun, ...summary } });
      }
      await client.query('COMMIT');
      audit(req, 'import.undo', 'import_batch', req.params.id, summary);
      captureSnapshots();
      bustCache('/events');
      bustPublic();
      res.json({ data: { dry_run: false, ...summary } });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      if (e instanceof UndoError) return res.status(e.status).json({ error: e.message, ...(e.extra || {}) });
      throw e;
    } finally {
      client.release();
    }
  }));


  // ---- Admin manage: search lists (including zero-start records) ----
  app.get('/admin/horses', needRole('PHOTOGRAPHER'), asyncH(async (req, res) => {
    const q = `%${String(req.query.q || '').trim()}%`;
    const { rows } = await pool.query(
      `SELECT h.*, (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.horse_id = h.id) AS starts
       FROM horses h ${req.query.q ? 'WHERE h.name ILIKE $1' : ''}
       ORDER BY h.name LIMIT ${req.query.q ? '50' : '200'}`,
      req.query.q ? [q] : []);
    res.json({ data: rows });
  }));

  app.get('/admin/riders', needRole('PHOTOGRAPHER'), asyncH(async (req, res) => {
    const q = `%${String(req.query.q || '').trim()}%`;
    const { rows } = await pool.query(
      `SELECT r.*, (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.rider_id = r.id) AS starts
       FROM riders r ${req.query.q ? 'WHERE r.name ILIKE $1' : ''}
       ORDER BY r.name LIMIT ${req.query.q ? '50' : '200'}`,
      req.query.q ? [q] : []);
    res.json({ data: rows });
  }));

  app.get('/admin/events', needRole('PHOTOGRAPHER'), asyncH(async (req, res) => {
    const q = `%${String(req.query.q || '').trim()}%`;
    const { rows } = await pool.query(
      `SELECT e.*, o.id AS organizer_id, o.name AS organizer_name,
        (SELECT COUNT(*)::INT FROM classes c WHERE c.event_id = e.id) AS class_count,
        (SELECT COUNT(*)::INT FROM round_results rr WHERE rr.event_id = e.id) AS round_count
       FROM events e LEFT JOIN organizers o ON o.id = e.organizer_id ${req.query.q ? 'WHERE e.name ILIKE $1' : ''}
       ORDER BY e.date_start DESC LIMIT ${req.query.q ? '50' : '200'}`,
      req.query.q ? [q] : []);
    res.json({ data: rows });
  }));

  const normFn = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const HORSE_FIELDS = ['name', 'breed', 'gender', 'sire', 'dam', 'damsire', 'breeder', 'year_of_birth', 'color', 'height', 'country', 'image_url', 'visibility', 'photo_hidden'];
  const RIDER_FIELDS = ['name', 'region', 'series_category', 'nationality', 'bio', 'image_url', 'first_name', 'last_name', 'visibility', 'photo_hidden'];
  const EVENT_FIELDS = ['name', 'venue', 'region', 'date_start', 'date_end', 'arena_type', 'event_type', 'status', 'description', 'image_url', 'is_active', 'tier', 'event_kind', 'prebook_open', 'upload_code'];

  function patcher(table, fields, label) {
    return asyncH(async (req, res) => {
      const body = req.body || {};
      const sets = [], vals = [];
      for (const f of fields) {
        if (body[f] !== undefined) {
          let v = body[f] === '' ? null : body[f];
          if (f === 'visibility') {
            if (!['public', 'anonymous'].includes(v)) {
              return res.status(400).json({ error: "visibility must be 'public' or 'anonymous'" });
            }
            if (!(await privacy.privacyEnabled(pool))) {
              return res.status(503).json({ error: 'privacy controls not yet enabled (migration 033 pending)' });
            }
          }
          if (f === 'year_of_birth' && v !== null) {
            v = parseInt(v, 10);
            if (!(v >= 1980 && v <= 2100)) return res.status(400).json({ error: 'year_of_birth out of range' });
          }
          if ((f === 'series_category' || f === 'rider_category') && v !== null) {
            const key = canonCategoryKey(v, await masterCategoryKeys(pool));
            if (!key) return res.status(400).json({ error: `${f} must be a master category key (see Admin → Categories)` });
            v = key;
          }
          if ((f === 'date_start' || f === 'date_end') && v !== null) {
            // Accept full ISO datetimes (what the edit form round-trips)
            // by truncating to the date part; reject anything else.
            const m = typeof v === 'string' && /^(\d{4}-\d{2}-\d{2})/.exec(v);
            if (!m) return res.status(400).json({ error: `${f} must be YYYY-MM-DD` });
            v = m[1];
          }
          if (f === 'upload_code' && v !== null) {
            // QR/email upload code: short, uppercase, always carries a digit
            // so it routes on both community doors.
            v = String(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
            if (v && !/^(?=.*[0-9])[A-Z0-9]{4,12}$/.test(v)) {
              return res.status(400).json({ error: 'upload_code must be 4–12 letters/digits with at least one digit' });
            }
          }
          vals.push(v); sets.push(`${f} = $${vals.length}`);
        }
      }
      if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
      // Only horses/riders carry normalized_name — events/classes don't.
      if (body.name !== undefined && (table === 'horses' || table === 'riders')) {
        vals.push(normFn(body.name)); sets.push(`normalized_name = $${vals.length}`);
      }
      vals.push(req.params.id);
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
      if (!rows.length) return res.status(404).json({ error: `${label} not found` });
      audit(req, `${label}.edit`, table, req.params.id, { fields: Object.keys(body) });
      if (table === 'riders' || table === 'horses') privacy.bustPrivacyCache();
      if (table === 'events') bustCache('/events');
      if (table === 'classes') { bustVisibility(); bustPublic(); }
      res.json({ data: rows[0] });
    });
  }

  app.patch('/admin/horses/:id', needRole('ADMIN'), patcher('horses', HORSE_FIELDS, 'horse'));
  app.patch('/admin/riders/:id', needRole('ADMIN'), patcher('riders', RIDER_FIELDS, 'rider'));
  app.patch('/admin/events/:id', needRole('ADMIN'), patcher('events', EVENT_FIELDS, 'event'));

  const ADMIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const adminSlug = (name, date) => String(name || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) + `-${String(date || '').slice(0, 10)}`;
  // Boss Media studio: create an event for the pre-book listing (or anything
  // else). Same anti-clone guard as organizer creation.
  app.post('/admin/events', needRole('ADMIN'), asyncH(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 160);
    const venue = String(b.venue || '').trim().slice(0, 160);
    const ds = String(b.date_start || ''), de = String(b.date_end || b.date_start || '');
    if (!name) return res.status(400).json({ error: 'need {name}' });
    if (!ADMIN_DATE_RE.test(ds) || !ADMIN_DATE_RE.test(de)) {
      return res.status(400).json({ error: 'need {date_start, date_end} as YYYY-MM-DD' });
    }
    if (de < ds) return res.status(400).json({ error: 'date_end is before date_start' });
    const dupe = await pool.query(
      'SELECT id, name FROM events WHERE lower(name) = lower($1) AND date_start = $2 LIMIT 1',
      [name, ds]);
    if (dupe.rows.length) {
      return res.status(409).json({ error: 'this event already exists — edit it instead', event_id: dupe.rows[0].id });
    }
    const y = Number(ds.slice(0, 4)), m = Number(ds.slice(5, 7));
    const season = m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
    let slug = adminSlug(name, ds);
    const taken = await pool.query('SELECT 1 FROM events WHERE slug = $1', [slug]);
    if (taken.rows.length) slug += `-${Math.random().toString(36).slice(2, 6)}`;
    const { rows } = await pool.query(
      `INSERT INTO events (name, venue, region, date_start, date_end, season, arena_type, slug, source)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'MANUAL') RETURNING *`,
      [name, venue || 'TBC', String(b.region || '').trim() || null, ds, de, season,
        String(b.arena_type || '').trim() || null, slug]);
    audit(req, 'event.create', 'event', rows[0].id, { name });
    bustCache('/events');
    res.status(201).json({ data: rows[0] });
  }));
  app.patch('/admin/classes/:id', needRole('ADMIN'), patcher('classes', CLASS_FIELDS, 'class'));

  app.delete('/admin/horses/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const n = (await pool.query('SELECT COUNT(*)::INT AS n FROM round_results WHERE horse_id = $1', [req.params.id])).rows[0].n;
    if (n > 0) return res.status(409).json({ error: `horse has ${n} rounds — delete results first` });
    const { rowCount } = await pool.query('DELETE FROM horses WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'horse not found' });
    audit(req, 'horse.delete', 'horses', req.params.id, {});
    res.json({ ok: true });
  }));

  // ---- Merge duplicate horses (migration 113). merge_horse() does all the
  // re-pointing in one transaction and stores an exact undo record. A
  // preview runs the same function and rolls back, so its numbers are real.
  const MERGE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const humanMergeError = (e) => (e && e.code === 'P0001' ? e.message : null);

  app.get('/admin/horses/duplicates', needRole('ADMIN'), asyncH(async (req, res) => {
    // Same name ignoring case, spaces and punctuation, or differing only by a
    // trailing stud/country suffix (NZ, GNZ, MVNZ...). Candidates only: an
    // admin decides.
    const { rows } = await pool.query(`
      WITH h AS (
        SELECT h.id, h.name, h.slug, h.year_of_birth, h.sire, h.dam,
          regexp_replace(regexp_replace(lower(h.name), '\\s+(nz|gnz|msnz|mvnz|nzph|z|aus)$', ''), '[^a-z0-9]', '', 'g') AS k,
          (SELECT COUNT(*) FROM round_results r WHERE r.horse_id = h.id)::INT AS rounds
        FROM horses h)
      SELECT k, json_agg(json_build_object('id', id, 'name', name, 'slug', slug, 'yob', year_of_birth,
        'sire', sire, 'dam', dam, 'rounds', rounds) ORDER BY rounds DESC, name) AS horses
      FROM h WHERE k <> '' GROUP BY k HAVING COUNT(*) > 1 ORDER BY k LIMIT 200`);
    // Hide groups where an admin marked every pair as different horses.
    let marked = new Set();
    try {
      const nd = await pool.query('SELECT a_id, b_id FROM horse_not_duplicates');
      marked = new Set(nd.rows.map((r) => `${r.a_id}|${r.b_id}`));
    } catch (e) {
      if (e.code !== '42P01') throw e; // migration 115 not applied yet
    }
    const pairKey = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);
    const open = rows.map((r) => r.horses).filter((g) =>
      g.some((a, i) => g.slice(i + 1).some((b) => !marked.has(pairKey(a.id, b.id)))));
    res.json({ data: open });
  }));

  // "Not a duplicate": remember that these horses are different, so the
  // finder stops suggesting them. Reversible via /restore.
  const notDupPairs = (ids) => {
    const u = [...new Set(ids)].sort();
    const out = [];
    u.forEach((a, i) => u.slice(i + 1).forEach((b) => out.push([a, b])));
    return out;
  };
  app.get('/admin/horses/not-duplicates', needRole('ADMIN'), asyncH(async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT n.a_id, n.b_id, a.name AS a_name, a.slug AS a_slug, b.name AS b_name, b.slug AS b_slug,
          n.created_at, u.name AS marked_by
        FROM horse_not_duplicates n JOIN horses a ON a.id = n.a_id JOIN horses b ON b.id = n.b_id
        LEFT JOIN users u ON u.id = n.marked_by ORDER BY n.created_at DESC LIMIT 200`);
      res.json({ data: rows });
    } catch (e) {
      if (e.code === '42P01') return res.json({ data: [] });
      throw e;
    }
  }));
  app.post('/admin/horses/not-duplicates', needRole('ADMIN'), asyncH(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (ids.length < 2 || ids.length > 10 || !ids.every((id) => MERGE_UUID.test(id))) {
      return res.status(400).json({ error: 'need {ids: [2-10 horse ids]}' });
    }
    const pairs = notDupPairs(ids);
    for (const [a, b] of pairs) {
      await pool.query(`INSERT INTO horse_not_duplicates (a_id, b_id, marked_by) VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING`, [a, b, req.authUser?.id || null]);
    }
    audit(req, 'horse.not_duplicate', 'horses', ids[0], { ids });
    res.json({ data: { pairs: pairs.length } });
  }));
  app.post('/admin/horses/not-duplicates/restore', needRole('ADMIN'), asyncH(async (req, res) => {
    const { a_id, b_id } = req.body || {};
    if (!MERGE_UUID.test(String(a_id)) || !MERGE_UUID.test(String(b_id))) {
      return res.status(400).json({ error: 'need {a_id, b_id}' });
    }
    const [a, b] = [String(a_id), String(b_id)].sort();
    await pool.query('DELETE FROM horse_not_duplicates WHERE a_id = $1 AND b_id = $2', [a, b]);
    audit(req, 'horse.not_duplicate_undo', 'horses', a, { a_id: a, b_id: b });
    res.json({ data: { ok: true } });
  }));

  app.post('/admin/horses/merge', needRole('ADMIN'), asyncH(async (req, res) => {
    const { from_id, into_id } = req.body || {};
    const dryRun = req.body?.dry_run !== false;
    if (!MERGE_UUID.test(String(from_id)) || !MERGE_UUID.test(String(into_id))) {
      return res.status(400).json({ error: 'need {from_id, into_id} horse ids' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const names = (await client.query('SELECT id, name FROM horses WHERE id = ANY($1::uuid[])', [[from_id, into_id]])).rows;
      const out = (await client.query('SELECT merge_horse($1, $2, $3) AS r', [from_id, into_id, req.authUser?.id || null])).rows[0].r;
      if (dryRun) {
        await client.query('ROLLBACK');
        return res.json({ data: { ...out, merge_id: null, dry_run: true, names } });
      }
      await client.query('COMMIT');
      audit(req, 'horse.merge', 'horses', into_id, { from_id, merge_id: out.merge_id, moved: out.moved });
      bustCache('/horses'); bustCache('/rankings'); bustPublic();
      res.json({ data: { ...out, dry_run: false, names } });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      const msg = humanMergeError(e);
      if (msg) return res.status(409).json({ error: msg });
      throw e;
    } finally {
      client.release();
    }
  }));

  app.get('/admin/horses/merges', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT m.id, m.from_id, m.into_id, m.from_row->>'name' AS from_name, h.name AS into_name, h.slug AS into_slug,
        jsonb_array_length(COALESCE(m.moved->'round_results', '[]')) AS rounds_moved,
        m.created_at, m.undone_at, u.name AS merged_by
      FROM horse_merges m LEFT JOIN horses h ON h.id = m.into_id LEFT JOIN users u ON u.id = m.merged_by
      ORDER BY m.created_at DESC LIMIT 100`);
    res.json({ data: rows });
  }));

  app.post('/admin/horses/merges/:id/undo', needRole('ADMIN'), asyncH(async (req, res) => {
    if (!MERGE_UUID.test(String(req.params.id))) return res.status(400).json({ error: 'bad merge id' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = (await client.query('SELECT unmerge_horse($1, $2) AS r', [req.params.id, req.authUser?.id || null])).rows[0].r;
      await client.query('COMMIT');
      audit(req, 'horse.unmerge', 'horses', out.restored, { merge_id: req.params.id });
      bustCache('/horses'); bustCache('/rankings'); bustPublic();
      res.json({ data: out });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      const msg = humanMergeError(e);
      if (msg) return res.status(409).json({ error: msg });
      throw e;
    } finally {
      client.release();
    }
  }));

  app.delete('/admin/riders/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const n = (await pool.query('SELECT COUNT(*)::INT AS n FROM round_results WHERE rider_id = $1', [req.params.id])).rows[0].n;
    if (n > 0) return res.status(409).json({ error: `rider has ${n} rounds — delete results first` });
    const { rowCount } = await pool.query('DELETE FROM riders WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'rider not found' });
    audit(req, 'rider.delete', 'riders', req.params.id, {});
    res.json({ ok: true });
  }));

  app.delete('/admin/events/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const c = await pool.query(
      'SELECT (SELECT COUNT(*)::INT FROM classes WHERE event_id = $1) AS classes, (SELECT COUNT(*)::INT FROM round_results WHERE event_id = $1) AS rounds',
      [req.params.id]);
    const { rowCount } = await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'event not found' });
    audit(req, 'event.delete', 'events', req.params.id, { cascade: c.rows[0] });
    res.json({ ok: true, cascade: c.rows[0] });
  }));

  app.get('/admin/corrections', needRole('ADMIN'), asyncH(async (req, res) => {
    const status = req.query.status || 'open';
    if (!['open', 'in_review', 'resolved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'bad status' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM correction_reports WHERE status = $1 ORDER BY created_at DESC LIMIT 100', [status]);
    res.json({ data: rows });
  }));

  app.post('/admin/corrections/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const { status, resolved_note } = req.body || {};
    if (!['in_review', 'resolved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be in_review|resolved|rejected' });
    }
    const { rows } = await pool.query(
      'UPDATE correction_reports SET status = $2, resolved_note = $3 WHERE id = $1 RETURNING *',
      [req.params.id, status, resolved_note || null]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    audit(req, 'correction.resolve', 'correction', req.params.id, { status });
    res.json({ data: rows[0] });
  }));

  // ---- Users management ----
  app.get('/admin/users', needRole('ADMIN'), asyncH(async (req, res) => {
    const q = `%${String(req.query.q || '').trim()}%`;
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.email_verified_at, u.created_at,
         (SELECT COUNT(*)::INT FROM sessions s WHERE s.user_id = u.id AND s.expires_at > NOW()) AS active_sessions
       FROM users u ${req.query.q ? 'WHERE u.name ILIKE $1 OR u.email ILIKE $1' : ''}
       ORDER BY u.created_at DESC LIMIT 100`,
      req.query.q ? [q] : []);
    res.json({ data: rows });
  }));

  app.patch('/admin/users/:id', needRole('ADMIN'), asyncH(async (req, res) => {
    const { role } = req.body || {};
    if (!['PUBLIC', 'RIDER', 'COACH', 'OWNER', 'BREEDER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'bad role' });
    }
    if (req.params.id === req.authUser.id && role !== 'ADMIN') {
      return res.status(400).json({ error: 'cannot demote yourself' });
    }
    const { rows } = await pool.query('UPDATE users SET role = $2 WHERE id = $1 RETURNING id, name, email, role', [req.params.id, role]);
    if (!rows.length) return res.status(404).json({ error: 'user not found' });
    audit(req, 'user.role', 'user', req.params.id, { role });
    res.json({ data: rows[0] });
  }));

  app.delete('/admin/users/:id/sessions', needRole('ADMIN'), asyncH(async (req, res) => {
    if (req.params.id === req.authUser.id) {
      return res.status(400).json({ error: 'cannot revoke your own sessions here — use logout' });
    }
    const { rowCount } = await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
    audit(req, 'user.revoke_sessions', 'user', req.params.id, { count: rowCount });
    res.json({ ok: true, revoked: rowCount });
  }));

  // ---- Photographer approval: turn an application (corrections queue,
  // entity_type 'other') into a photographer row + PHOTOGRAPHER role.
  // Registration never grants this role (auth allowlist), so this is the
  // only path. One active photographer per user; ADMINs keep their role.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  app.post('/admin/photographers/approve', needRole('ADMIN'), asyncH(async (req, res) => {
    const { correction_id } = req.body || {};
    if (!UUID_RE.test(String(correction_id))) return res.status(400).json({ error: 'need {correction_id}' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const corr = await client.query('SELECT * FROM correction_reports WHERE id = $1', [String(correction_id)]);
      if (!corr.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'application not found' }); }
      const c = corr.rows[0];
      if (!['open', 'in_review'].includes(c.status)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'application already decided' }); }
      const u = await client.query('SELECT id, name, email, role FROM users WHERE lower(email) = lower($1)', [c.email]);
      if (!u.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'applicant has no account yet — ask them to register first' }); }
      const user = u.rows[0];
      const existing = await client.query(
        'SELECT id, is_active FROM photographers WHERE user_id = $1 ORDER BY is_active DESC LIMIT 1', [user.id]);
      let photographer;
      if (existing.rows.length && existing.rows[0].is_active) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'user is already an active photographer' });
      } else if (existing.rows.length) {
        photographer = (await client.query(
          'UPDATE photographers SET is_active = true, name = $2, contact_email = $3 WHERE id = $1 RETURNING id, name, contact_email, is_active',
          [existing.rows[0].id, c.name || user.name, c.email])).rows[0];
      } else {
        photographer = (await client.query(
          `INSERT INTO photographers (user_id, name, contact_email, commission_rate, is_active)
           VALUES ($1, $2, $3, 0, true) RETURNING id, name, contact_email, is_active`,
          [user.id, c.name || user.name, c.email])).rows[0];
      }
      let role = user.role;
      if (role !== 'ADMIN') {
        role = (await client.query(
          `UPDATE users SET role = 'PHOTOGRAPHER' WHERE id = $1 RETURNING role`, [user.id])).rows[0].role;
      }
      await client.query(
        `UPDATE correction_reports SET status = 'resolved',
           resolved_note = COALESCE(resolved_note || E'\n', '') || $2 WHERE id = $1`,
        [c.id, `Approved as photographer by ${req.authUser.email || req.authUser.id}`]);
      await client.query('COMMIT');
      audit(req, 'photographer.approve', 'photographer', photographer.id, { user_id: user.id });
      res.status(201).json({ data: { photographer, user: { id: user.id, name: user.name, email: user.email, role } } });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }));

  // ---- Organizer approval: same pattern as photographers — application
  // (corrections entity_type 'organizer') becomes an organizers row +
  // ORGANIZER role. Registration never grants this role.
  app.post('/admin/organizers/approve', needRole('ADMIN'), asyncH(async (req, res) => {
    const { correction_id } = req.body || {};
    if (!UUID_RE.test(String(correction_id))) return res.status(400).json({ error: 'need {correction_id}' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const corr = await client.query('SELECT * FROM correction_reports WHERE id = $1', [String(correction_id)]);
      if (!corr.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'application not found' }); }
      const c = corr.rows[0];
      if (!['open', 'in_review'].includes(c.status)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'application already decided' }); }
      const u = await client.query('SELECT id, name, email, role FROM users WHERE lower(email) = lower($1)', [c.email]);
      if (!u.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'applicant has no account yet — ask them to register first' }); }
      const user = u.rows[0];
      const existing = await client.query(
        'SELECT id, is_active FROM organizers WHERE user_id = $1 ORDER BY is_active DESC LIMIT 1', [user.id]);
      let organizer;
      if (existing.rows.length && existing.rows[0].is_active) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'user is already an active organizer' });
      } else if (existing.rows.length) {
        organizer = (await client.query(
          'UPDATE organizers SET is_active = true, name = $2, contact_email = $3 WHERE id = $1 RETURNING id, name, contact_email, is_active',
          [existing.rows[0].id, c.name || user.name, c.email])).rows[0];
      } else {
        organizer = (await client.query(
          `INSERT INTO organizers (user_id, name, contact_email, is_active)
           VALUES ($1, $2, $3, true) RETURNING id, name, contact_email, is_active`,
          [user.id, c.name || user.name, c.email])).rows[0];
      }
      let role = user.role;
      if (role !== 'ADMIN') {
        role = (await client.query(
          `UPDATE users SET role = 'ORGANIZER' WHERE id = $1 RETURNING role`, [user.id])).rows[0].role;
      }
      await client.query(
        `UPDATE correction_reports SET status = 'resolved',
           resolved_note = COALESCE(resolved_note || E'\n', '') || $2 WHERE id = $1`,
        [c.id, `Approved as organizer by ${req.authUser.email || req.authUser.id}`]);
      await client.query('COMMIT');
      audit(req, 'organizer.approve', 'organizer', organizer.id, { user_id: user.id });
      res.status(201).json({ data: { organizer, user: { id: user.id, name: user.name, email: user.email, role } } });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }));

  // ---- Sponsor approval: same pattern as organizers — application
  // (corrections entity_type 'sponsor') becomes a sponsors row +
  // SPONSOR role. Registration never grants this role.
  app.post('/admin/sponsors/approve', needRole('ADMIN'), asyncH(async (req, res) => {
    const { correction_id } = req.body || {};
    if (!UUID_RE.test(String(correction_id))) return res.status(400).json({ error: 'need {correction_id}' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const corr = await client.query(
        `SELECT * FROM correction_reports WHERE id = $1 AND (entity_type = 'sponsor' OR entity_type IS NULL)`,
        [String(correction_id)]);
      if (!corr.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'application not found' }); }
      const c = corr.rows[0];
      if (!['open', 'in_review'].includes(c.status)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'application already decided' }); }
      const u = await client.query('SELECT id, name, email, role FROM users WHERE lower(email) = lower($1)', [c.email]);
      if (!u.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'applicant has no account yet — ask them to register first' }); }
      const user = u.rows[0];
      const existing = await client.query(
        "SELECT id, is_active FROM sponsors WHERE user_id = $1 AND kind = 'official' ORDER BY is_active DESC LIMIT 1", [user.id]);
      let sponsor;
      if (existing.rows.length && existing.rows[0].is_active) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'user is already an active sponsor' });
      } else if (existing.rows.length) {
        sponsor = (await client.query(
          'UPDATE sponsors SET is_active = true, name = $2, contact_email = $3 WHERE id = $1 RETURNING id, name, contact_email, is_active',
          [existing.rows[0].id, c.name || user.name, c.email])).rows[0];
      } else {
        sponsor = (await client.query(
          `INSERT INTO sponsors (user_id, name, contact_email, is_active)
           VALUES ($1, $2, $3, true) RETURNING id, name, contact_email, is_active`,
          [user.id, c.name || user.name, c.email])).rows[0];
      }
      let role = user.role;
      if (role !== 'ADMIN') {
        role = (await client.query(
          `UPDATE users SET role = 'SPONSOR' WHERE id = $1 RETURNING role`, [user.id])).rows[0].role;
      }
      await client.query(
        `UPDATE correction_reports SET status = 'resolved',
           resolved_note = COALESCE(resolved_note || E'\n', '') || $2 WHERE id = $1`,
        [c.id, `Approved as sponsor by ${req.authUser.email || req.authUser.id}`]);
      await client.query('COMMIT');
      audit(req, 'sponsor.approve', 'sponsor', sponsor.id, { user_id: user.id });
      res.status(201).json({ data: { sponsor, user: { id: user.id, name: user.name, email: user.email, role } } });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }));

  // ---- Sponsors registry ----
  app.get('/admin/sponsors', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT s.*, u.email AS user_email,
        (SELECT COUNT(*)::INT FROM sponsor_budgets b WHERE b.sponsor_id = s.id) AS budgets
       FROM sponsors s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.kind = 'official'
       ORDER BY s.created_at DESC LIMIT 100`);
    res.json({ data: rows });
  }));

  // ---- Organizers registry (for the admin console link UI) ----
  app.get('/admin/organizers', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT o.*, u.email AS user_email,
        (SELECT COUNT(*)::INT FROM events e WHERE e.organizer_id = o.id) AS events
       FROM organizers o LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 100`);
    res.json({ data: rows });
  }));

  // Link an event to an organizer (claim), or unlink with {organizer_id: null}.
  // This is how an organizer gets "our" results event without cloning it.
  app.patch('/admin/events/:id/organizer', needRole('ADMIN'), asyncH(async (req, res) => {
    const { organizer_id } = req.body || {};
    if (organizer_id !== null && organizer_id !== undefined && !UUID_RE.test(String(organizer_id))) {
      return res.status(400).json({ error: 'organizer_id must be a UUID or null' });
    }
    const ev = await pool.query('SELECT id FROM events WHERE id = $1', [req.params.id]);
    if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
    if (organizer_id) {
      const org = await pool.query('SELECT id FROM organizers WHERE id = $1 AND is_active', [String(organizer_id)]);
      if (!org.rows.length) return res.status(404).json({ error: 'organizer not found or inactive' });
    }
    const { rows } = await pool.query(
      'UPDATE events SET organizer_id = $2 WHERE id = $1 RETURNING id, name, organizer_id',
      [req.params.id, organizer_id || null]);
    // Sales made before this link: pay the organizer share now if we're
    // still inside the claim window (see wallet.releaseLateOrganizerShares).
    let lateShare = null;
    if (organizer_id) {
      try {
        lateShare = await require('../lib/wallet').releaseLateOrganizerShares(pool, req.params.id);
      } catch (e) { console.error('[organizer] late share release failed:', e.message); }
    }
    audit(req, 'event.link_organizer', 'event', req.params.id, { organizer_id: organizer_id || null, late_share: lateShare });
    res.json({ data: { ...rows[0], late_share: lateShare } });
  }));

  // Mint a venue-QR upload code for any event (idempotent — an event that
  // already has one keeps it). Same minter the organizer self-serve uses.
  app.post('/admin/events/:id/upload-code', needRole('ADMIN'), asyncH(async (req, res) => {
    const { mintUploadCode } = require('./media.js');
    const ev = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!ev.rows.length) return res.status(404).json({ error: 'event not found' });
    if (ev.rows[0].upload_code) return res.json({ data: { upload_code: ev.rows[0].upload_code } });
    const code = await mintUploadCode(pool, ev.rows[0]);
    const { rows } = await pool.query(
      'UPDATE events SET upload_code = $2 WHERE id = $1 RETURNING upload_code', [req.params.id, code]);
    audit(req, 'event.upload-code', 'event', req.params.id, { upload_code: code });
    res.status(201).json({ data: { upload_code: rows[0].upload_code } });
  }));

  // ---- Seasons master (events.season FK lands here — new seasons must
  // exist before imports/classes referencing them, or writes fail) ----
  app.post('/admin/seasons', needRole('ADMIN'), asyncH(async (req, res) => {
    const { key, label, date_start, date_end, make_current } = req.body || {};
    if (!key || !/^\d{4}-\d{4}$/.test(String(key))) {
      return res.status(400).json({ error: 'key must look like 2026-2027' });
    }
    if (!date_start || !date_end) return res.status(400).json({ error: 'need {key, date_start, date_end}' });
    const { rows } = await pool.query(
      `INSERT INTO seasons (key, label, date_start, date_end, is_current)
       VALUES ($1, $2, $3, $4, COALESCE($5, FALSE))
       ON CONFLICT (key) DO UPDATE SET label = COALESCE(EXCLUDED.label, seasons.label),
         date_start = EXCLUDED.date_start, date_end = EXCLUDED.date_end,
         is_current = COALESCE(EXCLUDED.is_current, seasons.is_current)
       RETURNING *`,
      [String(key), label ? String(label).slice(0, 20) : String(key).replace('-', '/'),
        date_start, date_end, make_current === true]);
    if (make_current === true) {
      await pool.query(`UPDATE seasons SET is_current = (key = $1)`, [String(key)]);
      rows[0].is_current = true;
    }
    audit(req, 'seasons.upsert', 'seasons', String(key), { make_current: !!make_current });
    res.status(201).json({ data: rows[0] });
  }));

  // ---- Series management ----
  app.get('/admin/series', needRole('ADMIN'), asyncH(async (req, res) => {
    // Same key set as public GET /series: series_standings is often empty,
    // so tagged classes and the series_info registry must count too.
    const { rows } = await pool.query(
      `WITH keys AS (
         SELECT series_key FROM series_info
         UNION SELECT series_key FROM classes WHERE series_key IS NOT NULL
         UNION SELECT series_key FROM series_standings
       ),
       live AS (
         SELECT c.series_key, MIN(e.season) AS season,
           COUNT(DISTINCT (rr.horse_id, rr.rider_id))::INT AS entries
         FROM classes c
         LEFT JOIN round_results rr ON rr.class_id = c.id
         LEFT JOIN events e ON e.id = c.event_id
         WHERE c.series_key IS NOT NULL
         GROUP BY 1
       )
       SELECT k.series_key,
         COALESCE(i.display_name, INITCAP(REPLACE(k.series_key, '-', ' '))) AS series_name,
         l.season, COALESCE(l.entries, 0) AS entries,
         i.display_name, i.qual_rules, i.best_of,
         (i.auto_calc IS NOT FALSE) AS auto_calc,
         COALESCE(i.is_official, FALSE) AS is_official,
         i.official_source, i.description
       FROM keys k
       LEFT JOIN series_info i ON i.series_key = k.series_key
       LEFT JOIN live l ON l.series_key = k.series_key
       ORDER BY k.series_key`);
    res.json({ data: rows });
  }));

  app.patch('/admin/series/:key', needRole('ADMIN'), asyncH(async (req, res) => {
    const { display_name, description, qual_rules, is_official, official_source, best_of, auto_calc } = req.body || {};
    const bo = best_of === '' || best_of === null || best_of === undefined ? null : parseInt(best_of, 10);
    if (bo !== null && !(bo > 0)) return res.status(400).json({ error: 'best_of must be positive' });
    const { rows } = await pool.query(
      `INSERT INTO series_info (series_key, display_name, description, qual_rules, is_official, official_source, best_of, auto_calc, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (series_key) DO UPDATE SET display_name = EXCLUDED.display_name,
         description = EXCLUDED.description, qual_rules = EXCLUDED.qual_rules,
         is_official = EXCLUDED.is_official, official_source = EXCLUDED.official_source,
         best_of = EXCLUDED.best_of, auto_calc = EXCLUDED.auto_calc,
         updated_at = NOW() RETURNING *`,
      [req.params.key, display_name || null, description || null, qual_rules || null,
       !!is_official, official_source || null, bo, !!auto_calc]);
    audit(req, 'series.edit', 'series', req.params.key, { is_official: !!is_official });
    res.json({ data: rows[0] });
  }));

  app.delete('/admin/series/:key', needRole('ADMIN'), asyncH(async (req, res) => {
    const st = await pool.query('DELETE FROM series_standings WHERE series_key = $1', [req.params.key]);
    await pool.query('DELETE FROM series_info WHERE series_key = $1', [req.params.key]);
    audit(req, 'series.delete', 'series', req.params.key, { rows: st.rowCount });
    res.json({ ok: true, deleted: st.rowCount });
  }));

  // ---- Export (full backup JSON) ----
  app.get('/admin/export', needRole('ADMIN'), asyncH(async (req, res) => {
    const dump = async (t) => (await pool.query(`SELECT * FROM ${t}`)).rows;
    const data = {};
    for (const t of ['users', 'horses', 'riders', 'events', 'classes', 'round_results', 'raw_results',
        'horse_aliases', 'rider_aliases', 'breeder_aliases', 'training_records', 'health_records',
        'review_queue', 'series_standings', 'series_info', 'watchlist_items', 'saved_comparisons',
        'alert_prefs', 'sessions', 'rider_claims', 'coach_athletes', 'correction_reports',
        'import_logs', 'entity_audit', 'admin_settings', 'weather_cache']) {
      try { data[t] = await dump(t); } catch { data[t] = { error: 'unavailable' }; }
    }
    // Never export live secrets: password hashes, TOTP seeds, session tokens.
    if (Array.isArray(data.users)) {
      data.users = data.users.map((u) => ({ ...u, password_hash: undefined, totp_secret: undefined }));
    }
    if (Array.isArray(data.sessions)) {
      data.sessions = data.sessions.map((s) => ({ ...s, token_hash: undefined }));
    }
    audit(req, 'admin.export', 'system', null, {});
    res.setHeader('Content-Disposition', `attachment; filename="eqindex-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ exported_at: new Date().toISOString(), data });
  }));

  // ---- Danger: wipe competition data (typed confirmation) ----
  app.post('/admin/wipe', needRole('ADMIN'), asyncH(async (req, res) => {
    if (req.body?.confirm !== 'WIPE COMPETITION DATA') {
      return res.status(400).json({ error: 'send {confirm: "WIPE COMPETITION DATA"}' });
    }
    const counts = {};
    for (const t of ['round_results', 'raw_results', 'series_standings', 'classes', 'events', 'weather_cache']) {
      counts[t] = (await pool.query(`SELECT COUNT(*)::INT AS n FROM ${t}`)).rows[0].n;
      await pool.query(`TRUNCATE ${t} CASCADE`);
    }
    audit(req, 'admin.wipe', 'system', null, counts);
    res.json({ ok: true, deleted: counts });
  }));

  app.post('/admin/series/:key/recalc', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `INSERT INTO series_info (series_key, calculated_at) VALUES ($1, NOW())
       ON CONFLICT (series_key) DO UPDATE SET calculated_at = NOW() RETURNING *`, [req.params.key]);
    audit(req, 'series.recalc', 'series', req.params.key, {});
    res.json({ data: rows[0] });
  }));
};
