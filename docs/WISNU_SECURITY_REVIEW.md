# Wisnu Security Review — web-bossmedia + api (checkout return_base, CSRF, reset/forgot, upload)

Tanggal: 2026-10-31 · Cabang: `hermes/wisnu-sec` (dari `master`) · Sifat: **read-only review, tanpa patch kode** (checkout logic tidak diubah tanpa konfirmasi, sesuai instruksi).

## Ringkasan

| # | Area | Temuan | Severity | Patch? |
|---|------|--------|----------|--------|
| 1 | `return_base` + CSRF wildcard `*.vercel.app` | Wildcard publik — subdomain Vercel **siapa pun** lolos allowlist | **High (CSRF bypass) / Medium (return URL)** | Tidak — butuh keputusan deploy (lihat opsi) |
| 2 | Alur forgot/reset (`api/src/routes/auth.js`) | Solid — tidak ada temuan | — | — |
| 3 | Validasi upload foto (multipart) | Solid: sniff magic bytes, limit 15 MB, ext sanitasi | — | — |
| 4 | Validasi upload reel (direct-to-R2) | Junk non-video bisa tersimpan di bucket (tidak publik); finalize gagal aman | Low | Tidak |
| 5 | CSP prod `connect-src 'self'` vs PUT langsung ke R2 | Reel upload kemungkinan **diblokir browser di production** | Medium (fungsional) | Tidak — perlu host R2 yang benar dari deploy env |

## Detail

### 1. Wildcard `*.vercel.app` terlalu lebar (SATU-SATUNYA TEMUAN PENTING)

Dua tempat memakai pola pencocokan yang sama:

- `api/src/middleware/security.js` — `originAllowed()`: `host === a.slice(2) || host.endsWith(a.slice(1))`
- `api/src/routes/media.js` — `returnBase()` → `ALLOWED_BASES()`: pola identik
- Test `api/checkout.security.test.mjs` ("preview wildcard origin passes") mengabadikan perilaku ini untuk `https://eqindex-abc123.vercel.app`.

Masalah: `*.vercel.app` adalah **namespace publik**. Penyerang dapat deploy `evil-xyz.vercel.app` gratis dan:

1. **CSRF guard bypass (High).** Session cookie adalah `SameSite=None` (agar Vercel → Cloud Run bekerja), jadi cookie dikirim lintas-situs. Satu-satunya pertahanan adalah pengecekan `Origin`. Karena origin penyerang lolos allowlist, halaman jahat bisa POST berautentikasi (logout, checkout, dsb.) sebagai korban yang sedang login.
2. **`return_base` ke origin penyerang (Medium).** `returnBase()` menerima origin apa pun yang cocok wildcard sebagai `success_url`/`cancel_url` Stripe — pembeli bisa dikembalikan ke halaman phising pasca-bayar. (`success_path`/`cancel_path` sudah path-only — bagus, itu bukan masalah.)

Catatan penyeimbang: `endsWith('.vercel.app')` mensyaratkan titik, jadi `evilvercel.app` tidak lolos — hanya subdomain asli. Dan nilai aktual `WEB_ORIGIN` tidak ada di repo (env deploy), jadi severity riil tergantung apakah `*.vercel.app` benar-benar dipasang di production.

**Opsi perbaikan (pilih satu, butuh konfirmasi sebelum implementasi):**
- (a) Hapus entri `*.vercel.app` dari `WEB_ORIGIN` production; daftarkan origin preview secara eksplisit (atau via `APP_URL` per-preview).
- (b) Dukung wildcard **berawalan proyek**, mis. `eqindex-*-*.vercel.app` → cocokkan `host.endsWith('-team.vercel.app') && host.startsWith('<project>-')`, bukan suffix publik generik.
- (c) Minimal: pisahkan allowlist — wildcard hanya untuk CSRF-dev, `returnBase` hanya exact-match.

### 2. Forgot/reset — OK

- `/auth/forgot`: respons identik ada/tidak ada akun (anti-enumerasi), token 32-byte, sha256 at rest, 1 jam, satu token live per user, cleanup token saat mail gagal, rate-limit, `APP_URL` unset → 503 eksplisit. Frontend (`ForgotClient.jsx`) tidak membocorkan keberadaan akun.
- `/auth/reset`: single-use (`used_at`), expiry di SQL, `password_hash` bcrypt(12), **semua sesi dihapus** pasca-reset (menendang sesi penyerang), token via JSON body bukan URL (tidak masuk log proxy), panjang token dibatasi 256 char.
- Register di atas email guest-checkout tanpa password tidak 409 melainkan mengirim claim-link ke inbox — pemenang adalah pemilik inbox. Benar.

### 3. Upload foto (multipart) — OK

- `multer.memoryStorage`, limit 15 MB × 20 file; allowlist MIME `jpeg/png/webp`; **sniff `file-type` magic bytes** dan tolak jika tidak cocok (`is not a real image`); ext diambil dari hasil sniff, disanitasi alfanumerik ≤8 char (tahan `../%2f`); sharp re-encode + watermark baked; original tidak pernah publik.

### 4. Upload reel (direct-to-R2) — Low, diterima apa adanya

- `POST /admin/media/upload-url`: allowlist MIME video + `size_bytes` 1–200 MB + ext sanitasi — tapi semua dari klaim client. PUT ke R2 tidak dibatasi Content-Length oleh presigned URL; `finalize` baru menolak `>200MB` via `headKey` **setelah** byte masuk. File bukan-video: `probeDims` (ffprobe) throw → tidak ada thumb/preview, row tetap draft. Objek sampah tetap ada di bucket di bawah `originals/`, tapi hanya dapat dijangkau via signed URL berbayar — tidak ada XSS/serving publik. Risiko: biaya egress R2 + sampah bucket. Saran non-blokir: lifecycle/cleanup cron untuk `reel` draft tanpa `thumb_key` >24 jam.

### 5. CSP prod vs direct-to-R2 PUT (fungsional, terkait upload)

- `web-bossmedia/next.config.js` prod: `connect-src 'self'`. `UploadClient.uploadReel` melakukan `fetch(upload_url, PUT)` ke host R2 (cross-origin) → kemungkinan diblokir CSP di production, artinya **upload reel gagal di prod tapi lolos di dev** (header hanya prod). Perlu host R2 publik ditambahkan ke `connect-src`, atau pindahkan PUT via proxy. Butuh nilai host R2 deploy untuk patch yang tepat — tidak dipatch di sini.

## Yang TIDAK diubah & mengapa

- Nol perubahan pada `api/src/routes/media.js` (checkout), `security.js`, auth, dan upload — sesuai batasan "read-only review, jangan ubah checkout logic tanpa konfirmasi". Semua di atas adalah laporan + opsi, menunggu keputusan pemilik untuk (1) dan (5).

Yang di-skip: audit dependensi ( tidak ada `npm audit`), penetrasi Stripe webhook live, dan pengecekan nilai `WEB_ORIGIN`/`APP_URL` production (env deploy, tak terlihat dari repo).
