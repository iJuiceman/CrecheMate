# CLAUDE.md — CrecheMate

Standalone creche / childcare management for a single onsite service. Not
multi-tenant (one facility), unlike the Racqueteer platform's creche module.

## What it is

Manages families (guardian + emergency contacts), children (medical notes
encrypted, age computed from birth month/year), attendance as **both**
pre-booked sessions and walk-in drop-ins with capacity enforcement, check-in/
out, and per-child hourly fees paid at the desk (cash/card/eftpos or online
card via Stripe). Individual staff logins by **username** (email is optional,
kept for receipts/records only) with `admin` / `educator` roles. Parents can
**self-register on an iPad kiosk** (`/intake`) — their details + child + emergency
contacts, then read and sign a waiver with their finger — and **pre-book a
session online** (`/book`) with card prepayment, which staff confirm.

## Stack & layout

- `apps/api` — NestJS 10 + Prisma 5 + PostgreSQL 16. Port **5000**.
- `apps/web` — Next.js 14 (App Router, Tailwind). Port **5001** (container 3000).
- **Networking**: the browser calls the API **same-origin at `/api`**
  (`NEXT_PUBLIC_API_URL=/api`). On a domain, the box's system nginx maps `/api/`
  → api:5000; on the LAN, a Next rewrite (`next.config.js`) proxies it. External
  access (`crechemate.tectel.com.au` staff / `crecheclient.tectel.com.au`
  parents) is via nginx + certbot — see `deploy/nginx/crechemate.conf` and
  `docs/EXTERNAL_ACCESS.md`. API runs with `trust proxy` for real client IPs.
- Postgres **5434** (localhost only). Ports offset from Racqueteer (3000-3002/
  5432) and IRentIT (4000-4002/5433) since all three run on the same box.

## Conventions

- Single facility: no org scoping / RLS. Auth is JWT + roles (RolesGuard).
  Every route needs a token unless `@Public()` (setup-status, first-admin,
  login). `@Roles("admin")` gates settings-write and all of `/staff`.
- **JWT re-checks the account on every request** (`jwt.strategy.ts`): `validate`
  loads the user and rejects a suspended/deleted account and returns the
  *current* DB role — so suspending or demoting a staff member takes effect
  immediately, not after the 12h token expiry. Don't revert this to a
  payload-only check.
- **Rate limiting is global** (`ThrottlerGuard` as the first `APP_GUARD`,
  300/min/IP) so unauthenticated request floods on any route are capped before
  the JWT guard would 401-and-audit them. Sensitive public write routes tighten
  it via `@Throttle`: login 10/min, first-admin 5/min, intake + all public
  booking writes 30/min. Add `@Throttle` to any new public write route.
- Staff log in with a **username** (3–40 chars, `a-z0-9._-`), stored/compared
  lower-case. Email is optional and never used for login. The first admin is
  created through the app's one-time setup screen
  (`POST /auth/register-first-admin`, allowed only when zero users exist) —
  no default password is ever seeded. `prisma db seed` only creates default
  FacilitySettings.
- Facility settings are a DB-enforced singleton (unique `singleton` column) —
  never assume `findFirst` uniqueness by convention alone.
- Parent self-registration (`intake` module) is **public** (`@Public()` on
  `GET /intake/info` + `POST /intake`) — it's an iPad kiosk handed to a parent
  with no account. The waiver **signature** (a PNG data URL) is personal data,
  so it's encrypted at rest like medical notes. The waiver text lives on
  FacilitySettings; its `waiverVersion` bumps on every wording change so each
  guardian's `waiverVersion` records exactly what they signed.
- Phone numbers are validated as Australian (`common/phone.validator.ts`,
  `IsAuPhone`) on the intake, booking, and staff family forms; the web mirrors
  the rule in `lib/phone.ts`.
