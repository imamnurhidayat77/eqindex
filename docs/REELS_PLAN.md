# Reels Plan — custom highlight reels ala Sportfot

Status: planned, not built. Consolidated from research + discussion (Oct 2026).

## 1. Referensi: cara kerja reels di Sportfot (terverifikasi)

- Halaman **"Video Reel"** per event (mis. Wellington ESP Fall 2) — sejajar Photos,
  bukan lampiran galeri. Melihat/membeli wajib login akun.
- Isinya **formulir pemesanan reel custom**, bukan video jadi:
  "INFORMATION SHEET FOR CREATING YOUR REEL : GOLD : WARM UP, RING,
  BEHIND THE SCENES…" — tim Sportfot mengedit dari footage warm-up, ring,
  dan behind-the-scenes.
- Field form: Shooting Date, nama, Ring (arena), Class, Back number,
  Horse's name (**one horse per order**), Music (choose for me / tulis
  judul / tanpa musik), **upload foto selfie "so we can recognize you"**
  (pencocokan wajah di footage), Phone number → **ADD TO CART**.
- Halaman **"Package Deal"** per event: 4 SKU dalam 2 sumbu —
  tier liputan **Silver** (ring only, $189) vs **Gold** (warm up + ring +
  behind the scenes, $219), masing-masing ada varian **+ raw video footage**
  ($259 / $289). Alur: pilih produk → add to cart → isi information
  sheet → bayar → diproduksi → diserahkan.

Kesimpulan: reel = **jasa editing personal berbayar**, bukan file yang
di-upload fotografer. Jauh lebih murah dibangun daripada pipeline video
otomatis (tanpa face recognition / transcoding canggih di sisi kita).

## 2. Prinsip produk di EQIndex

- Rider memesan reel personal per kuda per event; fotografer/editor
  memproduksi manual; hasil diserahkan dan tertaut ke horse/rider.
- Bayar **di muka** (add to cart → bayar → produksi), seperti Sportfot.
- Harga **tiered per event**, didefinisikan admin (menjawab pertanyaan
  pricing; bukan flat).

## 3. Arsitektur & reuse

Dipakai ulang apa adanya: tabel `media` (`kind='reel'`, tag
horse/rider/event, draft→published), Media Upload + Library, `packages` /
`package_items`, Stripe Checkout + webhook + `purchases`, download
entitlement via signed URL 15 menit, halaman detail `/photos/[id]`.

Dibangun baru: katalog produk reel, form order, tabel order, antrian
fulfillment, player `<video>`, dan (Fase B) processing video.

## 4. Data model (migrasi 057, sketsa)

`reel_products` (katalog per event): `event_id`, nama tier
(Silver/Gold), flag liputan (ring/warm-up/behind-the-scenes),
`includes_raw`, `price_cents`, status. Admin yang kelola.

`reel_orders`: pembeli (`user_id`, wajib login — sama seperti checkout),
`product_id`, `event_id`, `shooting_date`, ring/arena, `class_name`,
`back_number`, `horse_name`, musik (`choose_for_me` | judul | tanpa),
`selfie_key` (R2 prefix privat `reel-refs/`, tidak pernah publik),
`phone`, `price_cents`, status
(`awaiting_payment → pending → in_production → ready → delivered`,
plus `cancelled`), `purchase_id`, `media_id` hasil, timestamps.
Selfie hanya dibuka admin via signed URL + kebijakan hapus setelah N hari.

## 5. Flow ujung-ke-ujung

**Fase A (MVP):**
1. **Order** — seksi "Video Reels" di halaman event: kartu produk (tier,
   isi liputan, +raw, harga, info) → Add to cart → form information sheet
   (tanggal terisi dari event; nama, ring, class, back number, kuda,
   musik, selfie ≤5MB, HP; validasi mandatory, satu kuda per order) →
   bayar via Stripe checkout yang sudah ada (diperluas dengan
   `reel_order_id`) → webhook lunas → order `pending`.
2. **Fulfillment** — halaman admin baru (grup MEDIA/CURATE, pola seperti
   Corrections queue): daftar order per status, detail + selfie referensi,
   assign; fotografer edit eksternal lalu upload hasil via **Media Upload
   biasa** dengan tag horse/rider yang sesuai; admin link `media_id` →
   `ready`.
3. **Delivery** — order `delivered`; reel muncul di "My medias" pembeli +
   terbit di halaman horse/rider (publish seperti foto); full-res via
   signed URL entitlement yang sudah ada.
4. **Player** — halaman detail media pakai `<video>` bila `kind='reel'`
   (sumber: file asli via signed URL untuk yang berhak).

**Fase B (processing video, setelah MVP jalan):**
- Tambah `ffmpeg` ke image API (sekarang hanya `sharp`, tak bisa sentuh
  video).
- Saat upload reel: ekstrak **poster frame** → `thumb_key`; render
  **preview resolusi rendah ber-watermark** → `preview_key` (teaser gratis
  yang bisa diputar, meniru preview foto).
- **Batasan teknis:** upload browser lewat proxy Vercel (~30 dtk) — video
  50–200MB pasti 502. Butuh upload langsung ke Cloud Run atau chunked
  upload + limit khusus video (mis. 200MB), bukan 15MB.

**Fase C (discovery & monetisasi):** rak reel per event/horse, bundel
foto+reel via `package_items`, harga per fotografer, notifikasi email
(saat ini hanya in-app).

## 6. Kesenjangan reels hari ini (kenapa perlu plan ini)

- Upload reel bisa (MP4/MOV/WebM) tapi **hanya simpan file asli** —
  tanpa thumbnail/preview/watermark.
- Halaman detail reel hanya emoji 🎬 — **tidak ada `<video>`**; reel
  published praktis tak bisa ditonton; pembeli bayar tanpa preview.

## 7. Verifikasi per fase

- Fase A: order fiktif end-to-end (form → bayar test-mode → antrian →
  upload hasil → delivered → tampil di pembeli); selfie tak bisa diakses
  publik (403); user lain tak bisa intip order orang (404/403).
- Fase B: poster ter-generate, preview terputar tanpa login, original
  tetap butuh entitlement.
- Regresi: alur foto tidak berubah.

## 8. Estimasi & risiko

Fase A sedang (mayoritas CRUD + reuse), Fase B sedang-besar (ffmpeg,
upload besar, player), Fase C kecil-sedang. Risiko: (a) upload video
besar vs proxy — wajib desain Fase B; (b) **lisensi musik** — batasi ke
"choose for me" atau pastikan cleared; (c) retensi selfie — tetapkan dan
tulis di syarat layanan.

## 9. Keputusan yang masih terbuka

1. ~~Harga~~ → tiered per event ala Sportfot (Silver/Gold × +raw).
2. ~~Waktu bayar~~ → di muka (default).
3. Siapa yang mengedit (internal vs eksternal)?
4. Batas ukuran video + berapa lama selfie disimpan?
