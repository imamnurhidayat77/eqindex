# EQIndex Photo & Reels Commerce — Master Plan

**Status:** living document (Oct 2026). Konsolidasi seluruh diskusi Charles + riset kompetitor.
**Konteks bisnis:** family operation — Charles (platform) ayahnya Sophia / Boss Media
(fotografer + editor tunggal saat ini). Bukan marketplace arm's-length.
**Referensi:** `docs/PHOTO_PLATFORM_PLAN.md` (arsitektur foto), `docs/REELS_PLAN.md`
(detail reels), Sportfot (model license×package), Sportograf Foto-Flat, praktik
galeri NZ (Pixieset per event, proof watermark, retensi ~4 bulan).

---

## 1. Keputusan terkunci (tidak dibahas ulang kecuali ada sinyal baru)

| # | Keputusan | Sumber |
|---|---|---|
| 1 | Stills **sama seperti Sportfot**: multi-license (bukan single) | Charles |
| 2 | Sales engine stills: **1 / 5-pack / all** (per event × rider/horse) | Charles |
| 3 | Reels 3 produk request-based: **raw clip ~5s / round edit + music / event edit**, bayar di muka | Charles |
| 4 | Semua harga **placeholder dulu, wajib admin-editable** (tanpa deploy) | User |
| 5 | Music picker seperti Sportfot: **choose for me / judul track / tanpa musik** | User |
| 6 | Fotografer+editor hanya Sophia → **komisi 0%**, mekanisme dipertahankan untuk fotografer luar | User |
| 7 | Satu-satunya biaya riil = **Stripe fee**, wajib transparan di settlement | User |
| 8 | Foto tampil di **event, horse, rider** (strip) + galeri + detail + watchlist + library | Built |

---

## 2. Tabel harga placeholder (NZD, GST-inclusive display, semua admin-editable)

### 2.1 Stills

| Produk | Harga | Diubah di | Status |
|---|---|---|---|
| Single — Social | $15.00 | `/admin/pricing` → license tiers | seed lama ✅ |
| Single — Web (default/Popular) | $35.00 | sama | seed lama ✅ |
| Single — Print hi-res | $75.00 | sama | seed lama ✅ |
| Single — Commercial | $150.00 | sama | seed lama ✅ |
| 5-pack (1 event × rider, kredit 5 foto) | $129.00 | `/admin/pricing` → credit packs | seed migrasi 061 ✅ |
| 5-pack (1 event × horse) | $129.00 | sama | seed migrasi 061 ✅ |
| All photos (1 event × subject) | auto `max(0.6×Σ, singleMax)` | override per package | sudah jalan ✅ |

### 2.2 Reels (seed global migrasi 061, override per event di `/admin/pricing`)

| Produk | Scope / coverage | Harga |
|---|---|---|
| Raw clip (~5s) | clip / ring | $25.00 |
| Silver — round edit | round / ring | $149.00 |
| Gold — round edit + raw | round / full | $229.00 |
| Event edit | event / full + raw | $399.00 |

### 2.3 Uang (family policy)

- `commission_rate` Sophia = **0** (migrasi 062, §4).
- `payout = gross − platform_fee − stripe_fee_est`,
  `stripe_fee_est = round(amount_cents × 0.0175) + 30` per transaksi paid (Stripe NZ
  domestic; dilabeli est. karena kartu internasional beda tarif).
- Dengan komisi 0%: Sophia menanggung Stripe fee (standar marketplace). Jika
  Charles ingin platform yang tanggung: payout = gross (1 baris berubah).

**Butuh angka final dari Charles+Sophia:** X/Y/Z final per license, R1/R2/R3 final,
konfirmasi penanggung Stripe fee, status GST Sophia.

---

## 3. Cara foto ditampilkan (built, dipertahankan)

- **Rendition:** thumb 480px (kartu) / preview 1024px + watermark diagonal baked-in
  (detail) / original privat, hanya via signed URL 15 menit pasca-bayar.
