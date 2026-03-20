#!/usr/bin/env bash
# Check if the demo GIF may be stale relative to CLI output changes.
# Run from repo root. Exits 0 always (advisory, not blocking).

set -euo pipefail

GIF="docs/vhs/demo.gif"
TAPE="docs/vhs/demo.tape"

# Source paths that affect what the CLI prints in human mode.
# If these change and the GIF doesn't, it's probably stale.
WATCHED_PATHS=(
  "src/cli/"
  "docs/vhs/fixtures/"
  "docs/vhs/demo.tape"
)

if [ ! -f "$GIF" ]; then
  echo "demo-freshness: GIF does not exist yet. Render with: vhs $TAPE"
  exit 0
fi

gif_commit=$(git log -1 --format=%H -- "$GIF" 2>/dev/null || true)

if [ -z "$gif_commit" ]; then
  echo "demo-freshness: GIF exists but is not tracked by git."
  exit 0
fi

changed=$(git log --oneline "$gif_commit"..HEAD -- "${WATCHED_PATHS[@]}" 2>/dev/null | head -5)

if [ -n "$changed" ]; then
  echo "demo-freshness: GIF may be stale. CLI output files changed since last GIF update."
  echo ""
  echo "  Last GIF update: $(git log -1 --format='%h %s (%cr)' -- "$GIF")"
  echo "  Changes since:"
  echo "$changed" | sed 's/^/    /'
  echo ""
  echo "  Re-render: vhs $TAPE"
fi
