# Account Balance & Organizer Revenue — Plan

Status: DRAFT (plan only, no code yet)
Related: `docs/PHOTO_PLATFORM_PLAN.md`, `db/migrations/061_credit_packs.sql`,
`062_family_zero_commission.sql`, `070_photographer_role.sql`

## 0. Keputusan yang sudah dikunci (UX, Okt 2026)

- **Split 10/10/80 dari gross**: platform 10%, organizer 10%, fotografer 80%.
  Kedua rate bisa diubah admin via settings. Jika event tidak punya organizer
  aktif, porsi organizer (10%) tetap di platform (→ platform 20%).
- **Fotografer dan EO akun berbeda.** Tidak ada dual-role; `organizers.user_id`
  menunjuk user ber-role `ORGANIZER`.
- **Grant hanya ke user terdaftar.** Tidak ada grant ke email mentah.
- **Tidak ada refund-ke-saldo.** Bagian yang dibayar pakai balance bersifat
  final (hangus saat refund); hanya bagian Stripe yang bisa di-refund via
  Stripe. Tulis jelas di UI checkout: "balance payments are final".
- **Payout manual.** Transfer bank manual + catat `payout` di ledger + CSV.

## 1. Ringkasan

Ada dua "uang" yang berbeda dan tidak boleh dicampur:

| | Credit | Account Balance |
|---|---|---|
| Bentuk | Slot foto (bukan uang). Cth: paket 5 foto = 5 slot | Saldo NZD (uang). Cth: NZ$50 |
| Dapat dari | Beli credit pack | Diberi event organizer (relawan), atau sisa settlement |
| Dipakai untuk | Unlock 1 foto per slot dalam scope bundle | Bayar checkout (foto/paket/reel), sebagian atau penuh |
| Bisa diuangkan kembali | Tidak | Tidak (hanya belanja di platform, v1) |
| Kedaluwarsa | Tidak (v1) | Tidak (v1) |

Alur uang baru: setiap foto terjual → platform ambil **komisi** (default 20%,
configurable) → **sebagian komisi dikirim ke event organizer** sebagai saldo
organizer → organizer **meneruskan saldo ke relawan** → relawan belanja saldo
di shop.

## 2. Keputusan desain kunci

1. **Ledger sebagai source of truth.** Tabel `wallet_transactions` (append-only)
   mencatat setiap sen masuk/keluar. Kolom `users.balance_cents` hanya cache
   untuk dibaca cepat; dilarikan di dalam transaksi DB yang sama
   (`SELECT … FOR UPDATE`), tidak pernah di-update terpisah.
2. **Split dicatat permanen per purchase.** Saat purchase `paid`, kolom
   `platform_fee_cents`, `photographer_payout_cents`, `organizer_payout_cents`,
   `organizer_id` ditulis sekali dan tidak berubah (laporan & settlement
   selalu baca kolom ini, bukan hitung ulang dari rate aktif).
3. **Satu role baru: `ORGANIZER`.** Seperti `PHOTOGRAPHER`: hanya bisa
   diberikan admin, tidak bisa self-register (register whitelist tetap
   `PUBLIC/RIDER/COACH`).
4. **Organizer terikat event, bukan global.** `events.organizer_id → organizers.id`.
   Hanya penjualan di event miliknya yang menambah saldonya.
5. **Payout v1 tetap manual.** Uang nyata keluar via transfer bank manual;
   sistem mencatat `payout` di ledger + export CSV. Stripe Connect ditunda (P3).
6. **Rate bisa 0 (keluarga).** Seperti `062`: rate commission keluarga = 0,
   mekanisme split tetap jalan (semua nol) supaya external organizer tidak
   butuh migrasi baru.

## 3. Skema DB (migrasi 071+)

### 3.1 `071_organizers.sql`

