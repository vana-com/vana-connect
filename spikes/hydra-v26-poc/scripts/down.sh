#!/usr/bin/env bash
# Tear down the POC stack and wipe volumes.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose down -v --remove-orphans
