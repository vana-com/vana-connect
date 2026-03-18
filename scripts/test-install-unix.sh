#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/artifacts/sea"
WORK_DIR="$ROOT_DIR/.sea-work/test-install-unix"
RELEASE_DIR="$WORK_DIR/local-release/test-release"
HOME_DIR="$WORK_DIR/home"

mkdir -p "$RELEASE_DIR" "$HOME_DIR"

cp "$ARTIFACT_DIR/vana-linux-x64.tar.gz" "$RELEASE_DIR/vana-linux-x64.tar.gz"
cp "$ARTIFACT_DIR/vana-linux-x64.tar.gz.sha256" "$RELEASE_DIR/vana-linux-x64.tar.gz.sha256"

VANA_VERSION=test-release \
VANA_RELEASE_BASE_URL="file://$WORK_DIR/local-release" \
VANA_INSTALL_ROOT="$HOME_DIR/root" \
VANA_INSTALL_BIN_DIR="$HOME_DIR/bin" \
HOME="$HOME_DIR" \
sh "$ROOT_DIR/install/install.sh"

PATH="$HOME_DIR/bin:$PATH" HOME="$HOME_DIR" "$HOME_DIR/bin/vana" status --json >/dev/null

echo "Unix installer smoke test passed"
