# Google Sheet — Operator Guide

How to control **availability**, **cancellations**, and **pricing** from the bookings Google Sheet.

Base prices, deposits, minimum-day rules, lakes, and white-glove fees live in **code** (`lib/pricing.js`, `lib/deposit.js`), not the sheet. The sheet controls the three things below.

> Parsing source of truth: `lib/sheets.js` (`getBookedDates`, `getPremiumDates`, `normalizeDate`). The code reads by **column position**, not header name — so header labels can be anything, but **row 1 is always treated as headers and skipped**. Data starts on **row 2**.

---

## 1. Block dates (make machines unavailable) — `Blocks` tab

Create a tab named exactly **`Blocks`**.

| Col   | Field      | Notes                                                                           |
| ----- | ---------- | ------------------------------------------------------------------------------- |
| **A** | Start date | Required. `M/D/YYYY` or `YYYY-MM-DD`                                            |
| **B** | End date   | Blank = single day. Range is **inclusive** of both ends                         |
| **C** | Package    | Blank or `ALL` = every machine. Otherwise a name token (see "Package matching") |
| **D** | Reason     | Optional, internal only (e.g. "Maintenance", "Owner use")                       |

Blocked dates render as unavailable in the booking calendar.

**Examples:**

```
A            B            C           D
7/20/2026    7/24/2026    ALL         Pioneer Day - owner use
8/1/2026                  Trixx       Trixx in for service
8/15/2026    8/16/2026    GTX         GTX #1 warranty work
```

---

## 2. Free up a booked date — `Sheet1`, column N (status)

Availability is also driven by real bookings in `Sheet1`. To release a booking's dates (e.g. after a cancellation/refund), set that row's **column N** to exactly:

```
CANCELLED
```

This removes it from the calendar **and** from pickup/return reminders. Any other value keeps the dates blocked.

> Don't hand-edit other `Sheet1` columns — the webhook writes those automatically. Column N is the only one you should touch.

---

## 3. Pricing overrides — `Premiums` tab

Create a tab named exactly **`Premiums`**.

| Col   | Field      | Notes                                                                                                |
| ----- | ---------- | ---------------------------------------------------------------------------------------------------- |
| **A** | Start date | Required                                                                                             |
| **B** | End date   | Blank = single day; inclusive                                                                        |
| **C** | Package    | Blank/`ALL` = all, or a name token                                                                   |
| **D** | Amount     | **Per day.** `75` or `+75` = surcharge; `-30` = discount; `20%` / `-10%` = percent of the daily rate |
| **E** | Reason     | Optional; shown to the customer as the promo label                                                   |

⚠️ **Reason column differs between tabs:** Blocks reason = **col D**, Premiums reason = **col E** (Premiums uses D for the amount).

**Examples:**

```
A           B           C           D       E
7/1/2026    7/5/2026    ALL         +75     July 4th surcharge
8/18/2026   8/22/2026   Trixx       -30     Midweek Trixx promo
9/5/2026                Spark Duo   15%      Labor Day weekend
```

---

## Package name matching (important)

Matching is **case-insensitive substring, in both directions**. Use these exact tokens in column C to avoid over-matching:

| To target                      | Use in column C |
| ------------------------------ | --------------- |
| All machines                   | blank or `ALL`  |
| Sea-Doo Spark Trixx (3UP) only | `Trixx`         |
| Spark Duo only                 | `Spark Duo`     |
| GTX Limited Duo only           | `GTX`           |

⚠️ **Do NOT use bare `Spark`** — it matches _both_ the Spark Duo and the Trixx (both names contain "spark"). Use `Spark Duo` or `Trixx` to be specific.

---

## Rules that apply to all three

- **Dates:** `M/D/YYYY` or `YYYY-MM-DD` (a real Google Sheets date cell also works). Ranges include both the start and end day.
- **Tabs are optional:** if `Blocks` or `Premiums` doesn't exist, the code silently ignores it. They only take effect when the tab is named exactly `Blocks` / `Premiums`.
- **Row 1 is always skipped** as headers — never put real data in row 1.
- **Latency:** availability/pricing are cached briefly, so edits appear within a minute or two, not instantly.

---

## What the sheet does NOT control (these are in code)

| Setting                                | Where it lives                                          |
| -------------------------------------- | ------------------------------------------------------- |
| Base rates (weekday/weekend/multi-day) | `lib/pricing.js` → `PACKAGES`                           |
| Security deposits                      | `lib/pricing.js` `deposit` field (via `lib/deposit.js`) |
| Minimum-day rules (per lake)           | `lib/pricing.js` → `LOCATIONS` (`minDays`)              |
| Lakes offered + white-glove fees       | `lib/pricing.js` → `LOCATIONS`                          |
| Holiday surcharge windows              | `lib/pricing.js` → `HOLIDAYS`                           |
| 25+ renter age policy                  | `app/booking.js` + `app/api/checkout/route.js`          |

_Last updated: 2026-07-18._
