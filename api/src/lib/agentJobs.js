// Background mapping jobs for the Import Assistant (Phase 3).
// AI mapping of big files is slower than the ~30s Vercel proxy limit, so
// the chat route queues a job and returns immediately; the web client
// polls GET /admin/import/jobs/:id until done, then renders the analysis.
// Jobs only MAP (deterministic + AI) — Validate/preview/Commit stay in the
// existing UI flow, approved by a human. Runs in-process: fine for a
// single instance; a restarted instance leaves rows `running` (the GET
// endpoint reports those as interrupted so the admin can resend).
const pool = require('../db');
const { aiMapRecords } = require('./ai');
const { applySeriesMap, mapResultToReply } = require('./assist');

const STALE_MS = 15 * 60 * 1000;

async function createJob({ userId, kind, input }) {
  const { rows } = await pool.query(
    `INSERT INTO assistant_jobs (user_id, kind, input, status)
     VALUES ($1, $2, $3, 'queued') RETURNING id`,
    [userId, kind, input || {}]);
  return rows[0].id;
}

async function getJob({ id, userId }) {
  const { rows } = await pool.query(
    'SELECT * FROM assistant_jobs WHERE id = $1 AND user_id = $2', [id, userId]);
  const job = rows[0];
  if (!job) return null;
  if ((job.status === 'queued' || job.status === 'running')
    && Date.now() - new Date(job.updated_at).getTime() > STALE_MS) {
    await pool.query(
      "UPDATE assistant_jobs SET status = 'error', error = 'interrupted (server restarted?) — please resend', updated_at = NOW() WHERE id = $1",
      [id]);
    job.status = 'error';
    job.error = 'interrupted (server restarted?) — please resend';
  }
  return job;
}

async function markProgress(id, progress) {
  await pool.query(
    'UPDATE assistant_jobs SET progress = $2, updated_at = NOW() WHERE id = $1',
    [id, progress]);
}

async function runAiMapJob(id) {
  const { rows } = await pool.query('SELECT * FROM assistant_jobs WHERE id = $1', [id]);
  const job = rows[0];
  if (!job || job.status !== 'queued') return;
  await pool.query("UPDATE assistant_jobs SET status = 'running', updated_at = NOW() WHERE id = $1", [id]);
  try {
    const { text, hint, filename } = job.input || {};
    if (!text || !String(text).trim()) throw new Error('job has no text to map');
    let chunks = 0;
    const { records, dropped, prose, truncated } = await aiMapRecords({
      text, hint: hint || '', session: `job-${String(id).slice(0, 8)}`,
      onChunk: (c) => {
        chunks++;
        markProgress(id, { done: chunks, phase: 'Mapping' }).catch(() => {});
      },
    });
    const tagged = await applySeriesMap(records, job.user_id);
    const { reply, analysis } = mapResultToReply({ records, dropped, prose, truncated, filename, tagged });
    await pool.query(
      "UPDATE assistant_jobs SET status = 'done', output = $2, progress = NULL, updated_at = NOW() WHERE id = $1",
      [id, { reply, analysis }]);
  } catch (e) {
    await pool.query(
      "UPDATE assistant_jobs SET status = 'error', error = $2, updated_at = NOW() WHERE id = $1",
      [id, String(e.message || e).slice(0, 500)]);
  }
}

// Queue + kick off without awaiting (the HTTP response must return fast).
async function queueAiMapJob({ userId, text, hint, filename }) {
  const id = await createJob({ userId, kind: 'ai_map', input: { text, hint, filename } });
  setImmediate(() => runAiMapJob(id).catch(() => {}));
  return id;
}

module.exports = { createJob, getJob, runAiMapJob, queueAiMapJob };
