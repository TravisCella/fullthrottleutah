# Full Throttle Utah — Repository & Product Assessment

**Date:** 2026-07-12
**Scope:** Read-only audit of the codebase at `/Users/traviscella/fullthrottleutah` and reasoning about the live product at www.fullthrottleutah.com. No files were changed except this document.
**Method:** In-repo context read first (CLAUDE.md, prior assessment, comments), then every claim verified against current code with `file:line` evidence. Live-site pixel/mobile testing was **not** performed — UX findings below are code-derived and flagged as such.

**Stack confirmed:** Next.js 14.2.5 (App Router) · Stripe Checkout + manual-capture holds · Google Sheets (bookings) · Google Calendar · Resend (email) · Twilio (direct HTTPS, no SDK) · Firebase Realtime DB + Anthropic API (Inspect tool). Vercel Hobby (2 daily crons; win-back runs on GitHub Actions every 15 min).

---

## PART 1 — WHAT'S BEEN BUILT (verified)

| #   | Feature                                                 | Status                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Server-authoritative pricing**                        | **DONE**                          | Client sends `locationId: loc.id` (`booking.js:510`). Every checkout goes through the single `handleCheckout` → `/api/checkout`, which calls `computeTotal()` (`checkout:129-144`); client `totalPrice` is **only logged**, never charged (`checkout:146-150`); vest fee, loyalty discount, and premiums all recomputed server-side. Charge = `Math.round(priceBreakdown.total*100)` (`checkout:144`). Parity covered by `__tests__/lib/pricing-parity.test.js` (17 cases). |
| 2   | **Inspect endpoint auth + `database.rules.json`**       | **DONE (with one by-design gap)** | `recent-inspections` Bearer-gated + fails closed (`route.js:6-9`); `inspection-submitted` password-gated (`:144-146`); `ai-compare` password-gated before any Anthropic spend (`:141-143`). `database.rules.json` committed as deny-all. **Gap:** `save-inspection` is intentionally unauthenticated (`route.js:11-16`); and deny-all rules are moot for server calls that use `?auth=FIREBASE_DATABASE_SECRET` (legacy secret bypasses rules). See §2 Security.            |
| 3   | **Abandoned-checkout win-back**                         | **DONE**                          | `checkout` writes `/pending-checkouts/{sid}` (`checkout:278-285`). `cron/win-back` filters `pending && !nudged && age≥45m && <expiresAt` (`:102-108`), **re-checks live Stripe session status** before nudging (`:128-135`), marks `nudged:true` before send (`:153-156`), cleans up >7-day-stale records (`:213-234`). Auth fails closed on `CRON_SECRET` (`:64-71`). GitHub Actions `*/15` with `--fail`, timeout, concurrency guard (`win-back.yml`).                    |
| 4   | **Admin→Inspect deep link + inspection→hold return**    | **DONE**                          | Admin builds `/inspect?sid=…&mode=checkout&returnUrl=/admin?focus=…&checkedOut=1` (`admin/page.jsx:1047`) and a `mode=return` variant (`:1161`). Inspect appends `inspectionId` back with a same-origin + `/admin`-pathname guard. `charge-deposit` forwards `inspectionId` → `checkoutInspectionId` metadata (`charge-deposit:422`).                                                                                                                                       |
| 5   | **list-bookings 365-day pagination + 60s cache + bust** | **DONE**                          | `oneYearAgo`, `MAX_SESSIONS=1000` (`:124-125`), paginates to ceiling (`:143-158`); module cache `CACHE_TTL_MS=60_000` (`:45-48`, served `:120`, written `:312`); `bust:true` skips cache (`:120`). Filters canceled/fully-refunded, dedupes by email+date+package, surfaces `inSheet`. **Caveat (in-code):** module cache is per-serverless-instance/best-effort.                                                                                                           |
| 6   | **Webhook Sheet-write-failure SMS alert**               | **DONE**                          | `webhook:200-213` — on Sheet append failure, texts every `OWNER_PHONE_NUMBER` a "Sheet write FAILED / booking is PAID / add manually" message, wrapped in a nested try/catch so the alert path can't throw. **This is the only real-time external alert in the entire pipeline.**                                                                                                                                                                                           |
| 7   | **Backup-card flow (SetupIntent + Elements)**           | **DONE**                          | `create-setup-intent` returns a `client_secret` with `usage:'off_session'` (`:37-42`). `charge-deposit` accepts `paymentMethodId`, retrieves it, **rejects if `pm.customer !== customerId`** (`:273-278`), and bypasses `selectBestCard` so it can't re-pick the declined card. `@stripe/react-stripe-js` + `@stripe/stripe-js` in deps; Elements UI in admin.                                                                                                              |
| 8   | **Two-way SMS chat**                                    | **DONE**                          | Phone-index O(1) resolution (`twilio/incoming` + `checkout:297-314`), MessageSid-keyed idempotent Firebase writes, correct HMAC-SHA1 timing-safe signature validation (`lib/twilio-signature.js`, fails closed), consent-gated send (`send-message:59-61`), inline owner alerts with anti-spam gates. Confirmed working live.                                                                                                                                               |