- External bookings (`bookings` module) are **charge-on-book — no staff approval**
  (changed 2026-08-26 from the earlier authorise-hold + staff-approve model).
  Public routes (`GET /bookings/config`, `POST /bookings/quote`, `POST /bookings`,
  `POST /bookings/:id/pay`) are `@Public()` and **rate-limited** (30/min). Flow:
  `POST /bookings` creates a `BookingRequest` (`pending`) with a
  `BookingRequestChild` per child (a parent can book **several children on one
  session + one payment**, up to `MAX_CHILDREN_PER_BOOKING`) and an
  **automatic-capture** PaymentIntent for the **total** (`perChild × N`); the
  card is charged when the parent confirms via Elements; `POST /bookings/:id/pay`
  then `assertSucceeded` (captured, amount = total, bound to `booking:<id>`),
  atomically claims (`updateMany where status=pending` → `confirmed`), and
  **immediately creates the confirmed bookings**. Family records are resolved by
  **parent phone** (`resolveFamily`): reuse an existing guardian with the same
  digits (and reuse a child of theirs by name, else add it), otherwise create a
  new family. The capacity check + all N attendance rows + their
  `bookingRequestChild` links are created in **one `Serializable` transaction**
  (in `payRequest`) so concurrent auto-confirm bookings can't oversell the
  child:staff ratio and a link failure rolls the whole thing back. Each
  attendance: `paymentStatus: paid`, `paymentMethod: online`, `paidAt` = charge
  time, and **`stripePaymentIntentId` NULL** (the shared intent lives on the
  `BookingRequest`, so `@unique` on the attendance still holds; refunds resolve
  the intent via `bookingRequestChild.attendanceId → request`, always a *partial*
  refund of the shared intent). If the session **filled** (or a serialization
  conflict) between charge and create, the payment is **fully refunded** and the
  request declined (nothing was committed). **Court is
  no longer collected online** — the form shows a prominent "creche is for
  players / times must match your court booking" notice; staff capture the actual
  court at check-in (`Attendance.court` stays nullable). The legacy staff
  `confirm`/`decline`/`listRequests` endpoints remain for any pre-existing
  authorised requests but new bookings never enter that state.
- **Cancellation policy**: cancelling a paid booking (`POST /attendance/:id/cancel`)
  refunds 100% if more than `FacilitySettings.lateCancelWindowHours` (default 24)
  before the session start, otherwise `lateCancelRefundPercent` (default 50%).
  Card payments refund via Stripe (partial = pass amount); the amount is recorded
  on `Attendance.refundedCents`/`refundedAt`. Both knobs are admin-editable in
  Settings. Staff-initiated (parents have no login).
- Making the parent pages reachable from the internet: see
  `docs/EXTERNAL_ACCESS.md` (reverse proxy + TLS, `NEXT_PUBLIC_API_URL` +
  `CORS_ORIGINS`).
- Children's medical notes are encrypted at the app layer
  (`common/encryption.util.ts`, `CHILD_DATA_ENCRYPTION_KEY`, AES-256-GCM).
  Never store them plaintext. `decryptField` returns `""` on an undecryptable
  value, so a wrong/rotated key fails silently — `EncryptionHealthService`
  guards this by verifying a stored canary (`FacilitySettings.encryptionCanary`)
  on boot and logging loudly on mismatch. `GET /families` (list) returns only a
  `hasMedicalNotes` boolean; the decrypted note is on the audited detail route
  (`GET /families/:id`) only, so a facility-wide list never bulk-decrypts.
  Deleting a child record is admin-only (like incidents).
- Age is always computed on read (`common/age.util.ts`) from birthMonth/
  birthYear — never stored, never stale.
- **PaymentIntents are bound to what they pay for** (replay guard): `createIntent`
  takes a `reference` (`booking:<id>` / `attendance:<id>`) stamped into Stripe
  metadata (and the test-stub id); `assertSucceeded` re-checks status, amount,
  currency **and** that reference, so a real succeeded intent can't be replayed
  against another same-priced record. `stripePaymentIntentId` is also `@unique`
  on both `Attendance` and `BookingRequest` as a DB-level backstop. Always pass
  the correct reference when adding a new payment path.
