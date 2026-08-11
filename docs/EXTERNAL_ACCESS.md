# External access (crechemate.tectel.com.au / crecheclient.tectel.com.au)

CrecheMate is exposed the same way as IRentIT and Racqueteer on this box: the
system **nginx** (the only thing on 80/443) reverse-proxies to the app
containers, and **certbot** issues the TLS certificates. Nothing else is
internet-reachable — the app ports stay on `127.0.0.1`.

```
crechemate.tectel.com.au    → staff/admin app   (127.0.0.1:5001)
crecheclient.tectel.com.au  → parent pages only  (127.0.0.1:5001 — /book, /intake)
both  /api/                 → API                (127.0.0.1:5000, /api prefix stripped)
```

## How the API is reached (same-origin `/api`)

The web bundle calls the API at the relative path **`/api`** (`NEXT_PUBLIC_API_URL=/api`).
That means:

- **On a domain:** nginx maps `/api/…` straight to the API (127.0.0.1:5000).
- **On the LAN** (`http://<box-ip>:5001`, no nginx in the path): a Next.js
  rewrite (`apps/web/next.config.js`) proxies `/api/*` to the `api` container.

So the exact same build works under either hostname *and* on the LAN, with no
CORS. The API runs with `trust proxy` so rate-limiting sees the real client IP
via nginx's `X-Forwarded-For`.

## The app side (already done, in this repo)

- `apps/web/next.config.js` — `/api/*` rewrite to the API container.
- `.env` — `NEXT_PUBLIC_API_URL=/api`; `CORS_ORIGINS` includes both HTTPS
  hostnames (belt-and-suspenders; same-origin means CORS isn't normally hit).
- `apps/api/src/main.ts` — `trust proxy` enabled.

Rebuild + redeploy after any of these change:

```bash
cd /home/mal/crechemate
docker compose -f docker-compose.yml -f docker-compose.dev.yml build
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## The nginx side (needs root — run these yourself)

The vhost is committed at `deploy/nginx/crechemate.conf`. Install it, then let
certbot add TLS (it did the same for the other sites):

```bash
sudo cp /home/mal/crechemate/deploy/nginx/crechemate.conf /etc/nginx/sites-available/crechemate.conf
sudo ln -sf /etc/nginx/sites-available/crechemate.conf /etc/nginx/sites-enabled/crechemate.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d crechemate.tectel.com.au -d crecheclient.tectel.com.au
```

certbot obtains the certificate, injects the `listen 443 ssl` blocks, and adds
the port-80 → 443 redirects, then reloads nginx. Renewal is automatic.

Verify:

```bash
curl -I https://crechemate.tectel.com.au           # staff app (login)
curl -I https://crecheclient.tectel.com.au/book    # parent booking
curl -s https://crecheclient.tectel.com.au/api/bookings/config | head -c 100
```

## Prerequisites (already in place here)

- DNS A records for both names → the site's public IP.
- Router forwards TCP 80 + 443 to this box (80 is needed only for the ACME
  challenge).

## Notes

- **Real card payments:** external bookings prepay by card, so link a live
  Stripe account (Settings → Payments) before real parents use it. Until then
  it's payments test mode (stub, no money moves).
- **Locking down the staff site:** it's login-protected (JWT). If you want to
  keep scanners/public out entirely during testing, add a cookie gate to the
  `crechemate.tectel.com.au` server block like `racq.conf` does (basic-auth
  `/gate` that sets a cookie), or restrict by source IP.
