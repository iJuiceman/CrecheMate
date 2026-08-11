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

- **Staff sign-in with roles.** Individual accounts signed in by **username**
  (email is optional, kept for receipts/records only); **admin** manages
  settings and staff, **educator** does day-to-day work. First run shows a
  one-time setup screen to create the first admin (no default password ever
  ships). Passwords are bcrypt-hashed; a suspended account can't sign in; the
  last active admin can't be locked out.
- **Online booking (parents + phone).** Parents pre-book a session from
  anywhere at `/book`: they pick a date and time within opening hours (with a
  live price and availability check), enter their and their child's details
  (AU phone validated, birth month/year dropdowns), and **prepay the fee by
  card** (Stripe). Every online booking is a **request** — it appears in a
  staff queue with a suggested match to an existing family; staff **confirm**
  (one click, matching an existing child or creating a new family) or
  **decline** (which **auto-refunds**). Staff also take bookings over the phone
  from the same page (“Take a booking”). Public endpoints are rate-limited and
  never reveal who's already registered. See
  [docs/EXTERNAL_ACCESS.md](docs/EXTERNAL_ACCESS.md) to expose it on your
  domain.
- **Parent self-registration (iPad kiosk).** Hand a parent an iPad at
  `/intake` and they register themselves: their details (name, relationship,
  phone, optional email — no address), the child with **birth month/year
  dropdowns**, allergies/medical needs, and emergency contacts. They then read
  the centre's **waiver** and **sign it with their finger** on a touch signature
  pad. Phone numbers are validated as Australian. The signature is stored
  **encrypted**, tied to the exact waiver version signed; staff can see the
  signed status (and view the signature) on the family page. Admins edit the
  waiver wording under Settings.
- **Families & children.** Staff can also register a family in one step — the
  parent/guardian (name, relationship, phone, email, address) plus their first
  child. Each
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
  emergency contacts**, **which court the parent is on** (captured at check-in
  and editable live, so staff can find them fast), time in care and a running
  fee estimate, plus expected-today and finished-today lists. Auto-refreshes
  every 15 s. Configure your courts as a pick-list under Settings.
- **Court-linked bookings.** A creche **pre-booking must be attached to a court
  booking** — staff (and parents booking online) pick the court and, if the
  court is booked under a different name, record that name. The creche session
  runs for the **same time** as the court booking. (Walk-in drop-ins don't
  require one.) The court a parent is on shows on the roster so staff can find
  them.
- **Fees & payment.** A per-child **hourly rate** (site-configurable) is
  charged for time in care, **rounded up to the nearest ¼ hour** to keep
  billing tidy; the fee is finalised at check-out from the actual time in
  care. Take payment at the desk as **cash / card / EFTPOS**, or an **online
  card** payment via Stripe. An admin **links a Stripe account in-app** under
  Settings → Payments (paste the `sk_`/`pk_` keys; the secret is verified with
  Stripe then stored encrypted) — after that, online payments create a real
  PaymentIntent and the desk collects the card via Stripe Elements, with the
  fee marked paid only once Stripe confirms the charge. With no account linked,
  online payments run in **test mode** (auto-succeed stub, so the whole flow
  works with no Stripe account). Unpaid checkouts are tracked as outstanding; a
  fee can also be waived.
- **Reports** (admin): a Reports section with a date-range picker and tabs for
  **Financials** (fees collected / outstanding / waived, by payment method,
  online prepayments + refunds), **Attendance & occupancy** (sessions, hours,
  drop-in vs booked, no-shows, peak occupancy vs capacity, court usage),
  **Families & children** (active families, children by age, new registrations,
  waiver status), and **Online bookings & staff** (requests confirmed/declined
  with refunds, and who checked children in/out). Each tab has summary tiles,
  charts, and a one-click **CSV export** to hand to your accountant.
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
