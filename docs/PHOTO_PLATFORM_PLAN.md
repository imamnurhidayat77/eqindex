# EQIndex Photo Platform — Detailed Plan

**Status:** PLAN (not executed)
**Scope:** Single photographer v1, schema multi-ready
**Date:** 2026-09-29
**Context:** Client (Charles) referenced Sportfot as event-based photo sales model.
Decision: same-domain integration, identity-first, partner-grade commerce deferred.

---

## 1. Goal & Non-Goals

**Goal:** Every photo/reel is tagged to canonical `event → class → horse → rider`
identity, discoverable everywhere that identity appears, and purchasable
under one photographer account.

**Non-goals (v1):**
- No multi-photographer payouts, no revenue splits, no moderation queue for
  third parties (schema ready, features off).
- No print fulfillment (digital licenses only in v1; prints = later or partner).
- No rebuilding Sportfot's catalog UX — we embed photos where users already are
  (profiles, class results, search, feed), plus one `/photos` catalog route.

---

## 2. Locked Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Same domain, new routes (`/photos/...`) + embedded strips | One login, one deploy, no CORS/cookie pain, SEO compounds |
| 2 | Files on object storage (Cloudflare R2), metadata in Postgres | Never binary in DB; R2 = zero egress fees |
| 3 | 3 renditions per photo: `original` (private), `preview` (watermarked, public), `thumb` | Watermark + low-res protects asset; price visible upfront |
| 4 | Downloads via signed URLs (15-min expiry), never permanent links | One shared link must not unlock the asset |
| 5 | Stripe Checkout + webhook fulfillment | No card handling on our servers |
| 6 | Photographer keeps copyright; platform takes configured fee; GST is photographer's responsibility as seller (stated in Terms) | Keeps incentives clean, minimal tax surface for single vendor |
| 7 | Tagging assisted by start lists + human confirm, reusing review-queue pattern | Uploading 500 photos/event must not require 500 manual tags |
| 8 | `photographer_id` FK from day one, seeded with 1 row | Multi-vendor later = add rows, not migrations |

**Open questions (for Charles):** §11.

---

## 3. Data Model (new tables; migrations 034+)

All new tables reference existing canonical tables. Naming follows repo
convention (`*_id` UUID FKs, `created_at`, audit via `entity_audit`).

### 3.1 `photographers`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → `users.id`, nullable | login link (v1: 1 linked admin/vendor login) |
| name | TEXT | display name / studio |
| contact_email | TEXT | order notifications |
| payout_ref | TEXT | Stripe connected-account ref (wired in §7, unused until then) |
| commission_rate | NUMERIC | platform fee, e.g. 0.15 (config, single value v1) |
| is_active | BOOLEAN | kill-switch per photographer |
| created_at | TIMESTAMPTZ | |

Seed: 1 row (the photographer). `is_active` doubles as the on/off switch
pattern Charles asked about for shows (see also `media.status`).

### 3.2 `media` (core asset table)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | public ID used in `/photos/[id]` URLs (or slug — decided §5.1) |
| photographer_id | UUID FK → `photographers.id` | single row v1, multi-ready |
| event_id | UUID FK → `events.id`, nullable | always set via upload flow (event-based per Sportfot pattern) |
| class_id | UUID FK → `classes.id`, nullable | null = paddock/candid shots |
| horse_id | UUID FK → `horses.id`, nullable | null until tagged |
| rider_id | UUID FK → `riders.id`, nullable | null until tagged |
| kind | TEXT `photo`\|`reel` | reels = same model, `poster_key` thumb |
| storage_key | TEXT | R2 key of ORIGINAL (private bucket/prefix) |
| preview_key | TEXT | watermarked rendition key (public CDN) |
| thumb_key | TEXT | strip-size rendition key (public CDN) |
| width / height | INT | for aspect-ratio layout (no CLS) |
| taken_at | TIMESTAMPTZ nullable | EXIF when available |
| price_cents | INT | per-photo digital price; NULL = package-only |
| license_default | TEXT | default tier id from §3.3 |
| moment | TEXT nullable | `win` \| `clear` \| `debut` \| `pb` \| null — auto-suggested from `round_results`, human-confirmed (drives §8.1 badges + pricing rule) |
| status | TEXT | `draft` → `published` → (`archived`); unpublished never listed |
| view_count / purchase_count | INT defaults 0 | counters for §8.4 analytics (increment async, not in request path) |
| created_at | TIMESTAMPTZ | |