**Bottom line on Part 1:** everything on the list is genuinely shipped and wired — no orphaned or half-merged features. The only asterisks are the intentional `save-inspection` open endpoint and the fact that `database.rules.json` doesn't actually gate server access (both explained below).

---

## PART 2 — CURRENT-STATE AUDIT

### 1. Money & Correctness

**Strong.** Pricing is server-authoritative; nothing dollar-valued is trusted from the client for the charge. Deposit-hold idempotency is genuinely good: `inspectExistingHold` checks recorded `securityDepositHoldId` (path A) and falls back to a customer-PI search for orphaned `requires_capture` holds (path B), self-healing metadata without double-charging (`charge-deposit:97-139, 188-235`). Capture/release handle Stripe state-mismatch (`already_captured`/`already_canceled`) gracefully and cap capture at the hold amount (`refund-deposit`).

**Two real issues:**

- **Webhook is NOT idempotent (HIGH).** `addBooking` uses `values.append` with no dedupe key, and the handler has no `event.id`/`session.id` guard. The outer catch returns **500** (`webhook:314-316`), which makes Stripe **retry** — and a retry re-appends a second Sheet row and re-sends the renter + owner SMS and the confirmation email. Under peak-season volume a transient Google/Stripe blip becomes duplicate rows and duplicate customer texts.
- **Metadata key budget is tighter than "35/50" (MEDIUM, money-path).** Checkout writes **37** keys. But the booking PaymentIntent **accretes** keys across its lifecycle: `charge-deposit` adds ~5 (`securityDepositHoldId/Method/Card`, `pickupTimestamp`, `checkoutInspectionId`) and `refund-deposit` capture adds ~7 (`returnTimestamp`, `capturedAmount`, `damageReason`, `returnNotes`, `captureTimestamp`, `externalStripeAction`, `externalStripeActionAt`). Worst case ≈ **49/50**. A capture-with-damage on an externally-touched booking is one key away from a `metadata.update` throw on the money path.

### 2. Security

- **`/api/chat` is an open, unauthenticated Anthropic proxy (HIGH).** No auth, no rate limit, no origin check; the caller controls `system` and `messages` and it bills your `ANTHROPIC_API_KEY` (`chat/route.js:1-18`). This is the single most abusable endpoint — direct, unbounded financial loss to anyone who finds it.
- **Admin auth (MEDIUM–HIGH).** Shared password sent in each request body, stored in `sessionStorage` (`admin/page.jsx:194,290`), compared with a non-timing-safe `!==` (`list-bookings:115`), **no rate limit or lockout**, no session token. "Login" is just the first successful `list-bookings`. Brute-forceable; impact is high (refunds, $1–2K captures, PII).
- **Firebase legacy secret (MEDIUM → CRITICAL if leaked).** `database.rules.json` deny-all is bypassed by every server call's `?auth=FIREBASE_DATABASE_SECRET`. The DB URL is hardcoded in **9 files**; the secret is unscoped and cannot be rotated without editing all 9 at once. It guards all conversations, phone-index, pending-checkouts (names/emails/phones), and inspection photos.
- **`save-inspection` unauthenticated (MEDIUM).** Unlimited arbitrary record creation with embedded base64 images; server-generated IDs prevent overwrite but not write-flooding or stored-content injection into owner emails / the vision model.
- **`submit-review` (MEDIUM, mitigated).** GET returns the renter's name by `bookingId`; POST auto-publishes 5-star reviews. Mitigating factor: `bookingId` = Stripe `cs_…` session id (long, non-enumerable), so practical exposure is low — but there's no identity check on the post.
- **Good:** Twilio inbound signature validation is correct and fails closed; no hardcoded secrets; only `NEXT_PUBLIC_*` (publishable) values reach the browser.
- **Cross-cutting:** no rate limiting anywhere.

