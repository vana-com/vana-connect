#!/usr/bin/env sh
set -eu

REPO="${VANA_RELEASE_REPO:-vana-com/vana-connect}"
BRANCH="${VANA_INSTALLER_BRANCH:-feat/connect-cli-v1}"
VERSION="${VANA_VERSION:-}"
SOURCE="${VANA_CONNECT_SOURCE:-github}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --source)
      SOURCE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "Usage: $0 --version <release-tag> [--branch <installer-branch>] [--repo <owner/repo>] [--source <source>]" >&2
  exit 1
fi

TMP_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT INT TERM

HOME_DIR="$TMP_ROOT/home"
BIN_DIR="$TMP_ROOT/bin"
INSTALL_ROOT="$TMP_ROOT/install"
mkdir -p "$HOME_DIR" "$BIN_DIR" "$INSTALL_ROOT"

INSTALLER_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/install/install.sh"

echo "Installing vana from ${REPO}@${VERSION}"
curl -fsSL "$INSTALLER_URL" |
  HOME="$HOME_DIR" sh -s -- \
    --version "$VERSION" \
    --bin-dir "$BIN_DIR" \
    --install-root "$INSTALL_ROOT"

PATH="$BIN_DIR:$PATH"
export HOME="$HOME_DIR"
export VANA_APP_ROOT="$INSTALL_ROOT/current/app"

echo "Checking status"
"$BIN_DIR/vana" status --json >/dev/null

echo "Checking sources"
"$BIN_DIR/vana" sources --json >/dev/null

echo "Checking non-interactive connect for ${SOURCE}"
set +e
CONNECT_OUTPUT="$("$BIN_DIR/vana" connect "$SOURCE" --json --no-input 2>&1)"
CONNECT_EXIT_CODE=$?
set -e
printf '%s\n' "$CONNECT_OUTPUT"

if [ "$CONNECT_EXIT_CODE" -ne 0 ] && [ "$CONNECT_EXIT_CODE" -ne 1 ]; then
  echo "Unexpected vana exit code: ${CONNECT_EXIT_CODE}" >&2
  exit 1
fi

if ! printf '%s\n' "$CONNECT_OUTPUT" | grep -Eq '"status":"(needs_input|legacy_auth|connected_local_only|connected_and_ingested)"'; then
  echo "Unexpected connect outcome for ${SOURCE}" >&2
  exit 1
fi

echo "GitHub release installer smoke test passed"