- **Permukaan:** strip Event/Horse/Rider (`PhotoStrip`: 6 terbaru + count + View all,
  hilang total jika kosong) → galeri `/photos` (filter kind + search + URL
  `?event ?horse ?rider`) → detail `/photos/[id]` (preview + BuyBox tier picker +
  upsell package + metadata ter-link) → watchlist feed (flat 6, akan diganti P0) →
  library (satuan + isi package, download ulang selamanya).
- **Satu predikat visibilitas:** `status='published'` di semua query.
- **Kurang (masuk roadmap):** player `<video>` untuk reel (Fase B), lightbox
  (sengaja tidak ada — tiap klik diarahkan ke checkout).

---

## 4. Roadmap eksekusi

### P0 — Rider-centric watchlist grouping (2–3 hari) ✅ built (Oct 2026)

Insight inti Charles: rider hanya mau foto dirinya sendiri.
`watchlist/page.jsx` + `WatchlistView.jsx`: feed flat diganti section "My Photos"
dikelompokkan **Event → Horse** (max 8 grup terbaru, 4 thumbs each, count badge,
link View all ke galeri terfilter). Tiap grup: `CreditBuyButton` (5-pack, defensif —
bersembunyi sampai API P1 ada) + `PackageUpsell` yang sudah ada (Buy all jalan
via `/api/checkout`). Request catalog tetap 1 per subject (limit 3→12).

### P1 — 5-pack kredit ✅ built (Oct 2026; menunggu verifikasi staging)

Model tervalidasi riset ("session fee jadi kredit" = praktik umum): beli bundle 5
kredit untuk 1 event × 1 rider/horse → unlock 5 foto pilihan (tanpa cart) →
re-download gratis selamanya. Stills only.
- DB ✅ (`061_credit_packs.sql`): `credit_packs` (global + override/event, seed
  rider+horse $129) → `credit_bundles` → `credit_redemptions` →
  `purchases.credit_bundle_id` (constraint `purchases_item_check4`).
- API ✅: `GET /api/credit-packs`, `POST /api/credit-orders` (pola reel-orders),
  `POST /api/credits/unlock` (cek paid + sisa slot + scope + anti-double),
  `GET /api/my/credits`, webhook lunaskan purchase → bundle `active`,
  4 titik entitlement diperluas (detail `owned` + hint `credit.slots_left`,
  checkout guard, download, library UNION leg), sales kind ke-4 `credit`
  (CSV + summary + tabel + filter), admin CRUD `/admin/credit-packs`.
- UI ✅: section credit packs di `/admin/pricing`; "Unlock with credit (n left)"
  di BuyBox; tombol `Get 5` watchlist (`CreditBuyButton`) kini hidup;
  label reel/credit di Transactions.
- Verifikasi: sintaks OK, smoke test tanpa regresi. Race test konkurensi:
  10 unlock paralel × 1 slot → tepat 1 menang (lock FOR UPDATE + recount
  terpisah; versi 1-statement bocor 7/10 — diperbaiki & terbukti).
  Refund membekukan bundle + reel order. Wajib di staging:
  migrasi 060+061, 1 order kredit test-mode → unlock 5 → ke-6 ditolak →
  re-download gratis → refund bekukan sisa.

### P1b — Best-practice catch-up ✅ built (Oct 2026; menunggu verifikasi staging)

1. **Auto-add bundle** ✅: publish hook memasukkan foto ke semua auto-package yang
   cocok (idempotent) — library pembeli ikut membesar otomatis (live-expand).
2. **Early-bird price** ✅: `early_price_cents` + `early_until` di packages &
   credit_packs (migrasi 063), dihormati checkout, input admin, countdown pembeli.