### 3. Reliability & Observability

**Weakest area.** There is **no external alerting anywhere except the single Sheet-write-failure SMS** (`webhook:200-213`) — no Sentry, no log drain, no Slack/Discord. Every other failure is discoverable only by manually reading Vercel logs:

- **Owner booking-notification SMS failure is silent (HIGH)** — unlike the Sheet path, there is _no_ backup alert, so a paid booking where the owner text fails means the owner never learns the rental exists.
- **Calendar-event failure is silent (HIGH)** — owner loses the calendar entry for a paid booking.
- Confirmation email failure is swallowed inside the helper; phone-index write failure at checkout is `console.error`-only (breaks future chat matching); Sheet **reads** that fail return `{}`/`false`, masking a Google outage as "no data" (denies loyalty discount, hides bookings).
- The per-step try/catch design (nothing aborts the chain) is good; combined with **no idempotency** and **no observability**, the system is fault-tolerant but blind.

### 4. Data Consistency (three stores)

| Concern                                                             | Source of truth                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Booking existence, amount paid                                      | **Stripe** (sessions; Sheet is enrichment only)                                   |
| Rental status, deposit status, SMS consent                          | **Stripe PI metadata** (Sheet status col only ever holds `CONFIRMED`/`CANCELLED`) |
| Phone→booking (chat), conversations, pending-checkouts, inspections | **Firebase**                                                                      |
| Reminders (pickup/return)                                           | **Google Sheets only** (`getTomorrowsBookings`/`Returns` read the Sheet)          |

**Top 3 drift scenarios that bite operationally:**

1. **NO-SHEET paid bookings (CRITICAL).** Webhook Sheet-write fails → Stripe has the booking, Sheet doesn't → **no pickup/return reminder ever fires**, no loyalty match, `/agreement/[id]` breaks. Discoverable only via the `inSheet:false` badge in `/admin` (or the one-time owner SMS, if _that_ didn't also fail).
2. **Status lives in Stripe, not Sheet (HIGH).** `rentalStatus`/deposit state are in PI metadata; the Sheet only knows CONFIRMED/CANCELLED. Sheet-driven consumers (reminders, repeat-check) are blind to `picked_up`/`returned`.
3. **Phone-index miss/format divergence (MEDIUM).** Checkout indexes as `1XXXXXXXXXX`; `lib/sms.js` formats `+1XXXXXXXXXX`. If the index write was skipped (blank phone / Firebase down), inbound texts land in `/conversations/unmatched`.

### 5. Conversion & UX (mobile-first, ~70% mobile) — _code-derived, not live-tested_

- 7-step wizard in a single 1,890-line `booking.js`. Two canvas signatures (waiver + agreement) and a scroll-gated agreement are the most likely mobile-friction points at 360px — **recommend an actual 360px walkthrough**; I did not test rendering.
- Add-ons **not built**: fuel service, towables (absent from `PACKAGES`/pricing). These are straightforward revenue adds.
- Life-vest sizing exists; loyalty and premiums surface in the price card. Trust signals: `TestimonialsSection` live with one review.

### 6. Growth & SEO

- **Present:** solid `metadata`, OpenGraph, Twitter tags in `layout.js`.
- **Missing (all real gaps for a location-based rental):** no `sitemap.xml`, no `robots.txt`, **no JSON-LD structured data** (LocalBusiness / Product / Offer), and **no per-lake landing pages**. Per-lake pages + `LocalBusiness` schema are the highest-leverage SEO moves — you rent at 13 named lakes and rank for none of them individually.
- Out-of-state / inquiry: Lake Powell is quote-only (Call button, correct); no general inquiry-capture form.

### 7. Code Health

