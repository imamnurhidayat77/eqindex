// Reel processing (P2B, see docs/REELS_PLAN.md Fase B).
// ffmpeg-static binary (no apt needed on node:20-slim). All processing reads
// the original as a STREAM from R2 (never buffered whole: 200MB files must
// not sit in Node memory). Only the small outputs (640px preview/poster)
// are buffered for upload.
//
// Pipeline per finalized reel:
//   1. probe dims (early-kill once the Video: header line appears),
//   2. preview: 640px-wide H.264 + baked watermark overlay + faststart,
//      full length, low bitrate (free playable teaser, mirrors photo previews),
//   3. poster: single JPG frame taken from the preview (in-memory, fast).
const { spawn } = require('node:child_process');
const ffmpegPath = require('ffmpeg-static');

const PREVIEW_WIDTH = 640;
const PROBE_TIMEOUT_MS = 30000;
const TRANSCODE_TIMEOUT_MS = 10 * 60 * 1000;

function runFfmpeg(args, stdinStream, { timeoutMs, killOn }) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    let done = false;
    const finish = (fn) => { if (!done) { done = true; try { child.kill('SIGKILL'); } catch {} fn(); } };
    const timer = setTimeout(() => finish(() => reject(new Error('ffmpeg timed out'))), timeoutMs);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => {
      err += d.toString();
      if (killOn && killOn.test(err)) {
        clearTimeout(timer);
        finish(() => resolve({ buffer: Buffer.concat(out), stderr: err, early: true }));
      }
    });
    child.on('error', (e) => { clearTimeout(timer); finish(() => reject(e)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`));
      resolve({ buffer: Buffer.concat(out), stderr: err, early: false });
    });
    if (stdinStream) {
      stdinStream.on('error', (e) => finish(() => reject(e)));
      stdinStream.pipe(child.stdin);
      child.stdin.on('error', () => {});
    } else {
      child.stdin.end();
    }
  });
}

const DIM_RE = /Video:\s*[^\n]*?(\d{2,5})x(\d{2,5})/;

// Fast dimensions probe: ffmpeg prints stream headers immediately, so we
// kill the process as soon as the Video: line appears (no full decode).
async function probeDims(inputStream) {
  const { stderr } = await runFfmpeg(
    ['-hide_banner', '-i', 'pipe:0', '-f', 'null', '-'],
    inputStream,
    { timeoutMs: PROBE_TIMEOUT_MS, killOn: DIM_RE }
  );
  const m = stderr.match(DIM_RE);
  if (!m) throw new Error('could not probe video dimensions');
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

// Watermarked low-res preview (the free teaser). Watermark PNG is tiled
// diagonally across the whole frame at upload time — baked into pixels.
// NOTE: MP4 cannot stream to a pipe (non-seekable muxer), so we render to a
// temp file (a few MB at 640px) and read it back. /tmp pressure is bounded:
// one small file per finalize job at a time.
async function renderPreview(inputStream, watermarkPngPath) {
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');
  const outPath = path.join(os.tmpdir(), `eqindex-pv-${process.pid}-${Date.now()}.mp4`);
  try {
    const { stderr } = await runFfmpeg([
      '-hide_banner', '-i', 'pipe:0', '-i', watermarkPngPath,
      '-filter_complex',
      `[0:v]scale=${PREVIEW_WIDTH}:-2:flags=lanczos,format=yuv420p[bg];` +
      `[1:v]scale=${PREVIEW_WIDTH}:-2[wm];[bg][wm]overlay=0:0:format=auto[v]`,
      '-map', '[v]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
      '-c:a', 'aac', '-b:a', '64k',
      '-movflags', '+faststart', '-f', 'mp4', outPath,
    ], inputStream, { timeoutMs: TRANSCODE_TIMEOUT_MS });
    const buffer = await fs.promises.readFile(outPath);
    const m = stderr.match(DIM_RE);
    return { buffer, width: m ? parseInt(m[1], 10) : PREVIEW_WIDTH, height: m ? parseInt(m[2], 10) : null };
  } finally {
    await fs.promises.unlink(outPath).catch(() => {});
  }
}

// Poster frame from the (small, in-memory) preview — no second R2 download.
// NOTE: -ss must be an OUTPUT option here. As an input option ffmpeg tries
// to seek, which silently yields zero frames on non-seekable pipe:0 input
// (empty poster). After -i it decodes-and-discards instead — always works.
async function renderPoster(previewBuffer, atSeconds = 1) {
  const { Readable } = require('node:stream');
  const { buffer } = await runFfmpeg([
    '-hide_banner', '-i', 'pipe:0', '-ss', String(atSeconds),
    '-vframes', '1', '-vf', 'scale=480:-2', '-q:v', '4', '-f', 'image2', 'pipe:1',
  ], Readable.from(previewBuffer), { timeoutMs: PROBE_TIMEOUT_MS });
  if (!buffer.length) throw new Error('poster render produced zero bytes');
  return buffer;
}

module.exports = { probeDims, renderPreview, renderPoster, PREVIEW_WIDTH };
