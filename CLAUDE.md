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

## Not yet built (backlog)

- Receipts/PDF, reporting/exports, daily attendance sheet.
- Parent-facing portal beyond self-registration + booking (parents can't yet
  view/manage their own bookings after submitting).
- QR check-in, photos, incident/accident logs, immunisation records.
