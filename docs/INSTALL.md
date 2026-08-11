# CrecheMate — fresh install on an Ubuntu Server (facility deployment)

This is the runbook for putting CrecheMate on a standalone PC/server at the
facility. In this setup:

- **Everything runs locally in Docker** on the facility server.
- **Staff** use it on the **LAN** at `http://<server-ip>:5001` (no internet).
- The **only** thing exposed to the internet is the **parent booking site**
  (`crecheclient.<your-domain>`), served over HTTPS by nginx.

```
                         internet
                            │  (only 80/443 forwarded by the router)
                            ▼
   parents ──► crecheclient.<domain> ─► nginx (TLS) ─┬─► web :5001  (/book, /intake only)
                                                     └─► api :5000  (/api)
   staff (on the LAN) ──► http://<server-ip>:5001 ───► web :5001  (full app)
                                                          └─(/api)─► api :5000
   postgres :5434 and api :5000 are bound to localhost; only the web port is on the LAN.
```

You need: an Ubuntu Server (22.04 or 24.04), a user with `sudo`, a domain you
control, and a router you can configure. Commands are copy‑paste; replace
`crecheclient.tectel.com.au` with your domain and `<server-ip>` with the
server's LAN IP.

---

## Quick path (steps 1–4 automated)

If you'd rather not run steps 1–4 by hand, clone the repo and run the
installer — it installs Docker, generates a `.env` with fresh secrets (it never
overwrites an existing one), and builds + starts the stack:

```bash
cd /opt
sudo mkdir -p crechemate && sudo chown "$USER":"$USER" crechemate
git clone https://github.com/iJuiceman/CrecheMate.git crechemate   # use a GitHub token for the password
cd crechemate
./deploy/install.sh --domain crecheclient.tectel.com.au            # --domain optional
```

Then **back up `.env`** (step 9), do the **first‑run setup** (step 5), and
**expose the parent site** (step 7 — nginx/DNS/router, which stay manual). The
detailed steps below explain each part if you want to do it by hand or
understand what the script did.

---

## 1. Prepare the server

Give the server a **static LAN IP** (or a DHCP reservation) so staff bookmarks
and settings don't change. Then update and install Docker:

```bash
sudo apt update && sudo apt -y upgrade

# Docker Engine + Compose plugin (official repo)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo, and start it on boot
sudo usermod -aG docker $USER
sudo systemctl enable docker
newgrp docker   # or log out and back in
```

Verify: `docker run --rm hello-world` should succeed.

## 2. Get the code

Clone the repo (it's private, so use a GitHub token when prompted for a
password):

```bash
cd /opt
sudo mkdir -p crechemate && sudo chown $USER:$USER crechemate
git clone https://github.com/iJuiceman/CrecheMate.git crechemate
cd crechemate
```

> No git access on the server? From the current box instead:
> `rsync -av --exclude node_modules --exclude .git /home/mal/crechemate/ user@<server-ip>:/opt/crechemate/`

## 3. Configure secrets (`.env`)

Create `.env` from the example and generate strong secrets:

```bash
cd /opt/crechemate
cp .env.example .env

# Generate and print secrets to paste into .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "CHILD_DATA_ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

Edit `.env` (`nano .env`) so it reads:

```bash
POSTGRES_PASSWORD=<paste from above>
JWT_SECRET=<paste from above>
CHILD_DATA_ENCRYPTION_KEY=<paste from above>   # 64 hex chars — NEVER change after go-live

NEXT_PUBLIC_API_URL=/api
CORS_ORIGINS=http://<server-ip>:5001,https://crecheclient.tectel.com.au

STRIPE_SECRET_KEY=
PAYMENTS_TEST_MODE=true
```

> ⚠️ **`CHILD_DATA_ENCRYPTION_KEY` is critical.** It encrypts children's medical
> notes and parent signatures. If you lose it, that data is unrecoverable, and
> if you change it after go‑live, existing encrypted data can't be read. Back
> up `.env` somewhere safe **now** (see step 9).

## 4. Build and start

```bash
cd /opt/crechemate
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

This builds the images and starts postgres, the API, and the web app. The API
applies the database migrations automatically on start. Check everything is up:

```bash
docker compose ps
curl -s -o /dev/null -w "web %{http_code}\n" http://localhost:5001/
curl -s -o /dev/null -w "api %{http_code}\n" http://localhost:5001/api/bookings/config
```

Both should be `200`.

## 5. First‑run setup

From any browser on the LAN, open **`http://<server-ip>:5001/`**. On a fresh
install it lands on the setup screen. Create the first **admin** account
(username + password — no email needed).

Then, signed in as admin, go to **Settings** and configure:

