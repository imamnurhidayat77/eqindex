# Peta migrasi globals.css → CSS Modules

> `app/globals.css` **DIBEKUKAN** (1576 baris, 12 `!important`, per 31 Okt 2026).
> Jangan tambah rule baru di sana — gaya baru wajib CSS Module per komponen.
> Hanya bugfix kritis boleh menyentuh globals.css (tandai baris + tanggal).

## Aturan migrasi

1. Satu modul per komponen: `components/<Nama>.module.css`, import sebagai
   `import s from './<Nama>.module.css'`, ganti `className="foo"` → `className={s.foo}`.
2. Pindahkan dalam urutan prioritas di bawah (atas = paling sering berubah).
3. Setiap pindahan: hapus blok dari globals.css, catat di tabel "Status".
4. Target akhir: globals.css hanya berisi `:root` token + reset + utilitas
   generik (`sr-only`, `cover-fallback`, `section-gutter`).
5. `!important` TIDAK boleh pindah ke modul — perbaiki spesifisitasnya
   (12 lokasi terdaftar di bawah, dikelompokkan).

## Peta seksi → modul

| Seksi di globals.css (cari komentar) | Rentang ± | Modul tujuan | Prioritas |
|---|---|---|---|
| `---- My media (account library...)` + `.my-card/.my-image/.my-status` | ~80–145 | `components/MediaCard.module.css` | P1 |
| `Photographer recruiting band (home...)` | ~146–156 | `components/HomeClient.module.css` (bersama hero/booking) | P1 |
| `.hero*` + `hero-collage` + `.events-section/.event-*` + `.booking-cta` + `.reels-*` | ~124–260, 653–780 | `components/HomeClient.module.css` + `components/EventCard.module.css` | P1 |
| `event-media-card`, `media-lightbox`, `purchase-preview`, `media-detail` | ~267–330 | `components/MediaPurchase.module.css`, `app/events/...` | P2 |
| Sticky footer shell + `.footer*` | ~355–380, 781–800 | `components/SiteChrome.module.css` (header+footer+mobile-menu) | P2 |
| `---- Auth forms...` + password/show + strength + checkbox + step + inline states | ~490–688 | `components/AuthForm.module.css` | P2 |
| `Custom combo ... Searchable select` + DateField + TagModal width | ~688–733, 1391–1456 | `components/SearchSelect.module.css` (+ `TagModal`, `DateField`) | P2 |
| `Booking CTA` + `Reels page closer` | ~734–761 | (gabung `HomeClient.module.css` / `ReelsClient.module.css`) | P3 |
| Receipt + print (`receipt-*`, `@media print`) | ~1066–1110 | `app/receipts/Receipt.module.css` | P3 |
| Skeleton shimmer + route transition + toasts | ~1111–1180, 1534–1576 | `components/Feedback.module.css` (skeleton/toast/progress) | P3 |
| Studio (console, tabel, modal, tagger) | ~1197–1390, 1436–1456 | `components/StudioTable.module.css`, `UploadClient.module.css`, `TagModal.module.css` | P3 |
| Story viewer + story deck + reel player + purchase preview embed | ~1457–1533 | `components/StoryViewer.module.css`, `ReelPlayer.module.css` | P3 |
| Login lock viewport + ported prose/shell | ~1048–1085 | `components/AuthForm.module.css` / `PageShell.module.css` | P3 |

## Inventaris `!important` (12 — jangan ditiru di modul)

| Baris ± | Selektor | Alasan tercatat |
|---|---|---|
| 537 | `.auth-pass input` | padding ikon show/hide |
| 558, 580 | `.auth-check`, `.auth-check > span` | override warna/size checkbox label |
| 589–590 | (badge/step) | size/weight paksa |
| 1045 | `*, *::before/after` (reduced-motion) | paksa matikan animasi — sah, pertahankan saat migrasi |
| 1096–1100 | print (`receipt/header/footer/gallery`, `st-table`) | ink-friendly print — sah, pindah ke modul receipt |
| 1187 | `.bm-sk-hide-mobile` | skeleton responsif |

## Status

| Tanggal | Aksi |
|---|---|
| 2026-10-31 | Pembekuan + peta awal. Belum ada blok dipindah (sengaja: tanpa refactor besar). |
