#!/usr/bin/env bash
# Register a public PKCE client (no client_secret) on the local Hydra admin API.
#
# Usage: ./scripts/register-client.sh
# Prints the created client ID to stdout. Idempotent: if a client with
# the same client_id already exists, it deletes and recreates it.
set -euo pipefail

ADMIN_URL="${HYDRA_ADMIN_URL:-http://127.0.0.1:4445}"
CLIENT_ID="${CLIENT_ID:-vana-poc-public-client}"
REDIRECT_URI="${REDIRECT_URI:-http://127.0.0.1:8765/callback}"

echo "[register-client] admin=${ADMIN_URL} client_id=${CLIENT_ID}" >&2

# Drop any pre-existing client so reruns are clean.
curl -fsS -X DELETE "${ADMIN_URL}/admin/clients/${CLIENT_ID}" >/dev/null 2>&1 || true

curl -fsS -X POST "${ADMIN_URL}/admin/clients" \
  -H 'content-type: application/json' \
  -d @- <<JSON >/dev/null
{
  "client_id": "${CLIENT_ID}",
  "client_name": "Vana POC Public PKCE Client",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "openid offline_access",
  "redirect_uris": ["${REDIRECT_URI}"],
  "token_endpoint_auth_method": "none"
}
JSON

echo "${CLIENT_ID}"