3. **"That's me" claim** ✅ (personal shelf, family decision): tombol di detail
   foto → menyimpan foto ke galeri PENGKLAIM (section "Claimed" di library +
   `GET /api/my/claimed`, tabel `claimed_photos` migrasi 064). TIDAK menulis tag
   kanonis — tagging tetap milik fotografer/admin. Tanpa verifikasi; guardrail:
   login + throttle + audit. Tanpa perubahan visibility/ownership.
4. **Notifikasi photos-live + package-topup** ✅ (in-app): tabel `notifications` +
   upsert digest (bulk 500 foto = 1 baris unread/user) + bell header +
   `alert_prefs.new_photos` opt-in. **Email asli ditunda P3** — belum ada provider
   di stack (receipt buyer dari Stripe otomatis).

### P2 — Reels (Fase A ✅ built; Fase B 1–2 minggu; Fase C kecil)

- Fase A ✅: `reel_products` + harga admin/event, order form + music picker,
  pre-pay Stripe, antrean `/admin/reels`
  (`pending → in_production → ready → delivered`), settlement kind `reel`.
  File: migrasi 060, `media.js`, `ReelOrderForm.jsx`, event section, success page.
- Fase B ✅ built Oct 2026: ffmpeg-static + `reelProcess.js` (probe, teaser 640px
  watermark, poster), upload-url presigned direct-to-R2 ≤200MB + finalize 202 +
  polling, `ReelPlayer`, entitlement download + Owned untuk pembeli reel-order.
  DEPLOY: CORS PUT R2 dari origin web. Bug MP4-pipe ditemukan & diperbaiki via tes.
- **Privasi reel ✅ (migrasi 065): privat default** — finished custom reel keluar
  dari katalog/detail/related + tak bisa dibeli orang lain, kecuali order
  `showcase=true` (opt-in buyer di form, default off; admin toggle dengan consent).
  Pembeli dapat teaser signed-URL + halaman **My reels** (`/reels`: status order,
  player, download full). Direct-upload reels (tanpa order) tidak terpengaruh.
- Fase C ✅ item 1+2 built Oct 2026: strip "Reels" di event/horse/rider (reuse
  PhotoStrip `kind=reel`, otomatis showcase-only via filter katalog) + tab gallery
  via URL `?kind=reel`; bundel campuran (`package_items` generik — auto-create dan
  publish hook sudah menyerap reels; hitungan reel di `/photos/packages` +
  label "N photos · M reels"; `MomentBundle.jsx` cross-upsell dua arah).
  Email status order ⬜ gabung P3 (butuh provider). Harga per fotografer ⬜ tunda.
- Terbuka: siapa editor (kemungkinan Sophia), batas ukuran video, retensi selfie
  (usul 30 hari pasca-delivery + tulis di Terms), lisensi musik.

### P3 — Trust, privacy & growth ✅ built (Oct 2026; menunggu verifikasi staging)

Dasar: Privacy Act 2020 + panduan OPC Mei 2025.
1. **Opt-out** ✅: `photo_hidden` di riders+horses (migrasi 066), toggle
   PUBLIC/HIDDEN di admin, filter di katalog/related/strip; direct link +
   purchase + watchlist sendiri (`?mine=1` + followership di SQL) + library +
   claimed tetap jalan.
2. **Takedown** ✅: `POST /api/media/:id/takedown` → `correction_reports`
   (triase `/admin/corrections`, SLA 48h) → admin archive + resolve; tombol di
   detail + copy privacy page (opt-out, takedown, retensi).
3. **Retensi + nudge** ✅: `POST /admin/maintenance/run` (admin atau
   `x-maintenance-secret` untuk Cloud Scheduler; tombol di Data Tools):
   hapus file draft >90 hari (published tak tersentuh) + 1 bell reminder per
    pending order >24h. Email penuh ⬜ P3-lanjutan (butuh provider).
4. Sisa P3-lanjutan: cutoff browsing galeri 4 bulan (butuh keputusan Charles —
   mengurangi surface jualan), automation email penuh, share certificate.