```sql
CREATE TABLE organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  contact_email TEXT NULL,
  payout_ref TEXT NULL,              -- ref transfer bank manual
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE events ADD COLUMN organizer_id UUID NULL REFERENCES organizers(id);

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN
  ('PUBLIC','RIDER','COACH','OWNER','BREEDER','PHOTOGRAPHER','ORGANIZER','ADMIN'));
```

### 3.2 `072_wallets.sql`

```sql
-- Cache saldo per user (sumber kebenaran = wallet_transactions).
ALTER TABLE users ADD COLUMN balance_cents INT NOT NULL DEFAULT 0
  CHECK (balance_cents >= 0);

CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'organizer_share',   -- komisi event masuk ke saldo organizer
    'grant',             -- organizer memberi ke relawan (keluar dari organizer)
    'grant_received',    -- pasangan 'grant' di sisi penerima
    'spend',             -- dipakai belanja di checkout
    'refund',            -- purchase refunded → saldo kembali
    'adjust',            -- koreksi admin (+/-), wajib reason
    'payout'             -- penarikan manual keluar platform
  )),
  amount_cents INT NOT NULL CHECK (amount_cents <> 0),  -- + masuk, − keluar
  balance_after_cents INT NOT NULL,                     -- saldo ybs sesudah txn
  purchase_id UUID NULL REFERENCES purchases(id),
  counterparty_user_id UUID NULL REFERENCES users(id),  -- grant: pihak lawan
  reason TEXT NULL,                                     -- wajib untuk adjust
  created_by UUID NULL REFERENCES users(id),            -- siapa yang memicu
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX wallet_tx_user ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX wallet_tx_purchase ON wallet_transactions (purchase_id) WHERE purchase_id IS NOT NULL;
```

### 3.3 `073_purchase_split.sql`

```sql
ALTER TABLE purchases ADD COLUMN platform_fee_cents INT NULL;      -- komisi platform (20%)
ALTER TABLE purchases ADD COLUMN photographer_payout_cents INT NULL;
ALTER TABLE purchases ADD COLUMN organizer_payout_cents INT NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN organizer_id UUID NULL REFERENCES organizers(id);
ALTER TABLE purchases ADD COLUMN balance_used_cents INT NOT NULL DEFAULT 0;  -- dibayar pakai saldo
ALTER TABLE purchases ADD COLUMN stripe_amount_cents INT NULL;               -- dibayar via Stripe
```

### 3.4 `074_rates.sql` (settings, bukan kolom kaku)

```sql
-- admin_settings (tabel sudah ada, tambah key):
-- 'platform_commission_rate'  default '0.10'   (fraction dari GROSS)
-- 'organizer_share_rate'      default '0.10'   (fraction dari GROSS)
-- Contoh foto NZ$100 → platform NZ$10, organizer NZ$10, fotografer NZ$80.
-- Tanpa organizer aktif: platform NZ$20, fotografer NZ$80.
```

Validasi settings: fraction 0..1, dan `platform + organizer ≤ 1` (sisanya
selalu untuk fotografer, tidak boleh negatif).

## 4. Alur

### 4.1 Foto terjual (checkout paid / webhook)

```
gross (NZ$100.00)
 ├─ photographer_payout = gross × (1 − platform_rate − organizer_rate)  → NZ$80
 │   (payout fotografer tetap manual via laporan; kolom hanya dicatat)
 ├─ platform_fee = gross × platform_rate                                 → NZ$10 (kas platform, off-ledger)
 └─ organizer_payout = gross × organizer_rate                           → NZ$10
     → wallet_transactions(organizer.user_id, 'organizer_share', +1000, purchase_id)
     → users.balance_cents += 1000   (atomic, FOR UPDATE)
Tanpa organizer aktif di event: organizer_payout = 0, platform_fee = gross −
photographer_payout (NZ$20).
```

Semua dalam satu transaksi DB di dalam Stripe webhook handler (idempotent:
`stripe_session_id` UNIQUE sudah ada — webhook replay tidak dobel catat).

