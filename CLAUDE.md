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
- External bookings (`bookings` module) are **request → staff-confirm**. Public
  routes (`GET /bookings/config`, `POST /bookings/quote`, `POST /bookings`,
  `POST /bookings/:id/pay`) are `@Public()` and **rate-limited** (ThrottlerGuard,
  30/min; same on intake). A parent **prepays** the estimated fee (Stripe) at
  submit; the request sits in `BookingRequest` (status `pending`, `paid`). Staff
  confirm → `AttendanceService.createConfirmedBooking` (capacity-enforced,
  marks the booking paid) matched to an existing child or a new family; decline
  → `PaymentsService.refund` (no-op for test-mode stubs). Pending paid requests
  count toward a window's availability so a slot isn't oversold before a
  decision; capacity is authoritatively re-checked at confirm.
- Making the parent pages reachable from the internet: see
  `docs/EXTERNAL_ACCESS.md` (reverse proxy + TLS, `NEXT_PUBLIC_API_URL` +
  `CORS_ORIGINS`).
- Children's medical notes are encrypted at the app layer
  (`common/encryption.util.ts`, `CHILD_DATA_ENCRYPTION_KEY`, AES-256-GCM).
  Never store them plaintext.
- Age is always computed on read (`common/age.util.ts`) from birthMonth/
  birthYear — never stored, never stale.
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
  nearest ¼ hour** (`feeFor` in both attendance + bookings services), finalised
  at check-out from actual time in care. Any part-quarter counts as a full 15
  min, so a very short stay bills a 15-min minimum.
- **Court**: `Attendance.court` records which court the parent is on while the
  child is in care (the club is attached to courts) — captured at drop-in /
  check-in, editable live (`POST /attendance/:id/court`), shown prominently on
  the "in care now" roster. `FacilitySettings.courts` (String[]) is the club's
  court list, managed in Settings (add/remove, auto-saved via a courts-only
  PATCH) and surfaced as a **dropdown** at check-in/booking (free-text fallback
  only when no courts are configured).
- **Court booking is mandatory for pre-booked sessions** (creche is only
  offered alongside a court booking): `court` is required on `BookAttendanceDto`
  and `CreateBookingRequestDto`; `courtBookingName` (optional) records the name
  the court is booked under when it differs from the parent. The booking window
  *is* the court booking window (same duration). Walk-in drop-ins keep court
  optional.

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
- **Finance** (`finance` module, **admin-only**; web `(app)/finance` in the
  admin nav): accounting exports on a **cash basis** — transactions belong to a
  window by the day money moved (`paidAt` / refund `decidedAt`, facility-local),
  unlike Reports which slices by service date. Three exports over a date range:
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
  data-viz method), tables, and per-tab CSV export (`lib/csv.ts`).

## Not yet built (backlog)

- Receipts/PDF, reporting/exports, daily attendance sheet.
- Parent-facing portal beyond self-registration + booking (parents can't yet
  view/manage their own bookings after submitting).
- QR check-in, photos, immunisation records.
