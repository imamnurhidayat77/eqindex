// Lint gate web-bossmedia (zero-dep): cegah regresi SmartImage + config prod.
// - Tidak ada <img> mentah di luar components/SmartImage.jsx
//   (blob:/data: fallback lokal memang tinggal di SmartImage).
// - next.config.js wajib images.unoptimized === false (optimizer AKTIF).
// - package.json engines.node wajib >=18.
// Keluar non-zero + pesan jelas kalau ada pelanggaran.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (msg) => failures.push(msg);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

// 1. Raw <img> hanya boleh di SmartImage.jsx
for (const file of walk(join(ROOT, 'app')).concat(walk(join(ROOT, 'components')))) {
  if (file.endsWith('components/SmartImage.jsx')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/<img[\s>]/.test(line)) fail(`${file}:${i + 1}: raw <img> — pakai components/SmartImage.jsx`);
  });
}

// 2. Optimizer aktif: images.unoptimized === false
const nextConfig = readFileSync(join(ROOT, 'next.config.js'), 'utf8');
if (!/unoptimized\s*:\s*false/.test(nextConfig)) {
  fail('next.config.js: images.unoptimized harus false (optimizer AKTIF di prod)');
}

// 3. engines.node >= 18
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const engines = pkg.engines?.node ?? '';
const min = Math.min(...[...engines.matchAll(/(\d+)/g)].map((m) => Number(m[1])));
if (!engines || Number.isNaN(min) || min < 18) {
  fail(`package.json engines.node "${engines}" harus >=18`);
}

if (failures.length > 0) {
  console.error(`lint-bossmedia GAGAL (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('lint-bossmedia OK: no raw <img>, optimizer aktif, engines >=18');