### 4.2 Organizer memberi ke relawan (grant)

- Syarat: `organizer.user_id` = requester (atau ADMIN), `organizers.is_active`,
  event milik organizer (cek via `events.organizer_id`).
- Input: `to_user_id` (atau email), `amount_cents`, `note`.
- Atomic: kunci kedua wallet (`FOR UPDATE`, urutkan by id biar tidak deadlock),
  tolak jika saldo organizer < amount. Tulis 2 baris: `grant` (−) di organizer,
  `grant_received` (+) di relawan, `counterparty_user_id` silang.
- Batas v1: tidak bisa grant ke diri sendiri; tidak bisa grant jika organizer
  tidak aktif. (Rate-limit / approval di atas threshold = P2.)

### 4.3 Belanja pakai saldo (checkout)

- Syarat: buyer login (`buyer_user_id` wajib — tamu tidak bisa pakai saldo).
- Input checkout: `use_balance_cents` (≤ saldo, ≤ sisa tagihan).
- Urutan pakai: saldo dulu, Stripe untuk sisanya. Jika sisa 0 → tanpa Stripe
  session (purchase langsung `paid`, tetap tulis split 20% dari gross penuh —
  komisi dihitung dari nilai barang, bukan dari uang Stripe).
- Tulis `spend` (−) di wallet buyer dalam transaksi yang sama dengan
  pembuatan purchase (idempotent key = purchase id).
- Refund: tulis `refund` (+) sebesar `balance_used_cents` ke buyer
  (bagian Stripe di-refund via Stripe seperti biasa).

### 4.4 Credit vs balance di checkout (tidak campur)

- Credit (slot) hanya untuk unlock foto dalam scope bundle — flow existing
  (`/api/credits/unlock`), tidak berubah.
- Balance hanya untuk checkout NZD (foto/paket/reel). Satu purchase pakai
  salah satu jalur lunar? Aturan v1: **tidak bisa gabung** — foto yang
  di-unlock via credit tidak lewat purchases; foto yang dibeli via checkout
  bisa dibayar balance+Stripe. Sederhana, tidak ada konversi slot↔NZD.

## 5. API (baru, prefix sesuai konvensi existing)

| Method | Path | Role | Fungsi |
|---|---|---|---|
| GET | `/api/my/wallet` | login | saldo + 20 txn terakhir |
| GET | `/api/my/wallet/transactions?limit&offset` | login | riwayat (paged) |
| POST | `/api/checkout` += `use_balance_cents` | login* | belanja pakai saldo (*tamu: field ditolak) |
| POST | `/api/checkout/estimate` | public | hitung split (gross, fee, balance terpakai, sisa Stripe) — tanpa side effect |
| GET | `/admin/organizers` | ADMIN | list + saldo |
| POST | `/admin/organizers` | ADMIN | buat organizer (+ optional user link) |
| PATCH | `/admin/organizers/:id` | ADMIN | edit / nonaktifkan |
| GET | `/api/organizer/overview` | ORGANIZER | saldo, revenue per event, grant keluar |
| GET | `/api/organizer/volunteers?q=` | ORGANIZER | cari user penerima |
| POST | `/api/organizer/grants` | ORGANIZER | beri saldo ke relawan |
| GET | `/api/organizer/grants` | ORGANIZER | riwayat grant |
| GET | `/admin/wallets/:user_id` | ADMIN | audit satu user |
| POST | `/admin/wallets/adjust` | ADMIN | koreksi + reason wajib |
| GET | `/admin/sales` += kolom split | PHOTOGRAPHER | tampilkan fee/payout/organizer |
| GET | `/admin/sales.csv` += kolom split | PHOTOGRAPHER | settlement lengkap |

`needRole('ORGANIZER')` mengizinkan ORGANIZER + ADMIN (pola sama seperti
`needRole('PHOTOGRAPHER')` yang mengizinkan ADMIN).

## 6. UI (web-bossmedia)

