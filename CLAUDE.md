# CLAUDE.md — CrecheMate

Standalone creche / childcare management for a single onsite service. Not
multi-tenant (one facility), unlike the Racqueteer platform's creche module.

## What it is

Manages families (guardian + emergency contacts), children (medical notes
encrypted, age computed from birth month/year), attendance as **both**
pre-booked sessions and walk-in drop-ins with capacity enforcement, check-in/
out, and per-child hourly fees paid at the desk (cash/card/eftpos or online
card via Stripe). Individual staff logins with `admin` / `educator` roles.

## Stack & layout

- `apps/api` — NestJS 10 + Prisma 5 + PostgreSQL 16. Port **5000**.
- `apps/web` — Next.js 14 (App Router, Tailwind). Port **5001** (container 3000).
- Postgres **5434** (localhost only). Ports offset from Racqueteer (3000-3002/
  5432) and IRentIT (4000-4002/5433) since all three run on the same box.

## Conventions

- Single facility: no org scoping / RLS. Auth is JWT + roles (RolesGuard).
  Every route needs a token unless `@Public()` (setup-status, first-admin,
  login). `@Roles("admin")` gates settings-write and all of `/staff`.
- First admin is created through the app's one-time setup screen
  (`POST /auth/register-first-admin`, allowed only when zero users exist) —
  no default password is ever seeded. `prisma db seed` only creates default
  FacilitySettings.
- Children's medical notes are encrypted at the app layer
  (`common/encryption.util.ts`, `CHILD_DATA_ENCRYPTION_KEY`, AES-256-GCM).
  Never store them plaintext.
- Age is always computed on read (`common/age.util.ts`) from birthMonth/
  birthYear — never stored, never stale.
- Payments run in **test mode** (honest stub, auto-succeed) unless a real
  `sk_live_` key is set and `PAYMENTS_TEST_MODE=false`. The stub never
  pretends a real charge happened. Real Stripe SDK path is a TODO in
  `payments/payments.service.ts` when going live (needs Stripe Elements on the
  web for a real card form).
- Fee = pro-rata hours × `hourlyRateCents`, finalised at check-out.

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

- Real Stripe SDK + web card form (Elements) for live online payments.
- Receipts/PDF, reporting/exports, daily attendance sheet.
- Parent-facing portal (currently staff-operated only).
- QR check-in, photos, incident/accident logs, immunisation records.