- Payments use the real Stripe SDK. An admin links a Stripe account in-app
  under **Settings → Payments** (`POST /settings/stripe`); the secret key is
  validated against Stripe then stored **encrypted** (same AES-256-GCM app key
  as medical notes), the publishable key is stored plain (the browser needs it
  for Stripe Elements). Online payments then create a real PaymentIntent, the
  desk collects the card via Elements (`dashboard/CardPaymentModal.tsx`), and
  the fee is only marked paid after `assertSucceeded` verifies the intent with
  Stripe. With no linked account (and no `STRIPE_SECRET_KEY` env fallback),
  online payments fall back to **test mode**: an honest auto-succeed stub that
  never pretends a real charge happened. `PAYMENTS_TEST_MODE=true` forces the
  env-key fallback off.
- Fee = hours × `hourlyRateCents`, with the billed time **rounded up to the
  nearest ½ hour (30-minute increments)** (`feeFor` in both attendance + bookings
  services), finalised at check-out from actual time in care. Any part-half-hour
  counts as a full 30 min, so a very short stay bills a 30-min minimum.
- **Court**: `Attendance.court` records which court the parent is on while the
  child is in care (the club is attached to courts) — captured at drop-in /
  check-in, editable live (`POST /attendance/:id/court`), shown prominently on
  the "in care now" roster. `FacilitySettings.courts` (String[]) is the club's
  court list, managed in Settings (add/remove, auto-saved via a courts-only
  PATCH) and surfaced as a **dropdown** at check-in/booking (free-text fallback
  only when no courts are configured).
- **Max booking length**: a single pre-booked session is capped at
  `FacilitySettings.maxBookingHours` (default **2h**), enforced server-side on
  both the online (`bookings.validateWindow`) and staff-desk (`attendance.book`)
  paths, surfaced in `GET /bookings/config`, and admin-editable in Settings.
  Walk-in drop-ins are open-ended (the cap is on booked windows, not time in care).
- **Court**: creche is only offered alongside a court booking. `court` is still
  required on the staff **desk** booking (`BookAttendanceDto`), but is **no longer
  collected on the public online form** (`CreateBookingRequestDto` dropped it) —
  the form shows a prominent reminder instead and staff capture the court at
  check-in. The booking window *is* the court booking window (same duration).
  Walk-in drop-ins keep court optional.

## Dev workflow