- **Oversized files:** `booking.js` **1,890** lines, `admin/page.jsx` **1,287** lines, `sheets.js` 720, `agreement-text.js` ~25 KB.
- **Duplication:** Firebase DB URL hardcoded in 9 files; `normalizeToE164`/`phoneToKey` duplicated across `twilio/incoming` + `send-message`; owner-phone split-and-trim repeated in webhook, cron, incoming.
- **Tests:** only two files — `pricing-parity` (good money coverage) and `find-booking-pi`. **No test for webhook idempotency, deposit capture/release, or the metadata-key ceiling.**
- **Dependencies (1 CRITICAL):** `npm audit` = 6 vulns (5 moderate, 1 critical). The critical is **Next.js 14.2.5 itself** (cache poisoning GHSA-gp8f-8m3g-qvj9, plus DoS and dev-server info-exposure advisories). A patch bump within 14.2.x clears it. `googleapis`/`uuid` moderate.
- **Dead code:** `full-throttle-inspection-cloud.jsx` is a 1-byte empty file.

### 8. Compliance

- **SMS: strong.** Every customer-facing send routes through `lib/sms.js` (no bypasses), every one is consent-gated, opt-in is genuinely **optional** with a compliant TCPA disclosure and a timestamped `smsOptInDate` persisted in Stripe. Owner alerts correctly ungated.
  - **Doc defect (MEDIUM):** CLAUDE.md/history claim app-level Twilio **21610/STOP** handling — it **does not exist in code** (grep = 0 matches). STOP is enforced only at Twilio's platform layer (functionally fine, but don't rely on app-level suppression).
  - **Scope check:** confirm your A2P 10DLC campaign registration covers **cart-recovery (win-back)** and **review-solicitation** use cases, not just transactional booking notices.
- **Email CAN-SPAM (HIGH ×2):** the **review-request** email (`lib/review-email.js`) and **win-back** email (`lib/win-back-email.js`) are commercial/marketing content but have **no street address** ("Farmington, UT" is city/state only) and **no functional unsubscribe** — win-back's "Reply STOP" is an SMS convention and nothing processes an inbound STOP email. Transactional emails (confirmation, reminders, receipt) are largely exempt and fine.
- Waiver + versioned rental agreement: captured, signed, versioned. Good. Accessibility: not audited.

---

## PRIORITIZED ROADMAP

Effort: **S** ≤ half-day · **M** 1–2 days · **L** 3+ days. Risk flags call out payment/webhook/SMS blast radius.

### P0 — do now (money / security / compliance)

| What                                                                                                                                     | Why                                                                                         | Effort  | Risk                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Lock down `/api/chat`** (origin allow-list + rate limit, or auth; cap `max_tokens`)                                                    | Open door to unbounded billing on your Anthropic account; trivially discoverable            | **S**   | Low — public endpoint, does **not** touch payment/webhook/SMS                                                                      |
| **Add webhook idempotency** (dedupe on `event.id` or `session.id` before Sheet append + sends; stop returning 500 for already-processed) | Prevents duplicate Sheet rows + duplicate customer confirmation SMS/email on Stripe retries | **M**   | **HIGH — touches webhook.** Branch, `npm run build`, and confirm `grep -c constructEvent app/api/webhook/route.js ≥ 1` before push |
| **CAN-SPAM fix on marketing emails** (add valid postal address + working unsubscribe link to review-request & win-back)                  | Two commercial emails currently violate CAN-SPAM; real legal exposure                       | **S–M** | Low technical; touches email send paths only                                                                                       |
| **Bump Next.js to latest 14.2.x patch**                                                                                                  | Clears the critical cache-poisoning CVE (and DoS advisories)                                | **S**   | Low — patch within same minor; run build                                                                                           |

### P1 — high-impact ops / revenue

