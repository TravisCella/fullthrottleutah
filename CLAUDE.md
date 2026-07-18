# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This is a live production site with real paying customers — treat every change as production-critical.** Vercel auto-deploys on push to `main`.

## Commands

```bash
npm run dev      # Start Next.js dev server (localhost:3000)
npm run build    # Verify production build — run before pushing
npm run start    # Start production server
```

Env vars live in `.env.local` (pull via `vercel env pull`). Never commit or print env values.

There are no tests or linters configured.

## Environment & Secrets

- Production secrets in `.env.local` are intentionally empty locally; do **not** attempt live API calls (e.g., Stripe, Resend, Twilio) unless the user has confirmed secrets are populated. Use code-based inference and ask the user for required values when needed.

## Code Standards

- Enforce precise null-safety on all edits: use optional chaining (`?.`), explicit `typeof` guards before property access on values that may be strings or objects, and never assume an expanded Stripe object is non-null.
- Use relative URLs (not hardcoded `https://fullthrottleutah.com`) for any internal navigation or deep-link `returnUrl` construction.

## Git Workflow

- Produce clean, atomic commits scoped to the feature or fix at hand. After committing, offer to push and confirm before doing so.
- On branches that touch booking/checkout/webhook, always run `npm run build` and `grep -c 'constructEvent' app/api/webhook/route.js` (must be ≥ 1) before pushing.

## Architecture

**Full Throttle Utah** is a Next.js 14 (App Router) jet ski rental booking site for TW Assets LLC (Farmington, UT). Mobile-first, deployed on Vercel.

**Stack:** Next.js 14.2.5 · Stripe (Checkout Sessions) · Google Sheets (booking DB) · Google Calendar (auto-created events per booking) · Resend (email) · Twilio (SMS — A2P 10DLC approved, direct HTTPS, no SDK) · Firebase Realtime DB + Anthropic API (Full Throttle Inspect damage-detection tool)

### Key data flows

**Booking → Payment:**

1. Customer completes the 7-step wizard in `app/booking.js` (single large client component)
2. On submit, `handleCheckout()` POSTs to `/api/checkout/route.js`
3. Checkout creates/finds a Stripe Customer, creates a Stripe Checkout Session with all booking data stuffed into `payment_intent.metadata`, and returns the hosted checkout URL
4. After payment, Stripe fires a webhook to `/api/webhook/route.js` which: writes a row to Google Sheets → creates a Calendar event → sends renter SMS (if opted in) → sends owner SMS (all phones in `OWNER_PHONE_NUMBER`) → sends confirmation email
5. Customer lands on `/success`

**Stripe metadata is the source of truth** for a booking until it's written to Sheets. The webhook maps metadata keys to Sheet columns. Stripe has a hard **50-key cap** — stay under it. Do not add both camelCase and snake_case versions of the same field.

### Google Sheets schema

**Sheet1** (bookings, cols A–W — do not reorder):

```
A=booking_id, B=date_booked, C=package, D=location, E=start_date, F=end_date,
G=days, H=total_price, I=deposit_paid, J=renter_name, K=renter_email,
L=renter_phone, M=experience, N=status, O=white_glove, P=holiday_surcharge,
Q=loyalty_discount, R=sms_opt_in, S=vest_sizes, T=pickup_time, U=return_time,
V=rental_agreement_version, W=rental_agreement_signed
```

**Reviews** tab (cols A–N). Two optional tabs the code silently ignores if missing: **Blocks** (manual date blocks) and **Premiums** (custom pricing overrides).

Dates from Sheets come back as `"5/22/2026"` or `"2026-05-22"` — always route through `normalizeDate()` in `lib/sheets.js`. Always use `valueRenderOption: 'FORMATTED_VALUE'`.

### Booking wizard steps (`app/booking.js`)

`step === -1` = landing page. Steps 0–6:

- 0: Package (Spark Duo or GTX Limited Duo)
- 1: Lake + optional White Glove delivery add-on
- 2: Dates + pickup/return times
- 3: Renter info + vest sizes
- 4: Waiver (8 checkboxes + canvas signature)
- 5: Rental Agreement (scroll-gated + 5 checkboxes + canvas signature)
- 6: Confirm + pay

Pricing is computed inline: `calculatePrice()` for multi-day tiers, `getHolidaySurcharge()` for holiday premiums, 10% loyalty discount for repeat customers (checked via `/api/check-customer`).

### Agreement text

