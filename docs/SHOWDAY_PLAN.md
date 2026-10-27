# Showday Growth Plan — find, share, sell

Goal: a rider at the grounds finds and buys their photos the same day,
with zero scrolling. Six features, three phases, cheapest first.

Principles (from WALLET_PLAN): money moves only through the ledger,
roles only via approval, public endpoints stay parameterized, and face
data is opt-in (NZ Privacy Act 2020 — biometric info needs consent).

## Phase 1 — discovery without AI (days)

### 1. Back-number search
Riders already give back numbers at pre-book; photographers sort by them
overseas (Norfleet). We collect but never match on it.
- DB: `media.back_number TEXT NULL` (migration).
- API: accept + return `back_number` on upload/finalize; `GET /photos`
  gains `?bib=` filter (exact, parameterized like the rest).
- Studio: bib field in TagModal/library bulk edit; gallery search box
  matches bib ("122" finds the round).
- Effort: S. No AI, no privacy questions.

### 2. Gate QR + live gallery
Printed QR at the arena gate → event gallery URL. Photographer
publishes progressively; riders check phones between classes.
- Studio: printable QR sheet per event (`/studio/library?event=` print
  view, QR encoded client-side — no new dep, tiny QR routine or the
  existing share-link pattern). Gallery already supports progressive
  publish (status draft → published).
- Effort: S. Biggest discovery-per-dollar on this list.

### 3. WhatsApp share + free social download
Riders live on phones between classes. Every gallery/photo page gets a
share action with prefilled text ("Find my round: <link>"); buyers get
one free small watermarked file sized for socials (marketing flywheel).
- Frontend only: `wa.me/?text=` links + a `?download=social` rendition
  reusing the preview pipeline at 1080px with the large watermark style.
- Effort: S. Watch: free file must never be print-usable (cap at 1080px).

## Phase 2 — money levers (1–2 weeks)

### 4. Venue screen + rush fee
Auto-refreshing public slideshow per event for a TV at the venue
(newest published photos, no prices, QR overlay) + a rush-fee product
("edited in 12h", Norfleet charges $30/order).
- Slideshow: read-only view over `/photos?event_id=` sorted newest,
  10s rotate. No auth, no new tables.
- Rush: `reel_products`-style row or license-tier flag + checkout
  pass-through; fulfillment is manual (photographer sees the flag).
- Effort: M. Screen drives same-day foot traffic to the gallery.

### 5. Auto-slideshow reel product
Foto Owl sells AI reels generated from the photo set — no filming.
V1 without AI: Ken Burns slideshow (zoom/pan over 8–12 photos,
music optional) rendered with the existing ffmpeg pipeline into a
`reel` media row, sold through reel_products/checkout unchanged.
- Backend: `POST /admin/media/slideshow {photo_ids[], music_mode}` →
  ffmpeg concat + zoompan → finalize path. Reuse watermarkSvgLight.
- Effort: M (ffmpeg is already a dependency). Real AI motion later.

## Phase 3 — face search (needs a provider decision)

### 6. Selfie search ("find my photos")
Market standard 2026 (Foto Owl, Zenfolio Face Finder, Pic-Time,
MesGaleries). Equestrian helmets sit high so accuracy is "good"
(Photofrog), not perfect — ship as assist, never as the only path.
- Provider (open decision): AWS Rekognition fits current AWS usage
  (S3 already), pay-per-image, no new infra. Alternative: self-hosted
  embeddings + pgvector (heavier, needs DB extension).
- Flow: index faces at finalize (store Rekognition face IDs per media
  in a new `media_faces` table, never raw biometrics); rider uploads
  selfie → `POST /photos/face-search {event_id, image}` returns
  matching media IDs (short-lived, never stored).
- Privacy (non-negotiable): opt-in toggle per event, faces indexed
  only for published photos, selfie deleted after matching, NZ-based
  disclosure in Privacy page. Riders can also be found by bib/name —
  face search is additive.
- Effort: L. Biggest unlock, biggest responsibility.

## Order of attack
1 → 2 → 3 (Phase 1, all small, all shippable independently), then
4 → 5, then 6 after the Rekognition-vs-pgvector call.

## Deliberately excluded
Print lab fulfillment (partner + logistics, revisit when digital
repeat-buy rate is proven), season passes (needs demand signal first),
barn/team accounts (no request yet).
