# Connector Version Tracking & Update Patterns

_As of March 16, 2026_

## How Production CLIs Show "Update Available"

| CLI                       | Format                                    | Example                                                     |
| ------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| **npm outdated**          | `Package Current Wanted Latest` table     | `vue 2.6.10 2.7.16 3.5.28`                                  |
| **brew outdated**         | `package (installed) < available`         | `node (20.5.0) < 20.6.0`                                    |
| **apt list --upgradable** | `pkg/repo new-ver [upgradable from: old]` | `brave-browser/stable 1.40.113 [upgradable from: 1.40.107]` |
| **pip list --outdated**   | `Package Version Latest Type` table       | `setuptools 39.2.0 40.4.3 wheel`                            |
| **rustup update**         | `toolchain status - compiler`             | `stable updated - rustc 1.79.0`                             |

Key distinction: npm differentiates "Wanted" (safe auto-update within semver range) from "Latest" (absolute latest, may be breaking). This is the most informative format.

## Update Mechanics

| CLI        | Strategy                         | Version Check                        |
| ---------- | -------------------------------- | ------------------------------------ |
| **npm**    | Registry lookup against lockfile | Only downloads if version changed    |
| **brew**   | Downloads fresh, caches bottles  | SHA256 verified before extraction    |
| **apt**    | Repository metadata check first  | Built-in GPG + checksum verification |
| **rustup** | Channel metadata check           | Downloads only changed components    |

All re-download on update (none maintain old+new side-by-side). The difference is whether they check before downloading.

## Checksum Verification

**Blocking (synchronous) is universal.** Every major package manager verifies checksums before installing, not after. The pattern:

```
1. Download artifact
2. Verify checksum immediately
3. Mismatch -> error + exit(1)
4. Match -> extract and use
```

Async verification is only used for bulk operations (e.g., verifying hundreds of files in parallel). For single-file CLIs, blocking is correct.

## Schema Evolution Patterns

Production tools follow a consistent playbook:

1. **Add new fields as optional with defaults** -- old consumers keep working
2. **Never remove fields without deprecation** -- warn for 2+ versions first
3. **Semantic versioning for format changes** -- major bump = breaking change
4. **Provide migration paths explicitly** -- npm prints "Run `npm update` to use new lock file format"

Real example: pip 22.3 removed `--format=freeze` with `--outdated` because the freeze format couldn't show "Latest" version. Migration path: use `--format=json | jq` instead.

## Recommendations for Vana CLI

### Version Display

```
$ vana connector list --check-updates

  stripe-data       v1.2.0 -> v1.2.3 available (patch)
  facebook-graph    v2.1.0 -> v2.2.0 available (minor)
  google-workspace  v3.0.0 -> v4.0.0 available (MAJOR)
```

### Local Lock File

Store in `~/.vana/connectors.lock`:

```json
{
  "connectors": {
    "stripe-data": {
      "version": "1.2.0",
      "checksum": "sha256:abc123...",
      "downloaded_at": "2026-03-15T10:30:00Z"
    }
  }
}
```

- Download once, verify checksum, cache locally
- Re-download only if registry version changes or checksum mismatch
- Show `[cached] stripe-data@1.2.0` when using cached version
- Show `[updated] stripe-data: 1.2.0 -> 1.2.3` when downloading new version

### Update Commands

```bash
vana connector list --check-updates   # like brew outdated / npm outdated
vana connector update stripe-data     # update specific
vana connector update                 # update all
```

### Checksum Verification

Synchronous, blocking. Download connector -> verify checksum -> use connector. Fail immediately on mismatch. No async/background verification needed for single connectors.

## Key Takeaways

1. Show current + available versions side-by-side with update type (patch/minor/major)
2. Lock files with checksums eliminate redundant downloads and enable integrity verification
3. Blocking checksum verification is the correct default
4. Schema changes should be additive; use semver for breaking changes
