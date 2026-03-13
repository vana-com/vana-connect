#!/usr/bin/env sh
set -eu

REPO="${VANA_RELEASE_REPO:-vana-com/vana-connect}"
VERSION="${VANA_VERSION:-}"
BIN_DIR="${VANA_INSTALL_BIN_DIR:-$HOME/.local/bin}"
INSTALL_ROOT="${VANA_INSTALL_ROOT:-$HOME/.local/share/vana}"
RELEASE_API_URL="${VANA_RELEASE_API_URL:-https://api.github.com/repos/$REPO/releases/latest}"
RELEASE_BASE_URL="${VANA_RELEASE_BASE_URL:-https://github.com/$REPO/releases/download}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --bin-dir)
      BIN_DIR="$2"
      shift 2
      ;;
    --install-root)
      INSTALL_ROOT="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd curl
need_cmd tar

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux) PLATFORM="linux" ;;
  Darwin) PLATFORM="darwin" ;;
  *)
    echo "Unsupported operating system: $OS" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) TARGET_ARCH="x64" ;;
  arm64|aarch64) TARGET_ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

if [ -z "$VERSION" ]; then
  VERSION="$(
    curl -fsSL "$RELEASE_API_URL" |
      sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' |
      head -n 1
  )"
fi

if [ -z "$VERSION" ]; then
  echo "Unable to resolve a release version for $REPO" >&2
  exit 1
fi

ASSET_BASE="vana-$PLATFORM-$TARGET_ARCH"
ARCHIVE_NAME="$ASSET_BASE.tar.gz"
CHECKSUM_NAME="$ARCHIVE_NAME.sha256"
DOWNLOAD_BASE="$RELEASE_BASE_URL/$VERSION"
ARCHIVE_URL="$DOWNLOAD_BASE/$ARCHIVE_NAME"
CHECKSUM_URL="$DOWNLOAD_BASE/$CHECKSUM_NAME"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

echo "Installing $ASSET_BASE from $VERSION"
curl -fsSL "$ARCHIVE_URL" -o "$TMP_DIR/$ARCHIVE_NAME"
curl -fsSL "$CHECKSUM_URL" -o "$TMP_DIR/$CHECKSUM_NAME"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$TMP_DIR" && sha256sum -c "$CHECKSUM_NAME")
elif command -v shasum >/dev/null 2>&1; then
  EXPECTED="$(awk '{print $1}' "$TMP_DIR/$CHECKSUM_NAME")"
  ACTUAL="$(shasum -a 256 "$TMP_DIR/$ARCHIVE_NAME" | awk '{print $1}')"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "Checksum verification failed" >&2
    exit 1
  fi
else
  echo "Missing checksum verifier: expected sha256sum or shasum" >&2
  exit 1
fi

mkdir -p "$INSTALL_ROOT/releases/$VERSION" "$BIN_DIR"
RELEASE_DIR="$INSTALL_ROOT/releases/$VERSION"
EXTRACTED_DIR="$TMP_DIR/$ASSET_BASE"

rm -rf "$RELEASE_DIR"
tar -xzf "$TMP_DIR/$ARCHIVE_NAME" -C "$TMP_DIR"

if [ ! -d "$EXTRACTED_DIR" ]; then
  echo "Unexpected archive layout: missing $EXTRACTED_DIR" >&2
  exit 1
fi

mkdir -p "$RELEASE_DIR"
cp -R "$EXTRACTED_DIR/." "$RELEASE_DIR"

ln -sfn "$INSTALL_ROOT/releases/$VERSION" "$INSTALL_ROOT/current"
ln -sfn "$INSTALL_ROOT/current/vana" "$BIN_DIR/vana"

echo "Installed vana to $BIN_DIR/vana"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo ""
    echo "$BIN_DIR is not on your PATH."
    echo "Add this line to your shell profile:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

echo ""
echo "Next step:"
echo "  vana status"