### P4 — Nanti (picu saat ada sinyal)

- **ML bib/face recognition** (standar 2025–26 di Pic-Time/Sportograf): mulai assistive
  (suggest + human confirm) seperti tagging sekarang.
- **Multi-vendor** (+3–4 minggu saat dipicu): akun vendor, Stripe Connect, moderasi.
  Schema sudah ready; komisi per-vendor tinggal diisi.
- **Print fulfillment partner**: digital-only dulu.

---

## 5. Komisi 0% + Stripe fee — detail implementasi ✅ built (Oct 2026)

1. **Migrasi `062_family_zero_commission.sql`:** `UPDATE photographers SET
   commission_rate = 0 WHERE is_active` (idempotent, tanpa perubahan kode).
2. **Settlement (`media.js`):** helper `stripeFeeOf` (`round(amount×0.0175)+30`,
   paid only); CSV kolom baru `stripe_fee_est_cents` + payout net;
   summary `settlement[]` tambah `stripe_fee_cents` + `payout_cents` net;
   tabel `/admin/sales` SELECT tambah `stripe_fee_est_cents` per row.
3. **UI (`admin/sales/page.jsx`):** settlement 4 kolom
   (Gross | Platform fee | Stripe fee est. | Payout) + expanded row +
   label reel/credit.
4. **Docs:** catatan family-operation di `PHOTO_PLATFORM_PLAN.md` §7.
5. Contoh: $35.00 → fee $0.00, Stripe est. $0.91, payout $34.09.

---

## 6. Best-practice map (riset → status)

| Praktik | Sumber | Status |
|---|---|---|
| Bundle hero + anchor vs satuan | Sportograf, Fotocorredor | ✅ struktur ada; copywriting P1b |
| Post-purchase auto-add + email | Sportograf | ⬜ P1b.1 |
| Pre-event/early-bird price | Sportograf | ⬜ P1b.2 |
| Selfie/bib/outfit/time search | Sportograf, Pic-Time | ⬜ P4 (ML) |
| "That's me" + verifikasi | Sportograf | ⬜ P1b.3 |
| Harga per event dari admin | Fotografer NZ/AS | ✅ license/packages/credit/reel |
| Proof watermark, beli = full-res edit | Standar NZ | ✅ |
| Retensi galeri ~4 bulan | Annabel Zeisler | ⬜ P3.3 |
| Opt-out anak + takedown | OPC NZ, Sport Integrity | ⬜ P3.1–3.2 |
| Abandoned cart / expiry automation | Pic-Time | ⬜ P3.4 |
| Komisi marketplace ~15% (cadangan) | Benchmark | ✅ mekanisme standby, rate 0 |
| Official-photographer exclusivity | WEC policy | ⬜ urusan bisnis Charles |

---

## 7. Status kerja & verifikasi

- Selesai & terverifikasi sintaks: migrasi 060, API reels + settlement reel,
  `/admin/reels`, `ReelOrderForm`, success page, nav + palette, docs reels.
- Ditulis, menunggu DB: migrasi 061 (+ seed harga placeholder), menunggu API+UI P1.
- Belum ada Postgres lokal → migrasi 060/061 + 1 order Stripe test-mode wajib jalan
  di staging sebelum P1b.
- Smoke test: 3 gagal pre-existing (terbukti via stash di tree bersih).

## 8. Urutan eksekusi yang diusulkan

**P0 → P1 (API+UI kredit) → verifikasi staging (migrasi + Stripe test) → 062+Stripe-fee
(§5) → P1b → P2B → P3.** Estimasi total: ±3–4 minggu single dev excl. P4.

## 9. Verifikasi staging #1 ✅ (Oct 2026, sandbox lokal + staging Supabase)

