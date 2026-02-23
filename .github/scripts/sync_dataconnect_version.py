#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")
DOWNLOAD_VERSION_PATTERN = re.compile(
    r"""(?:export\s+)?const\s+DOWNLOAD_VERSION\s*=\s*['"]([^'"]+)['"];"""
)


def normalize_version_tag(tag: str) -> str:
    normalized = tag.strip()
    if normalized.startswith("v"):
        normalized = normalized[1:]
    if not VERSION_PATTERN.fullmatch(normalized):
        raise ValueError(f"Invalid DataConnect release tag: {tag!r}")
    return normalized


def update_download_version(path: Path, version: str) -> bool:
    content = path.read_text(encoding="utf-8")
    matches = list(DOWNLOAD_VERSION_PATTERN.finditer(content))
    if len(matches) != 1:
        raise RuntimeError(
            f"Expected exactly 1 DOWNLOAD_VERSION declaration in {path}, found {len(matches)}"
        )

    current_version = matches[0].group(1)
    if current_version == version:
        return False

    updated_content = DOWNLOAD_VERSION_PATTERN.sub(
        f'const DOWNLOAD_VERSION = "{version}";',
        content,
        count=1,
    )
    path.write_text(updated_content, encoding="utf-8")
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync DOWNLOAD_VERSION in connect config with latest release tag."
    )
    parser.add_argument("--latest-tag", required=True, help="Latest release tag from GitHub API.")
    parser.add_argument(
        "--config-path",
        default="connect/src/config/config.ts",
        help="Path to config.ts containing DOWNLOAD_VERSION constant.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    version = normalize_version_tag(args.latest_tag)
    changed = update_download_version(Path(args.config_path), version)
    if changed:
        print(f"Updated DOWNLOAD_VERSION to {version}")
    else:
        print(f"DOWNLOAD_VERSION already up to date ({version})")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