`lib/agreement-text.js` is the single source of truth for rental agreement copy. Imported by the booking wizard, webhook, and `/agreement/[bookingId]/page.jsx`. When the agreement changes materially, bump `AGREEMENT_VERSION` (semver).

### Admin dashboard

`/admin` — password-protected client component. Calls `/api/admin/*` routes for listing bookings, managing Stripe deposit holds (`capture_method: manual`, $1,000 holds via `/admin/hold-deposit`), capturing/releasing/refunding deposits, and moderating reviews. Password checked against `process.env.ADMIN_PASSWORD`.

### Cron / reminders

`/api/cron/pickup-reminder` — fires daily at 14:00 UTC (8 AM MDT) via Vercel Cron. Reads Sheet1 for tomorrow's non-cancelled bookings (America/Denver timezone, DST-aware). Sends each opted-in renter an SMS reminder; sends renters without SMS opt-in a Resend email. After processing renters, sends ONE owner summary SMS to all `OWNER_PHONE_NUMBER` phones listing every pickup with name, package, lake, time, and white-glove flag. Sends nothing if no pickups tomorrow. Accepts `?date=YYYY-MM-DD` query param to override "tomorrow" for testing. Auth: `Authorization: Bearer CRON_SECRET`.

### Environment variables required

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_CREDENTIALS_BASE64        # preferred: base64-encoded service account JSON
GOOGLE_SHEETS_CLIENT_EMAIL       # fallback if above not set
GOOGLE_SHEETS_PRIVATE_KEY        # fallback if above not set
RESEND_API_KEY
ADMIN_PASSWORD
OWNER_PHONE_NUMBER               # comma-separated, receives SMS on every booking
```

## Business rules (enforced server-side in `/api/checkout`)

UI validation is secondary — the server is the authoritative enforcement layer.

- **Packages:** Spark Duo (4 riders max), GTX Limited Duo (6 riders max)
- **Vests:** `EXTRA_VEST_FEE=$15`, `MAX_EXTRA_VESTS=2` spare vests beyond boat capacity; server recomputes fee independently of client
- **White glove delivery:** distance-tiered $150–$750 per lake; Lake Powell = quote-only (Call button, never show a price)
- **Lake Powell:** $200 AIS decon fee auto-added, quagga mussel warning, 30-day quarantine language required
- **Minimum days:** Bear Lake = 2; Flaming Gorge / Sand Hollow / Lake Powell = 3
- **Holiday surcharge:** $75/day for Memorial Day, July 4th, Pioneer Day, Labor Day (defined in `HOLIDAYS` array in `booking.js`)
- **Loyalty discount:** 10% for returning customers matched by email or phone
- **SMS opt-in must remain OPTIONAL** — TCR rule: consent cannot be required to complete a booking. Required consent caused an A2P 10DLC rejection; do not change this.

## Critical pitfalls (each caused a real production incident)

1. **WEBHOOK FILE:** `app/api/webhook/route.js` must contain `stripe.webhooks.constructEvent()`, never `stripe.checkout.sessions.create()`. This has happened twice — both times via a vague "Update route.js" commit that saved checkout code to the wrong path. Each incident broke webhook processing for hours/days. **After any edit near this file, run:** `grep -c 'constructEvent' app/api/webhook/route.js` and confirm the result is ≥ 1 before pushing.
2. **PACKAGE NAME MATCHING:** block/date matching must work in both directions: `a.includes(b) || b.includes(a)`.
3. **DATES FROM SHEETS:** always go through `normalizeDate()` — raw values can be `"5/22/2026"` or `"2026-05-22"`.
4. **FAVICON:** Next.js metadata `icons` is unreliable — keep explicit `<link>` tags in `layout.js` `<head>`.
5. **WEBHOOK METADATA:** reads `payment_intent` metadata with session metadata as fallback; support both camelCase and snake_case field names for backward compatibility with older bookings.
6. **`app/page.js` is a server component** — no `'use client'`. `app/booking.js` owns its own `'use client'` boundary. Adding `'use client'` to `page.js` silently breaks `TestimonialsSection` server-side rendering.
7. **Date math** uses local `new Date(year, month, day)` construction throughout — do not switch to UTC parsing for date-only values.

## Workflow

- Make changes on a branch when touching booking/checkout/webhook; Vercel creates a preview deploy per branch.
- Multi-file features deploy in dependency order: UI (`booking.js`) → checkout → webhook. Confirm each step before the next.
- Run `npm run build` before pushing.
- Travis tests every change live on the real site and confirms explicitly before a feature is considered done.
- Never edit a file from memory of a prior version — read the actual current file first.
