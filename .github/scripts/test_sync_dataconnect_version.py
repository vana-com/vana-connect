#!/usr/bin/env python3
from __future__ import annotations

import tempfile
import sys
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from sync_dataconnect_version import normalize_version_tag, update_download_version


class SyncDataConnectVersionTests(unittest.TestCase):
    def test_normalize_strips_v_prefix(self) -> None:
        self.assertEqual(normalize_version_tag("v0.7.21"), "0.7.21")

    def test_normalize_accepts_plain_semver(self) -> None:
        self.assertEqual(normalize_version_tag("1.2.3"), "1.2.3")

    def test_normalize_accepts_prerelease_semver(self) -> None:
        self.assertEqual(normalize_version_tag("v1.2.3-rc.1"), "1.2.3-rc.1")

    def test_normalize_rejects_invalid(self) -> None:
        with self.assertRaises(ValueError):
            normalize_version_tag('v1.2.3"oops')

    def test_update_replaces_single_declaration(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            config_path = Path(tmp_dir) / "config.ts"
            config_path.write_text(
                'const DOWNLOAD_VERSION = "0.7.20";\n',
                encoding="utf-8",
            )

            changed = update_download_version(config_path, "0.7.21")

            self.assertTrue(changed)
            self.assertEqual(
                config_path.read_text(encoding="utf-8"),
                'const DOWNLOAD_VERSION = "0.7.21";\n',
            )

    def test_update_replaces_export_const_single_quote_declaration(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            config_path = Path(tmp_dir) / "config.ts"
            config_path.write_text(
                "export const DOWNLOAD_VERSION = '0.7.20';\n",
                encoding="utf-8",
            )

            changed = update_download_version(config_path, "0.7.21")

            self.assertTrue(changed)
            self.assertEqual(
                config_path.read_text(encoding="utf-8"),
                'const DOWNLOAD_VERSION = "0.7.21";\n',
            )

    def test_update_noop_when_already_current(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            config_path = Path(tmp_dir) / "config.ts"
            config_path.write_text(
                'const DOWNLOAD_VERSION = "0.7.21";\n',
                encoding="utf-8",
            )

            changed = update_download_version(config_path, "0.7.21")

            self.assertFalse(changed)

    def test_update_fails_when_missing_declaration(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            config_path = Path(tmp_dir) / "config.ts"
            config_path.write_text("const OTHER = 1;\n", encoding="utf-8")

            with self.assertRaises(RuntimeError):
                update_download_version(config_path, "0.7.21")

    def test_update_fails_when_multiple_declarations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            config_path = Path(tmp_dir) / "config.ts"
            config_path.write_text(
                'const DOWNLOAD_VERSION = "0.7.20";\n'
                'const DOWNLOAD_VERSION = "0.7.21";\n',
                encoding="utf-8",
            )

            with self.assertRaises(RuntimeError):
                update_download_version(config_path, "0.7.22")


if __name__ == "__main__":
    unittest.main()
