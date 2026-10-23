# EQIndex — Agent Rules
# Berlaku untuk SEMUA agent (manusia maupun AI) yang mengerjakan repo ini.

## Skill wajib: ponytail (default aktif)

- Skill `ponytail` (`.agents/skills/ponytail/SKILL.md`, MIT — DietrichGebert/ponytail)
  WAJIB dipakai semua agent pada setiap coding task (nulis, benerin, refactor,
  review, pilih dependensi), kecuali user bilang "stop ponytail" / "normal mode".
- Level default: **full**. Naik ke **lite** hanya kalau user minta eksplisit
  ("ponytail lite", "be lazy", dsb); **ultra** hanya kalau user minta.
- Inti yang tidak boleh dilanggar: smallest complete change (YAGNI — jangan
  tambah fitur/opsi/abstraksi yang tidak diminta), pakai helper/pattern yang
  sudah ada di codebase, jangan tambah dependensi untuk hal sepele, hapus kode
  lebih baik daripada nambah kode, dan akhiri jawaban dengan 1–2 baris: apa
  yang di-skip + risiko yang harus user tahu.
- Yang TIDAK boleh dipotong atas nama "lazy": validasi di trust boundary,
  error handling pencegah data loss, security, accessibility, dan apa pun yang
  user minta eksplisit. Lihat bagian Clean Code & Security di bawah.

## Clean code (WAJIB)

- Ikuti struktur & konvensi yang sudah ada di folder yang disentuh (jangan bawa
  gaya dari project lain). Satu file = satu tanggung jawab yang jelas.
- Fungsi kecil, nama jujur (tanpa singkatan misterius), tanpa kode mati /
  komentar basi / `console.log` debug yang tertinggal.
- Duplikasi ≥3x → ekstrak ke helper bersama di lokasi yang sudah ada
  (`lib/`, `components/`, dsb), bukan file util baru sembarangan.
- Magic number/string → konstanta bernama. `TODO` harus sertakan alasan +
  kondisi selesai, bukan sekadar `// TODO fix later`.
- Setiap perubahan non-trivial (branch, loop, parser, uang, auth, script baru)
  wajib ditemani minimal satu test kecil atau assert/self-check. Verifikasi
  dengan menjalankan test yang relevan, bukan sekadar "kelihatannya benar".
- Error message untuk user: bahasa manusia, tanpa stack trace / detail
  internal bocor ke UI.

## Security (WAJIB — tidak bisa ditawar)

- Trust boundaries repo ini: `POST /auth/*` (register/login), `POST /corrections`,
  `POST /api/checkout` + Stripe webhook, upload media (`/admin/media/upload`),
  signed download URL, dan semua route `needRole('PHOTOGRAPHER'/'ADMIN')`.
- Validasi & sanitasi SEMUA input di boundary: tipe, panjang, format, allowlist
  role (`PUBLIC/RIDER/COACH` untuk register — JANGAN pernah izinkan client
  mengklaim role `PHOTOGRAPHER`/`ADMIN`; itu eskalasi hidden privilege).
- Jangan pernah: commit secret/key/token ke git, log PII atau secret, echo secret
  ke terminal, menonaktifkan auth/rate-limit/CORS check "sementara", atau
  mem-bypass `needRole`/`needUser` (IDOR: scope selalu dari session, bukan dari
  `?user_id=` / body / header).
- Secret hanya via env (`.env`, bukan hardcode). Kalau butuh kredensial baru,
  minta user — jangan bikin sendiri. File `.env*` tidak boleh dibaca isinya
  untuk dipaste ke jawaban; cukup sebut nama variabelnya.
- File upload: cek MIME + batas ukuran di server (jangan percaya header client),
  simpan dengan key yang di-generate server (`mediaStore.keyFor`), original
  tidak pernah publik — hanya via signed URL berbayar.
- Tiap selesai kerjaan yang menyentuh area sensitif, tutup jawaban dengan
  1–2 baris risiko (sesuai aturan ponytail) — mis. "tidak ada test untuk
  webhook; replay Stripe event bisa double-charge kalau idempotency key gagal".

## Dev server (WAJIB)

- `web/` dan `web-bossmedia/` masing-masing Next.js dengan folder `.next` sendiri.
- SATU folder = SATU dev server. Jangan jalankan 2x `next dev` dari folder yang sama
  (mis. port 3000 + 3005 barengan dari `web-bossmedia`) — keduanya rebutan `.next`
  dan bikin `404 /_next/static/chunks/*`.
- Sebelum `npm run dev`, cek dulu: `lsof -i :3000,:3005` / `ps aux | grep "next dev"`.
  Kalau sudah jalan, JANGAN start lagi.
- Jangan `kill` dev server milik user tanpa izin.

## DILARANG `next build` otomatis setelah edit

- JANGAN jalankan `next build` / `npm run build` / `npx next build` setelah edit code.
- Alasan: `build` menimpa `.next` yang sedang dipakai `next dev` → semua chunk
  (`main-app.js`, `app-pages-internals.js`, `app/*/page.js`) jadi 404 dan user
  harus restart manual.
- Verifikasi edit cukup dengan salah satu:
  - `npx tsc --noEmit -p web-bossmedia` (atau `web`)
  - `npm run lint --prefix web-bossmedia` (jika ada)
  - cek kompilasi di terminal `next dev` yang sudah jalan
- `next build` HANYA boleh dijalankan kalau user eksplisit minta
  (mis. "tolong build", "cek production build", "mau deploy").
- DILARANG `rm -rf .next` saat dev server jalan — tanya user dulu.