Indexes: `(event_id, status)`, `(horse_id, status)`, `(rider_id, status)`,
`(class_id, status)`, `(photographer_id, status)`, `(status, created_at DESC)`.
All discovery queries filter `status='published'` — one predicate enforces
visibility everywhere (same pattern as show on/off switch).

### 3.3 `license_tiers` (simplified Sportfot ladder)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | e.g. `social`, `web`, `print`, `commercial` |
| label | TEXT | buyer-facing name |
| max_resolution | TEXT | e.g. `1417x945`, `original` — enforced at download render |
| price_cents | INT | per-tier price (overrides `media.price_cents` when tier chosen) |
| printable | BOOLEAN | honest capability flag (Sportfot marks social tiers non-printable) |
| sort_order | INT | checkout display order, cheapest first |

Seed 4 rows v1 (social / web / print hi-res / commercial). Checkout =
photo × tier. v1 keeps tiers global (not per-photographer); per-vendor tiers
arrive with multi-vendor.

### 3.4 `packages` (Sportfot "all photos of X" engine, auto-generated)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| photographer_id | UUID FK | |
| event_id | UUID FK nullable | null = cross-event package (e.g. "season of horse X") |
| horse_id / rider_id | UUID FK nullable | exactly one set per package in v1 |
| title | TEXT | auto: `"All N photos of {horse} at {event}"`, editable |
| price_cents | INT | package price (< Σ singles; rule: `max(floor(0.6*Σ), single_max)` — photographer-overridable) |
| auto | BOOLEAN | true = membership maintained by trigger/job as newly tagged photos land |
| status | TEXT | `draft`\|`published`\|`archived` |
| created_at | TIMESTAMPTZ | |

`package_items (package_id, media_id)` materializes membership at publish
time; `auto` packages rebuild membership on tag/publish events. v1: auto
packages per (event × horse) and (event × rider) created on demand by a
"Create package" admin action, not for every combination upfront.

### 3.5 `purchases` (entitlements, not files)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| media_id / package_id | UUID FK nullable | exactly one set |
| buyer_email | TEXT | no account required to buy (receipt + link by email) |
| buyer_user_id | UUID FK → `users.id`, nullable | linked when buyer logged in (enables "my photos" library) |
| license_tier | TEXT FK → `license_tiers.id` | what was bought |
| amount_cents / currency | INT / TEXT | as charged |
| stripe_session_id | TEXT UNIQUE | idempotency key for webhooks |
| status | TEXT | `pending` → `paid` → (`refunded`) — only `paid` unlocks download |
| created_at | TIMESTAMPTZ | |

Download = `GET /api/media/[id]/download` → checks paid entitlement →
302 to signed R2 URL (15 min). Never expose `storage_key`.

### 3.6 `media_views` (analytics fuel, write-light)
`(id, media_id, viewer_hash, referrer, created_at)` — batched/async insert,
retention 12 months, powers conversion + "most viewed" (§8.4). No PII.

### 3.7 What we deliberately DON'T build (v1)
Print fulfillment, multi-vendor payouts dashboard, photographer-facing
analytics UI beyond a simple sales table, AI auto-tagging/ML bib recognition
(phase 2 candidate), mobile upload app (responsive web first).

---

## 4. Storage & Image Pipeline

- **Bucket layout (R2):** `eqindex-media/{originals,previews,thumbs}/{event_id}/{media_id}.{ext}`
  Private: `originals/`. Public via CDN: `previews/`, `thumbs/`.
- **Upload path:** browser → API (auth: photographer-linked login) → R2.
  Direct-to-R2 multipart for >50 MB reels (phase 1b if needed; v1 reels optional).
- **Processing worker** (Cloud Run job or API background task):
  1. validate MIME/size, strip GPS EXIF from public renditions (privacy!),
  2. render `thumb` (640px) + `preview` (1600px + diagonal watermark text),
  3. record dimensions, set `status='draft'`.
- **CDN:** R2 public dev URL → custom `images.*` hostname when brand domain lands.
- **Cost control:** lifecycle rule delete `originals/` of `draft` > 90 days;
  monthly storage report in admin.

---

## 5. Upload + Assisted Tagging Flow (the Sportfot-beating part)