```bash
docker compose -f docker-compose.yml up -d postgres
cd apps/api && npx prisma migrate dev --name <name> && npx prisma db seed
npm run start:dev            # API :5000
cd apps/web && npm run dev   # web :3000
# Full stack in Docker:
docker compose -f docker-compose.yml -f docker-compose.dev.yml build && \
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

New Prisma models: add a migration; the API container runs
`prisma migrate deploy` on start.

- **Incidents** (`incidents` module, any signed-in staff; web `(app)/incidents`,
  in the all-staff nav): a log of incidents during/after a visit. Each entry:
  optional child, when it occurred, **who reported it** (`staff` | `parent` —
  parents have no logins, so staff record what a parent reports at the desk,
  with the parent's name), tick-box `types` from the fixed list in
  `incidents.dto.ts` (mirrored with labels in web `lib/types.ts`), and free-text
  details — **required when "other" is ticked**, encrypted at rest like medical
  notes since they may describe injuries. Deleting an entry is admin-only;
  entries are otherwise immutable records.
- **Audit log** (`audit` module; web `(app)/audit`, admin nav): append-only
  trail of every **mutation** (POST/PATCH/PUT/DELETE — including denied 401/403
  and failed 4xx/5xx attempts, and public kiosk/booking requests) plus
  sensitive reads (`GET /families/:id`, which exposes decrypted medical notes).
  Captured by **middleware on response-finish** (`audit.middleware.ts`) — NOT
  an interceptor, because guards run before interceptors and denied requests
  would be invisible. Each row: actor (id/username/role from the JWT; null =
  public), ip (real client via trust proxy), user agent, method/path, `action`
  (path with uuids stripped, filterable), first uuid as `targetId`, status,
  duration, and the **redacted** request body — passwords, Stripe keys, medical
  notes, signatures and incident descriptions are replaced with `[redacted]`
  (`REDACT_KEYS`/`REDACT_BY_PATH` in `audit.service.ts`; long strings clipped
  to 300 chars). Reading the log is `GET /audit` (admin-only, filters + paging);
  there is deliberately **no write/delete API** — never add one. Recording is
  fire-and-forget and must never throw into the request pipeline. When adding
  routes with new sensitive body fields, add them to the redact lists.
  **Request detail (body/query) is stored only for authenticated, non-denied
  requests** — unauthenticated or 401/403 requests leave the accountability row
  but no attacker-controlled payload — and each row's detail is capped at ~8 KB.
  Entries are pruned on boot and daily to `AUDIT_RETENTION_DAYS` (default 730).
- **Finance** (`finance` module, **admin-only**; web `(app)/finance` in the
  admin nav): accounting exports on a **cash basis** — transactions belong to a
  window by the day money moved (`paidAt` / refund `decidedAt`, facility-local),
  unlike Reports which slices by service date. Money-in = attendance fees
  (`paidAt`) **plus** online prepayment cash-ins for requests not yet an
  attendance (status pending/declined — confirmed ones are counted as their
  attendance, so no double count); confirmed bookings are dated by the actual
  charge time (`createConfirmedBooking` carries the request's `paidAt`).
  Money-out = refunds of declined prepayments (`decidedAt`). The Xero CSV total
  equals the on-screen net for the same range. Three exports over a date range:
  **Xero sales CSV** (Xero's official sales-invoice import template; import via
  Business → Invoices → Import choosing *Tax Inclusive*), **transactions CSV**
  (client-side via `lib/csv.ts`), and a **PDF report** (`finance.pdf.ts`,
  pdfkit). Invoice numbers are deterministic from row ids
  (`<prefix>-<first-8-of-uuid>`), so re-importing overlapping ranges is
  idempotent — Xero skips numbers it already has. Declined-and-refunded online
  prepayments export as an invoice + credit-note pair (`-B-` / `-R-`, negative
  UnitAmount) netting to zero so both bank transactions reconcile. Account code,
  AU tax type (`GST Free Income` default — approved child care is GST-free, but
  a club creche may not qualify; ask the bookkeeper) and invoice prefix live on
  FacilitySettings, editable under **Settings → Finance — Xero export**.
  Authenticated file downloads go through `api.download()` (fetch + Bearer +
  blob), since plain links can't carry the JWT.
- **Reporting** (`reports` module, **admin-only** via RolesGuard): summary +
  financial + attendance/occupancy + families + online-bookings/staff, over a
  facility-tz date range. Aggregated in memory (small data volumes). The web
  Reports page (`(app)/reports`) has a date-range picker, tabs, KPI tiles,
  inline-SVG charts (`reports/charts.tsx` — teal single-hue for magnitude, a
  validated categorical set for payment-mix/booked-vs-dropin, all per the
  data-viz method), tables, and per-tab CSV export (`lib/csv.ts`). Each tab
  fetches its own endpoint; the tab buttons `setData(null)` on click so a tab
  never renders against the previous tab's differently-shaped data for a frame
  (that caused a render crash). Keep that when adding tabs.
- **Bookings calendar** (`(app)/attendance` + `components/BookingCalendar.tsx`):
  a month heatmap on the bookings page, colour-coded by confirmed-booking count
  per day (teal single-hue scaled against the busier of capacity / busiest day),
  click a day to load its schedule, coral dot = days with pending online
  requests. Backed by `GET /attendance/calendar?from&to` — per-day counts
  (active attendances split booked/drop-in, plus pending requests), grouped by
  `serviceDate` (stored at facility-tz midnight). Child birth month/year are
  dropdowns everywhere (booking, intake, and the staff family add + edit forms).

## Not yet built (backlog)

- Receipts/PDF, reporting/exports, daily attendance sheet.
- Parent-facing portal beyond self-registration + booking (parents can't yet
  view/manage their own bookings after submitting).
- QR check-in, photos, immunisation records.