1. **`/wallet`** (buyer, login): kartu saldo besar, tombol "Browse galleries",
   riwayat transaksi (tabel + pagination — reuse `GalleryPager`), empty state
   tema galeri. Link dari menu akun header ("Wallet") + halaman `/media`.
2. **`/organizer`** (role ORGANIZER): KPI (saldo, revenue 30 hari, grant keluar),
   tabel revenue per event, form grant (cari user → nominal → note → konfirmasi
   2 langkah tunjukkan nama+email penerima), riwayat grant + pagination.
3. **Checkout (`MediaPurchase`/`BuyBox`)**: tampilkan "Use balance (NZ$X
   available)" + input nominal + ringkasan split sebelum bayar. Jika saldo
   menutup penuh → tombol "Pay with balance" (tanpa Stripe redirect).
4. **Studio Sales**: kolom Platform fee / Photographer payout / Organizer +
   filter; CSV ikut.
5. **Admin**: CRUD organizers, adjust wallet (reason wajib), settings 2 rate.

## 7. ~~Pertanyaan untuk user (butuh jawaban sebelum koding)~~ TERJAWAB (Okt 2026)

1. ~~**Organizer share**: % dari komisi platform atau % dari gross?~~ →
   **% dari gross: 10 platform / 10 organizer / 80 fotografer**, keduanya
   configurable admin.
2. ~~**Organizer = fotografer juga?**~~ → **Akun berbeda.** Tidak ada dual-role.
3. ~~**Batas grant**~~ → v1: tanpa threshold approval (ditunda ke P4);
   grant wajib ke user terdaftar (lihat #4).
4. ~~**Volunteer tanpa akun?**~~ → **Harus user terdaftar.** Tidak ada
   grant ke email mentah.
5. ~~**Refund**~~ → **Tidak ada refund-ke-saldo.** Bagian balance hangus
   saat refund; hanya bagian Stripe yang di-refund via Stripe.
6. ~~**Payout**~~ → **Manual** (transfer bank + catat `payout` di ledger + CSV).

## 8. Fase pengerjaan (usulan)

- **P0 — Ledger & split (backend)**: 071–074, tulis split di webhook,
  `organizer_share` masuk otomatis, unit test konkurensi (2 spend bersamaan
  tidak boleh minus). Tanpa UI baru kecuali `/api/my/wallet` JSON.
- **P1 — Spend**: `use_balance_cents` + estimate + refund-ke-saldo.
- **P2 — Organizer**: role, `/api/organizer/*`, halaman `/organizer`
  (overview + grant + riwayat).
- **P3 — Buyer wallet UI + settlement**: `/wallet`, kolom split di Studio
  Sales + CSV, adjust audit admin.
- **P4 — Opsional**: threshold approval, grant ke email-belumlah-terdaftar,
  Stripe Connect, riwayat multi-currency (tetap NZD-only di v1).

## 9. Risiko & guardrail

- **Double-spend**: semua mutasi saldo dalam transaksi dengan
  `SELECT … FOR UPDATE` + `CHECK (balance_cents >= 0)` di DB (bukan di app).
- **Replay webhook**: mengandalkan `stripe_session_id` UNIQUE + tulis split
  hanya pada transisi `pending → paid`.
- **Grant fiktif**: grant hanya dari saldo organizer yang benar-benar
  diperoleh dari share (tidak bisa top-up sendiri); adjust hanya ADMIN +
  reason + audit log.
- **Angka floating**: semua uang `INT cents`, rate disimpan sebagai NUMERIC/
  string fraction, pembulatan `Math.round` sekali di tepi (saat tulis split).
- **GST**: angka plan ini ex-GST vs inc-GST belum diputuskan — samakan dengan
  perlakuan harga tier existing sebelum P0 (§7, tambahan).
- **Privacy**: saldo & riwayat hanya pemilik + ADMIN; organizer hanya lihat
  grant yang ia buat, bukan belanja relawan.