```
Batch upload → event select → auto-suggest (start list × class schedule)
→ 1-click confirm per class → human review queue (reuse pattern) → publish
```

1. Photographer picks event (only their assigned events listed).
2. System proposes class + candidate horse/riders per photo batch using
   class schedule + start lists (data we already hold — Sportfot can't do this).
3. Confirm per batch (not per photo); ambiguous items fall into a review queue
   reusing the `review_queue` UX pattern (approve/merge/reject → here:
   confirm/reassign/skip), writing to `entity_audit`.
4. Publish flips `status` draft→published; auto-packages refresh; watchlist
   followers become notifiable (§8.3).

EXIF `taken_at` cross-checked against class times to rank suggestions.

---

## 6. Display & Discovery (same domain — decided)

Routes (all under main domain; files via CDN host):
- `/photos` catalog (latest published, filter event/horse/rider) — mirrors
  Sportfot event entry but identity-searchable.
- `/photos/[id]` detail: big preview, license tier picker (price ladder),
  package upsell ("all N of this horse"), metadata block
  (Event / Date / Class / Rider × Horse — each linked), photographer credit.
- Embedded strips (4–6 latest + count link): horse profile, rider profile,
  event page, class results block.
- `📷 N` badges on table rows/cards wherever identity appears.
- Search: horse/rider query returns Photos section alongside profiles.
- Feed: "New photos from [Event]" for watchlist followers (reuse alert_prefs).

URL rule: `/photos/[media-id]` (UUID acceptable; slugs optional later —
identity pages already prove slug pattern, but media turnover is high and
UUIDs avoid collision work; revisit if SEO demands).

---

## 7. Commerce (single-vendor minimal)

- Catalog prices in NZD, GST-inclusive display; receipt states GST component.
  Photographer is the seller of record; platform fee = `commission_rate`
  (config, no split-payment plumbing in v1 — monthly settlement + report).
- Stripe Checkout Sessions (no card data touches our servers) →
  `checkout.session.completed` webhook → `purchases.status='paid'` (guarded by
  `stripe_session_id` uniqueness = idempotent retries safe).
- Buyer library: logged-in buyers see "My photos" (re-download via signed URLs);
  guests re-access via emailed receipt link (signed, long expiry, single-purpose).
- Refunds: Stripe dashboard v1 (no self-serve UI); `refunded` status blocks
  future downloads.

---

## 8. Differentiators Implemented in Plan (why this beats keyword search)

1. **Moment badges** (`media.moment` from `round_results`: win/clear/debut) —
   emotional premium + optional 1.5× price rule (photographer-overridable).
2. **Round-attached photos** — winning-round row shows its thumbnail.
3. **Auto-packages** (§3.4) instead of manual curation.
4. **One-roof archive per horse** across events.
5. **Share cards** (photo + placing overlay) — phase 1b, free marketing loop.
6. **Photographer analytics** (§3.6 data): views→purchase per event/class/horse.
7. **Pre-event demand signals** from watchlists ("37 followers await photos").
8. **ML bib recognition**: explicitly phase 2 (heavy: training + validation).

---

## 9. Admin Surface (extends existing console)

- Media library (filter event/horse/rider/status, bulk publish/archive).
- Upload batches + tagging review queue.
- Packages (auto-create per event×horse/rider, price override).
- Sales table + monthly settlement export (CSV for photographer + GST record).
- License tiers editor (prices, capabilities).

## 10. API Endpoints (new, auth-gated writes)

- `POST /api/admin/media/upload` / `GET /api/admin/media` / `PATCH /api/admin/media/:id`
- `POST /api/admin/media/suggest-tags` (start-list engine) / review actions
- `GET /api/photos` (public, filters) / `GET /api/photos/:id`
- `POST /api/checkout` (photo|package × tier) / `POST /api/stripe/webhook`
- `GET /api/media/:id/download` (entitlement → signed URL)
- `POST /api/admin/packages` (+ auto-refresh job) / `GET /api/admin/sales`

## 11. Execution Phases & Estimates

| Phase | Content | Est. |
|---|---|---|
| P0 | Migrations 034+ (`photographers`, `media`, `license_tiers`, `packages`, `package_items`, `purchases`, `media_views`) + R2 bucket + seed tiers + 1 photographer row | 2–3 days |
| P1 | Upload + renditions worker + assisted tagging + review queue | 1.5–2 weeks |
| P2 | Display: event tab, profile strips, badges, `/photos` catalog + detail, search integration | 1.5–2 weeks |
| P3 | Commerce: Stripe checkout + webhook + downloads + buyer library + admin sales | 1.5–2 weeks |
| P4 | Packages auto + moment badges + feed notifs + analytics + share cards | 1–2 weeks |
| P5 (later) | Multi-vendor switch-on, prints partner, ML bib | scoped when triggered — see §11.1 for group delta |

Estimates assume single dev, existing auth/admin/console patterns reused.
Each phase independently demoable; stop-points after P1, P2, P3.

### 11.1 P5 Group delta — extra cost in context (no early pivot)

v1 stays single-photographer. Schema is already multi-ready (`photographers`
table + `photographer_id` FK on `media`/`packages`, `commission_rate`,
`is_active` kill-switch), so group later = switch-on, not rebuild.

Group adds over v1 (currently explicit non-goals in §1, §3.3, §3.7):

- Vendor accounts: onboarding, photographer-linked logins (`photographers.user_id`),
  isolated libraries, per-photographer `is_active` enforcement in all queries.
- Per-vendor commerce config: per-photographer license tiers (v1: global tiers),
  per-photographer `commission_rate` / pricing / package rules (v1: single value).
- Checkout across vendors: multi-vendor cart, Stripe Connect (v1: single Checkout +
  monthly settlement CSV, no split-payment plumbing, `payout_ref` wired but unused).
- Per-photographer sales dashboard + settlement/payout report + GST export
  (v1: one simple sales table).
- Moderation queue for third parties, ownership/takedown per vendor, audit
  (v1: single trusted uploader, no queue).
- Storefront: filter/search by photographer, credit attribution, vendor profile pages.
- Test + support overhead across vendors.

Est. extra build if done now vs later: +3–4 weeks single dev
(accounts 3–5d + storefront isolation 4–6d + per-vendor pricing/cart 3–5d +
Connect/payouts 5–7d + moderation/disputes 3–4d + cross-vendor test 2–3d).

Recommendation per Charles "do not pivot too early": ship P0–P4 single to prove
tagging → discovery → purchase loop at stop-points, then trigger P5-group
without migrations.

## 12. Running Costs (indicative, NZD-flavoured USD infra)

- R2: ~$0.015/GB-mo storage, **$0 egress** (why R2 over S3).
- One show weekend (3k photos + thumbs/previews): single-digit GB → cents.
- Stripe: 1.75% + 30¢ (NZ domestic) per transaction.
- Cloud Run worker: existing service, marginal.
- Dominant cost is build time, not infra — infra stays <$20/mo until serious volume.

### 12.1 Group running-cost delta

- Infra delta ~$0: same R2 bucket/prefix pattern (`{originals,previews,thumbs}/{event_id}/`),
  same CDN, same worker. Storage scales with GB, not vendor count.
- Stripe delta: Connect adds per-transfer/payout fees + reconciliation overhead on top
  of v1 1.75% + 30¢. No change to buyer pricing (NZD GST-inclusive display).
- Ops delta (the real cost): multi-vendor support, payouts disputes, moderation.
  This is why group is deferred to P5 despite zero infra delta.

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Tagging accuracy at scale | Start-list assist + human confirm + review queue; publish-gate on untagged |
| Photographer churn / single-vendor dependence | Contract + data portability (originals exportable); schema already multi-ready |
| Copyright disputes | Ownership stays photographer; takedown flow in admin; audit trail on all state changes |
| Watermark removal / piracy | Preview res capped + watermark; accept residual risk (industry-standard posture, same as Sportfot) |
| Scope creep into full marketplace | Feature-flag multi-vendor code paths; P-phases have stop-points |

## 14. Acceptance Criteria (v1 done = all true)

- [ ] Upload 500-photo batch < 10 min wall-clock; tagging confirm ≤ 5 clicks/class
- [ ] Zero untagged published photos (enforced by query + admin badge)
- [ ] Horse/rider/event/class pages show correct strips; badges counts match
- [ ] Test purchase (Stripe test mode) → download works, receipt emailed
- [ ] Signed download links expire; direct storage URLs never leak
- [ ] EXIF GPS stripped from all public renditions
- [ ] Page weight: gallery lazy-loads, no layout shift (width/height stored)
