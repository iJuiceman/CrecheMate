# Making CrecheMate reachable from the internet

The parent-facing pages — **registration** (`/intake`) and **booking**
(`/book`) — are designed to be used from anywhere. This guide exposes them
safely over your own domain with HTTPS, using a reverse proxy in front of the
existing containers. Staff pages live on the same site and stay behind the
staff login.

> You chose **port-forward + domain + TLS**. The steps below reflect that.

## What gets exposed

Two things need to be reachable from a browser on the public internet:

- the **web app** (Next.js, container port 3000 → host `5001`)
- the **API** (NestJS, host `5000`) — the browser calls it directly

Postgres (`5434`) must **never** be exposed. Only 80/443 are forwarded at the
router; everything else stays on the LAN.

## 1. DNS

Point two names at your site's public IP (use dynamic DNS if the IP isn't
static):

```
app.creche.example.com   → your public IP
api.creche.example.com   → your public IP
```

## 2. Reverse proxy with automatic HTTPS (Caddy)

Run [Caddy](https://caddyserver.com) on the onsite box — it obtains and renews
Let's Encrypt certificates automatically. `/etc/caddy/Caddyfile`:

```caddyfile
app.creche.example.com {
    reverse_proxy localhost:5001
}

api.creche.example.com {
    reverse_proxy localhost:5000
}
```

Then `sudo systemctl reload caddy`. (nginx/Traefik work too — the shape is the
same: TLS-terminate each hostname and proxy to the port.)

## 3. Router

Forward TCP **80** and **443** from the router to the onsite box's LAN IP. Port
80 is only needed for the Let's Encrypt HTTP challenge; all real traffic is
443. Forward nothing else.

## 4. Point the app at the public API + allow the origin

The browser API URL is baked into the web bundle at **build time**, and the API
only accepts cross-origin calls from origins you list. In `.env`:

```bash
# The public API hostname (what a parent's browser calls).
NEXT_PUBLIC_API_URL=https://api.creche.example.com

# Origins allowed to call the API: the public site, plus localhost for the
# onsite PC and the LAN IP for onsite tablets if you still use them.
CORS_ORIGINS=https://app.creche.example.com,http://localhost:5001,http://192.168.86.124:5001
```

Rebuild the web image (so the new API URL is baked in) and restart:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml build web
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Parents now use `https://app.creche.example.com/book` and
`https://app.creche.example.com/intake`. Staff sign in at the same host.

## 5. Turn on real card payments

External bookings **prepay by card**, so link a live Stripe account first:
sign in as an admin → **Settings → Payments** → paste your `sk_live_`/`pk_live_`
keys. Until then, bookings run in payments **test mode** (stub payment,
auto-succeeds, no money moves) — fine for trialling the flow, not for real
parents.

## Security notes

- Public endpoints (`/intake`, `/bookings/*`) are **rate-limited** (30
  requests/minute per IP) to blunt abuse and bots.
- A booking is only a **request** until a staff member confirms it — an open
  endpoint can't fill your capacity or create real families on its own. The
  prepayment is captured on submit and **refunded automatically** if staff
  decline.
- Public responses never reveal who's already registered; parents type their
  own details and staff match them.
- Keep the box patched and Caddy/containers updated. Consider Cloudflare (proxy
  mode) in front for an extra layer if you expect real internet traffic.
