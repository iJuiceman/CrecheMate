#!/usr/bin/env bash
# CrecheMate onsite installer — automates docs/INSTALL.md steps 1–4:
# installs Docker, generates a .env with fresh secrets, and builds + starts
# the stack. Run it from a clone of the repo:
#
#   git clone https://github.com/iJuiceman/CrecheMate.git
#   cd CrecheMate
#   ./deploy/install.sh --domain crecheclient.example.com
#
# --domain is optional (adds the client site to CORS_ORIGINS). It NEVER
# overwrites an existing .env — your encryption key and data depend on it.
# nginx / DNS / router setup is separate: see docs/INSTALL.md step 7.
set -euo pipefail

DOMAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --domain=*) DOMAIN="${1#*=}"; shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!  %s\033[0m\n' "$*"; }

[ -f docker-compose.yml ] && [ -f docker-compose.prod.yml ] || {
  echo "Run this from a CrecheMate checkout (docker-compose files not found)." >&2; exit 1; }

# ── 1. Docker Engine + Compose ───────────────────────────────────────────
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  log "Docker already installed — skipping."
else
  log "Installing Docker Engine + Compose plugin…"
  sudo apt update
  sudo apt -y install ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo rm -f /etc/apt/keyrings/docker.gpg
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt update
  sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER" || true
fi

# Use sudo for docker if this shell isn't in the docker group yet.
if docker info >/dev/null 2>&1; then
  DOCKER="docker"
else
  DOCKER="sudo docker"
  warn "Using sudo for docker (the group change takes effect after you log out and back in)."
fi

# ── 2. .env (never clobbered) ────────────────────────────────────────────
if [ -f .env ]; then
  log ".env already exists — leaving it untouched."
else
  log "Generating .env with fresh secrets…"
  command -v openssl >/dev/null 2>&1 || { echo "openssl is required to generate secrets." >&2; exit 1; }
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; LAN_IP="${LAN_IP:-<server-ip>}"
  CORS="http://localhost:5001,http://${LAN_IP}:5001"
  [ -n "$DOMAIN" ] && CORS="${CORS},https://${DOMAIN}"
  umask 077
  cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
CHILD_DATA_ENCRYPTION_KEY=$(openssl rand -hex 32)
NEXT_PUBLIC_API_URL=/api
CORS_ORIGINS=${CORS}
STRIPE_SECRET_KEY=
PAYMENTS_TEST_MODE=true
EOF
  warn "BACK UP .env NOW — CHILD_DATA_ENCRYPTION_KEY cannot be recovered if lost."
fi

# ── 3. Build + start ─────────────────────────────────────────────────────
log "Building and starting the stack (first build takes a few minutes)…"
$DOCKER compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# ── 4. Wait for health ───────────────────────────────────────────────────
log "Waiting for the app to respond…"
ok=0
for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null http://localhost:5001/api/bookings/config 2>/dev/null; then ok=1; break; fi
  sleep 2
done

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; LAN_IP="${LAN_IP:-<server-ip>}"
if [ "$ok" = 1 ]; then
  log "CrecheMate is up."
  echo "   Staff (LAN):  http://${LAN_IP}:5001/   — open it to create the first admin."
  echo "   Next: expose the parent booking site — docs/INSTALL.md step 7 (nginx + certbot${DOMAIN:+ for ${DOMAIN}})."
else
  warn "The app hasn't responded yet. Check logs:  $DOCKER compose logs api | tail -50"
fi