- **Service name, timezone, opening hours, hourly rate, capacity.**
- **Courts** — add each court by name (e.g. `Pickleball 1`, `Padel 2`). These
  become the dropdown staff pick when booking.
- **Waiver** — replace the placeholder with your centre's wording (have it
  reviewed).
- **Staff** — add educator/admin accounts for your team.

## 6. Staff access on the LAN

Staff (front desk, tablets, other PCs) use **`http://<server-ip>:5001`**.
Bookmark it. Because the API is same‑origin (`/api`), nothing else needs to be
configured for staff.

Firewall (optional but recommended):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Notes on exposure:
- Postgres (`5434`) and the API (`5000`) are bound to **localhost** — never on
  the LAN or internet.
- The web port (`5001`) is on the LAN for staff. It is **not** internet‑exposed
  because the router forwards only 80/443 (next step). (Docker‑published ports
  bypass `ufw`, so this is enforced by the router, not the firewall.)

## 7. Expose the parent booking site (nginx + HTTPS)

**DNS + router first:**
- Point an **A record** `crecheclient.tectel.com.au` → your facility's public IP
  (use a dynamic‑DNS updater if the IP isn't static).
- On the router, **forward TCP 80 and 443** to `<server-ip>`. Forward nothing
  else.

**nginx + certbot:**

```bash
sudo apt -y install nginx certbot python3-certbot-nginx

# Install the client-only vhost (serves ONLY /book and /intake)
sudo cp /opt/crechemate/deploy/nginx/crecheclient.conf /etc/nginx/sites-available/crecheclient.conf
# If your domain differs, edit the server_name in that file first:
#   sudo nano /etc/nginx/sites-available/crecheclient.conf
sudo ln -sf /etc/nginx/sites-available/crecheclient.conf /etc/nginx/sites-enabled/crecheclient.conf

# Optional: stop nginx serving its default page to unknown hostnames
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx

# Obtain + install the TLS certificate (auto-renews)
sudo certbot --nginx -d crecheclient.tectel.com.au
```

Verify from anywhere:

```bash
curl -I https://crecheclient.tectel.com.au/book          # 200
curl -s https://crecheclient.tectel.com.au/ -o /dev/null -w "%{redirect_url}\n"   # -> /book
```

Parents now book at **`https://crecheclient.tectel.com.au`**. The staff app is
**not** reachable there — any non‑booking path redirects to `/book`.

## 8. Turn on real card payments (when ready)

External bookings prepay by card. Until you link Stripe they run in **test
mode** (stub payments, no real money). To go live: sign in as admin →
**Settings → Payments** → paste your live `sk_live_` / `pk_live_` keys.

## 9. Backups (do this before go‑live)

Two things must be backed up:

1. **The database** — a daily dump, kept off the server:

   ```bash
   # one-off test
   docker compose -f /opt/crechemate/docker-compose.yml exec -T postgres \
     pg_dump -U crechemate crechemate | gzip > ~/crechemate-$(date +%F).sql.gz
   ```

   Automate with cron (`crontab -e`):

   ```
   15 2 * * *  cd /opt/crechemate && docker compose -f docker-compose.yml exec -T postgres pg_dump -U crechemate crechemate | gzip > /opt/crechemate-backups/db-$(date +\%F).sql.gz
   ```

   (`mkdir -p /opt/crechemate-backups` first, and copy these off‑site.)

2. **`/opt/crechemate/.env`** — especially `CHILD_DATA_ENCRYPTION_KEY`. Store it
   securely off the server. A DB backup is useless without this key.

To restore on a new box: install per steps 1–4 with the **same `.env`**, then
`gunzip -c db-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U crechemate crechemate`.

## 10. Survives reboot

`docker` is enabled on boot (step 1) and the containers use
`restart: unless-stopped`, so the whole stack comes back after a power cycle.
nginx is enabled by default. Test it: `sudo reboot`, then re‑check step 4.

---

## Updating to a newer version later

```bash
cd /opt/crechemate
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Database migrations run automatically on API start. Take a DB backup (step 9)
before updating.

## Quick troubleshooting

| Symptom | Check |
| --- | --- |
| Staff page won't load on the LAN | `docker compose ps`; `curl http://localhost:5001/`; server has the expected static IP |
| Booking site can't be reached externally | DNS A record → your public IP; router forwards 80/443 to `<server-ip>`; `sudo nginx -t` |
| certbot fails | Port 80 must reach the server from the internet during issuance; DNS must already resolve |
| API errors after update | `docker compose logs api | tail -50` (migrations run here) |
| Payments not charging real cards | Settings → Payments shows "Linked" with live keys; otherwise it's test mode |

Architecture and API details live in [EXTERNAL_ACCESS.md](EXTERNAL_ACCESS.md)
and the repo `CLAUDE.md`.
