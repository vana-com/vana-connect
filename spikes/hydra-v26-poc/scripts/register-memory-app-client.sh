#!/usr/bin/env bash
# Register the mobile memory-app fixture as a public PKCE client on
# the local Hydra admin API. Thin wrapper around register-client.sh
# that pins the env to the memory-app-dev fixture values.
#
#   client_id:       memory-app-dev
#   redirect_uris:   http://localhost:3084/dev/login-with-vana/callback
#                    http://localhost:3084/demo/login-with-vana/callback
#   scopes:          openid profile email offline_access
#   audience:        memory-app-dev
#
# Idempotent (register-client.sh deletes any existing client with the
# same id before recreating it).
set -euo pipefail
cd "$(dirname "$0")/.."

CLIENT_ID="memory-app-dev" \
REDIRECT_URIS_JSON='["http://localhost:3084/dev/login-with-vana/callback","http://localhost:3084/demo/login-with-vana/callback"]' \
SCOPE="openid profile email offline_access" \
AUDIENCE="memory-app-dev" \
CLIENT_NAME="Memory App (dev fixture)" \
  ./scripts/register-client.sh
