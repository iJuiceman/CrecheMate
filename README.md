# CrecheMate

A **standalone creche / childcare management** program for a single service,
built to run on an onsite PC or server. It handles families, children (with
medical/allergy notes and computed ages), guardians and emergency contacts,
pre-booked sessions **and** walk-in drop-ins, live capacity, check-in/out, and
fees with payment taken at the desk (cash / card / EFTPOS / online card).

Unlike the creche add-on inside the Racqueteer platform, CrecheMate is a
self-contained product: it captures full **parent/guardian** and **emergency
contact** details, needs no court booking, and runs on its own.

## What's built

- **Staff sign-in with roles.** Individual accounts; **admin** manages
  settings and staff, **educator** does day-to-day work. First run shows a
  one-time setup screen to create the first admin (no default password ever
  ships). Passwords are bcrypt-hashed; a suspended account can't sign in; the
  last active admin can't be locked out.
- **Families & children.** Register a family in one step — the parent/guardian
  (name, relationship, phone, email, address) plus their first child. Each
  child carries **birth month + year** (the age is computed, never stale),
  **allergies/medical requirements encrypted at rest** (AES-256-GCM), and one
  or more **emergency contacts** (name, relationship, phone, and whether
  they're authorised to collect the child). Add more children, edit anyone,
  search by child or parent name / phone.
- **Attendance — both models.**
  - *Drop-in:* check a child straight in from the roster ("Check a child in")
    or their family page.
  - *Pre-booked:* book a child for a date + time window; check them in on
    arrival.
  - **Capacity** is enforced on both — check-in is refused when the service is
    full, and a booking is refused when its window is already full.
- **Today's roster** (the main desk screen): live "in care now" count vs.
  capacity, each child's **age, medical flags in red, parent name/phone, and
  emergency contacts**, time in care and a running fee estimate, plus
  expected-today and finished-today lists. Auto-refreshes every 15 s.
- **Fees & payment.** A per-child **hourly rate** (site-configurable) is
  charged pro-rata; the fee is finalised at check-out from the actual time in
  care. Take payment at the desk as **cash / card / EFTPOS**, or an **online
  card** payment via Stripe. Runs in **payments test mode** by default
  (online payments auto-succeed with a stub, so the whole flow works with no
  Stripe account) — set a real `sk_live_` key and `PAYMENTS_TEST_MODE=false`
  to take real cards. Unpaid checkouts are tracked as outstanding; a fee can
  also be waived.
- **Settings** (admin): service name, capacity, hourly rate, opening hours,
  timezone, ABN.

## Stack

- **API:** NestJS + Prisma + PostgreSQL (`apps/api`) — port **5000**.
- **Web:** Next.js (`apps/web`) — port **5001**.
- **Database:** PostgreSQL 16, localhost-only (port **5434**).
- Single-service / single-tenant by design (it's one onsite creche), so no
  org multi-tenancy — just staff accounts and roles.

## Run it (Docker)

```bash
cp .env.example .env      # then edit — set POSTGRES_PASSWORD, JWT_SECRET,
                          # and CHILD_DATA_ENCRYPTION_KEY (openssl rand -hex 32)

docker compose -f docker-compose.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.dev.yml build
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

The API container applies database migrations on start, so a fresh box comes
up ready. Open **http://localhost:5001**, complete the one-time admin setup,
and you're running.

### Local development

```bash
npm install
docker compose -f docker-compose.yml up -d postgres
cd apps/api && npx prisma migrate dev && npx prisma db seed   # default settings
npm run start:dev                                             # API on :5000
# in another shell:
cd apps/web && npm run dev                                    # web on :3000
```

## Security notes

- Children's medical/allergy notes are encrypted at the application layer
  before they ever reach the database (`CHILD_DATA_ENCRYPTION_KEY`).
- JWT auth on every route (`@Public()` marks the few open ones — setup status,
  first-admin, login); admin-only routes are role-guarded.
- Login is constant-time against account enumeration and returns a single
  generic error.
- Postgres is bound to localhost only.

## Data model

`User` (staff) · `Guardian` (parent) → `Child` → `EmergencyContact` ·
`Attendance` (booking / drop-in with check-in/out, fee, payment) ·
`FacilitySettings` (the single service's settings).
