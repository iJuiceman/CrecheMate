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
  anywhere at `/book`: they pick a date and time within opening hours (up to a
  configurable maximum session length — 2 hours by default — with a live price
  and availability check), enter their and their child's details
  (AU phone validated, birth month/year dropdowns), and **pay by card — the
  booking is confirmed straight away, with no staff approval step**. A parent can
  **book several children in one session and one payment** (an “Add another
  child” button; the total is per-child fee × number of children). The court
  isn't asked for online — instead a prominent reminder makes clear *creche is
  for players and the creche time must match your court booking*; staff capture
  the actual court at check-in. Family records are matched by parent phone
  number (reused for repeat parents, created on first booking). If a session
  happens to fill in the moment between two parents paying, the later payment is
  **automatically refunded** in full. Staff also take bookings over the phone
  from the same page (“Take a booking”). Public endpoints are rate-limited and
  never reveal who's already registered. See
  [docs/EXTERNAL_ACCESS.md](docs/EXTERNAL_ACCESS.md) to expose it on your
  domain.
- **Cancellation policy.** Cancelling a paid booking refunds 100% if it's more
  than a configurable window (default 24 h) before the session start, or a
  configurable percentage (default 50%) if later. Card refunds are issued
  automatically through Stripe; the window and percentage are set under Settings.
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
  child carries **birth month + year** (picked from dropdowns, matching the
  online booking form; the age is computed, never stale),
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
- **Bookings calendar.** The Bookings page opens on a month calendar that's
  **colour-coded by how busy each day is** (a teal heat scale, with the number
  of confirmed bookings on each day), so current and upcoming demand is obvious
  at a glance. Click any day to load that day's confirmed bookings below; today
  is outlined, a coral dot flags days with online requests still awaiting
  confirmation, and the header shows the upcoming/this-month totals with
  month navigation.
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
- **Incidents** (all staff): a log of anything that happens during or after a
  visit — staff record what they saw, or what a **parent reported at the desk**
  (with the parent's name). Each entry ties to a child (or "no specific
  child"), when it occurred, and **tick-box categories** (fall/trip, bump,
  cut/graze, bite, allergic reaction, illness, behavioural) plus an **"Other"**
  option with a required description. Free-text details are **encrypted at
  rest** like medical notes. Entries are permanent records — only an admin can
  delete one.
- **Finance & Xero export** (admin): a cash-basis view of money actually
  collected over any date range — collected / refunded / net, outstanding and
  waived, split by payment method, with every transaction listed. Export as a
  **Xero sales-invoice CSV** (matches Xero's official import template —
  *Business → Invoices → Import*, no Xero developer setup needed), a plain
  **transactions CSV**, or a **PDF financial report**. Invoice numbers are
  deterministic so re-importing an overlapping range never duplicates;
  refunded online prepayments export as an invoice + credit-note pair that
  nets to zero. The Xero revenue **account code, GST treatment and invoice
  prefix** are configurable under Settings (approved child care is GST-free;
  a casual club creche may not qualify — ask your bookkeeper).
- **Reports** (admin): a Reports section with a date-range picker and tabs for
  **Financials** (fees collected / outstanding / waived, by payment method,
  online prepayments + refunds), **Attendance & occupancy** (sessions, hours,
  drop-in vs booked, no-shows, peak occupancy vs capacity, court usage),
  **Families & children** (active families, children by age, new registrations,
  waiver status), and **Online bookings & staff** (requests confirmed/declined
  with refunds, and who checked children in/out). Each tab has summary tiles,
  charts, and a one-click **CSV export** to hand to your accountant.
- **Audit log** (admin): an append-only trail of everything that changes state
  in the app — who, what, when, from where — including denied and failed
  attempts and public (parent) submissions. Filter by date, staff member,
  action, or failures-only, and expand any entry for the request detail.
  Sensitive values (passwords, medical notes, signatures, Stripe keys) are
  never stored; entries can't be edited or deleted and are pruned to a
  configurable retention window (`AUDIT_RETENTION_DAYS`, default ~2 years).
- **Settings** (admin): service name, capacity, hourly rate, cancellation policy
  (late-cancel window + refund %), opening hours, timezone, ABN, courts
  pick-list, waiver wording, Stripe account, and Xero export coding (account
  code, tax type, invoice prefix).

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

- Children's medical/allergy notes (and waiver signatures, incident details,
  the Stripe secret) are encrypted at the application layer before they ever
  reach the database (`CHILD_DATA_ENCRYPTION_KEY`). A boot-time canary detects a
  wrong/rotated key and warns loudly rather than silently serving empty notes.
- JWT auth on every route (`@Public()` marks the few open ones — setup status,
  first-admin, login); admin-only routes are role-guarded. Each request
  re-checks the account against the database, so a **suspended or demoted staff
  member loses access immediately**, not when their token expires.
- Login is constant-time against account enumeration, returns a single generic
  error, and is **rate-limited** (10/min/IP) against brute force. All routes sit
  behind a global request-rate limit; public parent routes are tighter still.
- **Card payments** are verified server-side against Stripe (status, amount,
  currency) and **bound to the exact booking** they pay for (metadata reference
  + a unique DB constraint), so a payment can't be replayed across bookings.
- CSV/Xero exports are **formula-injection-safe** (spreadsheet formula cells are
  neutralised) so an attacker-chosen name can't execute when a file is opened.
- Behind a reverse proxy the app trusts `X-Forwarded-For` for real client IPs;
  when exposed directly it doesn't (`TRUST_PROXY=false`), so the audit IP and
  rate-limit key can't be spoofed.
- Postgres is bound to localhost only.
- Security- and money-critical logic (auth/RBAC, payment verification, fee
  rounding, audit redaction, CSV safety, finance accounting) is covered by a
  unit test suite: `cd apps/api && npm test`.

## Data model

`User` (staff) · `Guardian` (parent) → `Child` → `EmergencyContact` ·
`Attendance` (booking / drop-in with check-in/out, fee, payment) ·
`Incident` (staff- or parent-reported, tick-box categories, encrypted details) ·
`AuditLog` (append-only trail of every state-changing request) ·
`FacilitySettings` (the single service's settings).
