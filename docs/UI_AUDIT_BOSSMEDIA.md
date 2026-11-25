# Boss Media UI audit (2026-11-25)

Scope: `web-bossmedia/` (app + components). Skills used: `review-animations`,
`emil-design-eng`, `mobile-native`, `break-ui`, `microinteractions`, `gestures`.
Method: static grep of all CSS/JSX, plus live probe of 10 pages on
`localhost:3000` at 375x812 (`/`, `/events`, `/login`, `/register`, `/cart`,
`/merch`, `/pre-book`, `/reels`, `/contact`, `/register/photographer`).
Report only, nothing was changed. Most fixes land in `app/globals.css`, which
AGENTS.md marks as frozen, so each fix needs an explicit OK or a scoped override.

**Status 2026-11-25 (Imam approved touching globals.css):** fixed input 16px
on coarse pointers, hover-motion gating, transitions ≤300ms with
`--ease-out`, `touch-action: manipulation`, `user-select: none` on buttons,
`themeColor`, ~40px hit area on small auth/footer/"View gallery" links, and the
3D merch canvas now lets vertical swipes scroll (`touch-action: pan-y`).
Guarded by `tests/mobile-css.test.mjs`. Not done: `viewport-fit=cover` was
skipped on purpose (with the default fit Safari already keeps fixed bars out
of the home-indicator zone, and `cover` would push content under the notch in
landscape), `100svh` swaps, overscroll on modals, pre-book `maxLength`, and
the section 4 microinteractions.

What is already good: no `transition: all`, no `scale(0)`, no `ease-in`, a
global `prefers-reduced-motion` kill switch (`globals.css:1053`), keyboard
focus rings everywhere (47 `:focus-visible` rules), tap highlight removed,
login uses `100dvh`, hero uses `100svh`, mobile purchase bar respects
`safe-area-inset-bottom`, StoryViewer has Escape/arrow keys and a focus trap,
no horizontal overflow on any probed page.

## 1. Mobile feel (mobile-native)

| Before | After | Why |
| --- | --- | --- |
| Inputs at 13–14px (`globals.css:385, 452, 489, 1274, 1299, 1372, 1459`; inline styles `account/page.jsx:725`, `studio/admin/page.jsx:669`) | `@media (pointer: coarse) { input, select, textarea { font-size: 16px } }` | iOS Safari zooms into any input under 16px and does not zoom back. Hit on every form probed: login, register, pre-book (7 fields), events/reels search, merch size select (13px). Highest-impact fix, one rule. |
| `viewport = { width, initialScale }` (`app/layout.jsx:25`) | add `viewportFit: 'cover'` and `themeColor: '#080808'` | Without `viewport-fit=cover`, the existing `env(safe-area-inset-bottom)` in `PurchaseMobile.module.css:7` is always 0. Status bar colour does not match the dark UI. |
| No `touch-action: manipulation` on buttons/links | `button, a, [role=button] { touch-action: manipulation }` | Removes residual tap delay on iOS. |
| No `user-select: none` on controls | add on `button, [role=button], .story-tap, .chip` | Long-press on a button selects its label on iOS. |
| No `overscroll-behavior` on `html, body`; only on a few inner scrollers | `overscroll-behavior-y: contain` on modal/sheet bodies (`.story`, `.st-modal-card`, mobile menu) | Scroll chains to the page behind modals. |
| `min-height: 100vh` on `.media-detail-page`, `.booking-page`, `.cart-page`, `.reels-page`, `.event-not-found`, `.route-loading` (`globals.css:49, 301, 364, 367, 648, 677`) | `100svh` (with `100vh` fallback line above) | `100vh` = largest viewport on mobile, so bottom content sits under the URL bar on load. |
| Tap targets under 24px: footer links (`Privacy` 36x15, `Help` 23x15), `Back to home` 74x17, `Forgot password?` 98x17, events filter `Region`/`Year` 18px tall, `View gallery` 92x22 | min 44px hit area via padding (not font size) | WCAG 2.5.8 minimum 24px, Apple HIG 44px. `/events` has 28 undersized targets. |

## 2. Motion (review-animations)