| What                                                                                                                                           | Why                                                                                           | Effort  | Risk                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------- | ----------------------- |
| **Failure alerting on the booking pipeline** (reuse the Sheet-failure SMS pattern for owner-SMS, calendar, and email failures — or add Sentry) | Today a dropped owner notification or calendar event is silent → missed pickup in peak season | **M**   | Low–Med                 |
| **NO-SHEET drift hardening** (make reminders fall back to Stripe, or add a daily Stripe↔Sheet reconciliation)                                  | A failed Sheet write silently disables all reminders for that customer                        | **M**   | Med — touches reminders |
| **Metadata-key guard / prune** (consolidate lifecycle keys; assert < 50 before `metadata.update`)                                              | ~49/50 worst case; a capture-with-damage can throw on the money path                          | **S–M** | **HIGH — money path**   |
| **Admin auth hardening** (rate limit + lockout; consider a signed session)                                                                     | Brute-forceable shared secret guards refunds/captures/PII                                     | **M**   | Med                     |
| **Firebase: migrate off legacy DB secret → scoped Admin SDK service account**                                                                  | Removes an unscoped, un-rotatable, hardcoded-in-9-files credential                            | **M–L** | Med                     |

### P2 — growth / polish

| What                                                                                        | Why                                                        | Effort  |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------- |
| **SEO: sitemap + robots + JSON-LD `LocalBusiness` + per-lake landing pages**                | Highest-leverage organic growth for a 13-lake rental brand | **M–L** |
| **Add-ons: fuel service, towables**                                                         | Direct revenue per booking                                 | **M**   |
| **Split `booking.js` / `admin/page.jsx`; extract shared `lib/firebase.js` + phone helpers** | Maintainability; reduce duplication/regression risk        | **M**   |
| **Live 360px mobile funnel audit** (signatures, scroll-gate, step count)                    | ~70% mobile; conversion                                    | **S**   |
| Remove dead file; add tests for webhook idempotency + deposit capture                       | Hygiene                                                    | **S**   |

---

## HONEST TECH-DEBT — top 3 most likely to cause a peak-season incident

1. **Webhook non-idempotency.** Stripe retries on any 500, and the handler returns 500 on any unexpected throw. Under volume, one transient Google Sheets/Stripe hiccup → a **second Sheet row and a second confirmation SMS/email to the customer**. It's a _when-not-if_ at scale, it's customer-visible (double texts look unprofessional), and it corrupts the booking list. Highest blast radius.

2. **No observability on the booking pipeline.** Only the Sheet-write step has a backup alert. If the **owner-notification SMS** or the **calendar event** fails, nobody knows a paid rental exists until the customer shows up. In peak season with back-to-back rentals, a single silent failure is a missed pickup and a furious paying customer. You currently find failures by luck.

3. **NO-SHEET drift silently kills reminders.** Because pickup/return reminders read the Sheet _only_, any booking whose Sheet write failed gets **no reminder at all** — and (per #2) you may not know the Sheet write failed. The two debts compound: a booking can be paid, un-reminded, and invisible to the owner simultaneously.

_(Honorable mention: the ~49/50 metadata-key ceiling — a latent throw on the capture path.)_

---

## COMMITTED RECOMMENDATION — next 3, in order

1. **Lock down `/api/chat`.** Cheapest risk-reduction on the board: a small, low-risk change (no payment/webhook/SMS surface) that closes a wide-open, billable abuse vector. Do it first because it's pure downside with a fast fix.

2. **Add webhook idempotency (with a failure-alert follow-through).** This is the highest-blast-radius correctness bug, and peak-season volume + Stripe retries make duplicate rows and duplicate customer texts a matter of time. Highest-risk change on the list, so do it surgically on a branch: build, run the `constructEvent` guard, and confirm no double-processing before pushing.

3. **Add failure alerting across the booking pipeline (owner-SMS / calendar / NO-SHEET).** Once bookings can't double-process, make sure they can't _silently vanish_. Reuse the existing Sheet-failure SMS pattern for the other steps. This directly prevents the missed-pickup / furious-customer scenario during the exact weeks it's most likely.

**Why these three over everything else:** they protect the two things that actually sink a rental business in its busy season — **getting paid correctly without double-billing or duplicate customer comms**, and **never silently losing a booking**. CAN-SPAM and SEO matter and are on the P0/P2 list, but they won't start a fire this weekend. The chat proxy is unbounded financial downside with a cheap fix; idempotency and alerting are the load-bearing reliability gaps under load. Everything else can follow once the money path can't double-fire and the pipeline can't fail in the dark.

---

_Read-only assessment. No application code was modified. Payment-path, webhook, and SMS/A2P changes above are flagged high-risk and should be branched, built, and verified per CLAUDE.md before any deploy._
