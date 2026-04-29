#!/usr/bin/env bash
# Bring up the POC stack and wait for Hydra + login-consent to be ready.
# Exits non-zero if either service does not come up within its budget.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d --build

wait_for() {
  local name="$1" url="$2" max="$3"
  echo "[up] waiting for ${name} (${max}s budget)..." >&2
  for _ in $(seq 1 "$max"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[up] ${name} ready" >&2
      return 0
    fi
    sleep 1
  done
  echo "[up] ${name} did not become ready at ${url} within ${max}s" >&2
  echo "[up] recent logs:" >&2
  docker compose logs --tail=80 >&2 || true
  return 1
}

wait_for "Hydra public" "http://127.0.0.1:4444/health/ready" 60
wait_for "login-consent" "http://127.0.0.1:3000/health" 30

./scripts/register-client.sh
echo "[up] stack ready" >&2