| Before | After | Why |
| --- | --- | --- |
| 69 ungated `:hover` rules in `globals.css`, only 5 gated (e.g. `.primary-link:hover { transform: translateY(-2px) }` :153, `.event-card:hover` :224/:849, `.reel-card:hover` :779, `.modal-close:hover scale(1.05)` :808) | wrap hover motion in `@media (hover: hover) and (pointer: fine)` | On phones the first tap applies hover and it sticks (card stays lifted). |
| `.hero-image img { transition: filter .6s ease, transform 1.2s ease }` (:167) | `transform 300ms cubic-bezier(.23,1,.32,1)` or delete | 1.2s on a hover is far over the 300ms UI budget and `ease` is a weak curve. |
| `.my-image > img { transition: transform .6s ease }` (:94), `.reels-archive-grid img .7s` (:670), `.event-image img .6s` (:713) | 250–300ms with strong ease-out | Over budget, feels sluggish to follow the pointer. |
| `.reel-card:hover img { transform: scale(1.07) }` (:779) | `scale(1.025)` like the other cards | Inconsistent with the rest of the grid (cohesion). |
| `transition: .2s` with no property (:736) | name the property | Implicit `all`. |
| Built-in `ease` / no easing on most `.2s` transitions | shared token `--ease-out: cubic-bezier(.23,1,.32,1)` (already used in `PurchaseMobile.module.css:7`) | Built-in curves are too weak; codebase already has the right curve once. |
| `.bm-toast` keyframes `bm-toast-in .22s ease` (:1594), `.st-toast` `rise .25s` (:1391) | fine for toasts (Sonner exception), but keyframes restart if toasts stack fast | Low priority. |
| `.story` enters with pure `fadeIn` (:1533, :872) | opacity + `scale(.97)` | Pure fade entrance with no transform reads flat. Low priority. |
| Only 18 `:active` rules across the app | add `:active { transform: scale(.97) }` 100–160ms on primary buttons | Touch users get no press feedback once hover is gated. |

Verdict: **Block** on the hover gating and the 0.6–1.2s hover transitions. Nothing feel-breaking beyond that.

## 3. Forms and data (break-ui)

- Pre-book fields have no `maxLength` while the API silently truncates (`api/src/routes/media.js:2430` horse 120, class 160, back number 40, phone 40). A rider who types a long horse name gets a cut-off name on the order with no warning. Add matching `maxLength` on the inputs.
- Pre-book `phone` has `type=tel` but no `autocomplete="tel"`. Rider/horse fields have no `autocomplete`/`autoCapitalize="words"`. Back number should be `inputMode="numeric"`.
- XSS probe (`<script>` in notes) and emoji/macron names render as text, no overflow at 375px. OK.
- Not covered: long event/rider names from the API in event cards (needs seeded data), empty states, slow network.

## 4. Microinteraction and gesture opportunities

| Where | Study / skill | Why |
| --- | --- | --- |
| Admin destructive actions (`ConfirmModal`, AdminSponsors, AdminMerchCatalog) | `microinteractions` hold-to-confirm (1200ms linear) | Replaces a modal for delete/refund, harder to mis-tap. |
| Pre-book steps `01 COVERAGE / 02 RIDER / 03 REVIEW` | tab indicator (250ms ease-out-quint) | Step change has no positional cue. |
| `/faq` uses raw `<details>` (`app/faq/page.jsx:18`) | FAQ panel | Snaps open with no height transition. |
| Merch / pre-book "Add" buttons | text swap button (220ms) | "Add" to "Added" without width jump. |
| StoryViewer (`components/StoryViewer.jsx`) tap zones only | `gestures`: horizontal swipe + swipe-down to close, `touch-action: pan-y` | Users expect swipe in a stories UI on phones. |

## Suggested order

1. Input 16px on coarse pointer + `viewportFit`/`themeColor` (globals + layout, ~6 lines).
2. Gate hover motion and cut 0.6–1.2s transitions to ≤300ms with `--ease-out`.
3. `maxLength` + `autocomplete` on pre-book.
4. Tap target padding on footer, auth links, events filters.
5. Microinteractions/gestures (optional, product decision).

Items 1, 2, 4 touch `globals.css` (frozen). Real-device check on an iPhone is
still needed: emulation cannot reproduce input zoom, sticky hover or safe areas.
