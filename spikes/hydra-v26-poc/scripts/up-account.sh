#!/usr/bin/env bash
# Bring up the POC stack in ACCOUNT-APP mode.
#
# Differences vs ./scripts/up.sh:
#   - Layers docker-compose.account.yml on top of docker-compose.yml,
#     so Hydra mounts config/hydra.account.yml (login/consent point at
#     http://localhost:3000/auth/oidc/{login,consent}).
#   - The in-tree login-consent stub is disabled via compose profile.
#   - We do NOT health-check :3000 here; the Next account app is the
#     owner's responsibility (Privy + DB env are required to start it).
#   - The default client registration is intentionally skipped because
#     the original POC redirect URI is for the stub. Use
#     ./scripts/register-memory-app-client.sh (or call register-client.sh
#     with your own env) to register an account-mode client.
#
# Exits non-zero if Hydra does not come up within its budget.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.account.yml)

"${COMPOSE[@]}" up -d --build postgres hydra-migrate hydra

wait_for() {
  local name="$1" url="$2" max="$3"
  echo "[up-account] waiting for ${name} (${max}s budget)..." >&2
  for _ in $(seq 1 "$max"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[up-account] ${name} ready" >&2
      return 0
    fi
    sleep 1
  done
  echo "[up-account] ${name} did not become ready at ${url} within ${max}s" >&2
  echo "[up-account] recent logs:" >&2
  "${COMPOSE[@]}" logs --tail=80 >&2 || true
  return 1
}

wait_for "Hydra public" "http://127.0.0.1:4444/health/ready" 60

echo "[up-account] Hydra is up in account-app mode." >&2
echo "[up-account] Next steps:" >&2
echo "[up-account]   1. Start the Next account app on http://localhost:3000" >&2
echo "[up-account]      with Privy + DB env configured." >&2
echo "[up-account]   2. Register an OAuth client via ./scripts/register-memory-app-client.sh" >&2
echo "[up-account]      (or ./scripts/register-client.sh with your own env)." >&2
echo "[up-account]   3. Drive an authorization-code flow against http://127.0.0.1:4444." >&2