- Migrasi 053→066 lolos berurutan, bersih, di kedua DB.
- 16 skenario SQL lawan sandbox: kredit (activate→5 unlock→tolak ke-6→anti-double→
  entitlement→library), reel privat (exclude katalog→entitlement buyer→showcase
  include), constraint check4 menolak 2-item, auto-absorb 6 items, digest 3→1,
  opt-out + mine=1, retention scan, claimed shelf, takedown report. 16/16 pass
  (1 temuan awal = artefak urutan tes, terkonfirmasi valid).
- Migrasi 060–066 diterapkan ke staging: 7 tabel + seed (2 credit pack $129,
  4 produk reel) + komisi fotografer = 0. API live serving endpoint baru.
- Catatan: migrasi lama 001–052 sebagian tidak idempotent di-run ulang dari nol
  (pre-existing, tak terkait 053+); smoke test butuh API di :3001.
- Sisa manual: order Stripe test-mode, upload video ≤200MB (butuh CORS PUT R2),
  MAINTENANCE_SECRET di env.

---

## 10. Boss Media split-platform (Okt 2026, arahan Charles)

Konteks: Boss Media duduk di platform/brand sendiri (bossmedia.nz); EQIndex
tetap menampilkan preview yang mengarah (deep-link + atribusi `?ref=eqindex`)
ke toko Boss Media. Keputusan domain final menunggu call — di bawah ini opsi
yang direkomendasikan: **satu backend, dua storefront**.

### 10.1 Prinsip
1. Satu API + satu DB + satu bucket R2 (namespace per fotografer/org).
   Tidak ada duplikasi data, tidak ada sync, tidak ada scrape internal.
2. Dua app Next.js dalam monorepo (`web/`, `web-bossmedia/`) berbagi komponen
   inti (BuyBox, tier logic, tokens). Tidak ada copy-paste codebase.
3. Semua aturan uang/hak di API per storefront — tidak ada hardcode per brand
   di frontend.
4. Auth lintas domain adalah bagian tersulit: Fase 1 akun terpisah per
   platform; Fase 2 SSO (mis. Supabase Auth). Tanpa auto-login via URL token.

### 10.2 Perubahan data (kecil, skema sudah multi-ready)
- Tabel baru `storefronts`: domain, brand, photographer_id/org_id, theme,
  pricing overrides, TOS. Semua query commerce filter per storefront.
- R2 path baru `{...}/{photographer_id}/{event_id}/...` (file lama fallback
  path lama, tetap jalan).
- SEO: canonical di Boss Media; preview EQIndex `noindex`/canonical ke sana.

### 10.3 Phasing (±3–4 minggu single dev utk 1–3)
1. Pondasi ✅ Nov 2026: `storefronts` (migrasi 068, seed Boss Media) +
   namespace R2 per fotografer untuk upload baru (file lama fallback, tetap
   jalan) + app shell `web-bossmedia/` (home galeri + detail `/p/[id]` +
   checkout satuan; build lolos; perlu Vercel project + domain).
2. Paritas shop (1–2 minggu): checkout, library, reel order, admin pricing
   per storefront.
3. Integrasi EQIndex (2–3 hari): kartu preview + deep link + atribusi ref
   (fondasi org-credit split).
4. SSO + split 3 arah + bonus points + volunteer credits (nanti, bareng
   kebutuhan multi-fotografer — satu paket dengan §10.4).

### 10.4 Keputusan yang harus Charles kunci (call 11:00)
1. Domain/brand terpisah penuh vs section Boss Media di backend bersama.
2. Multi-fotografer: jualan masing-masing vs pool satu galeri event.
3. Split: platform % / fotografer % / org % — cash atau credits.
4. Bonus points: earn per $ , nilai tukar, expiry, bisa diuangkan?
5. Volunteer credits: siapa approve, berapa per shift, batas pakai.
6. Raw reels: flat per klip atau ikut license tier.
7. Enforcement wajib-upload (denda/cabut akreditasi?) untuk desain compliance.
