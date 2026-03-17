# Scope Display & Source Discovery UX

_As of March 16, 2026_

## Progressive Disclosure: List -> Info -> JSON

Production CLIs universally follow a three-tier pattern for presenting installable items.

### Tier 1: List (scannable, minimal)

```bash
$ brew list
git    node   python@3.11   vim   wget

$ gh extension list
gh-copilot   v1.0.0   Installed
gh-dash      v3.7.0   Installed
```

Pattern: **name + version/tag + one status field**. No descriptions, no capabilities, no URLs.

### Tier 2: Info (one item, expanded detail)

```bash
$ brew info node
==> node: stable 21.7.1
Fast, unobstructed, and flexible JavaScript runtime
https://nodejs.org/
Installed: /opt/homebrew/Cellar/node/21.7.1 (2,345 files, 78.3MB)
Dependencies: brotli, c-ares, icu4c, libnghttp2, libuv, openssl@3

$ npm view react
react@18.3.1 | MIT | deps: 1 | versions: 1987
React is a JavaScript library for building user interfaces.
https://react.dev/
```

Pattern: **name + version + one-line description + metadata block** (deps, size, URL, tags).

### Tier 3: JSON (machine-readable, everything)

`brew info --json`, `npm view --json`, `docker inspect`, `terraform providers -json`. Complete structured data, no formatting.

| Tier     | Fields                                          | Audience          |
| -------- | ----------------------------------------------- | ----------------- |
| **List** | Name, version, status indicator                 | Humans scanning   |
| **Info** | Name, version, description, category, deps, URL | Humans evaluating |
| **JSON** | All fields including IDs, checksums, timestamps | Scripts, agents   |

## Capabilities/Scopes Display

**terraform plan** shows capabilities as actions with symbols (`+` add, `~` change, `-` destroy). **OAuth consent screens** show scopes as human-readable permissions ("Read your profile", "Access your repositories").

Tools that include descriptions in list output truncate to fit terminal width. No wrapping.

## Recommendations for Vana CLI

### `vana sources list` (Tier 1)

```
NAME       STATUS       LAST COLLECTED    COLLECTS
github     connected    3d ago            repos, commits, stars
spotify    connected    12h ago           listening, playlists
chatgpt    available    --                conversations
twitter    available    --                posts, bookmarks
```

Name, connection status, recency, one-line scope summary. No descriptions.

### `vana sources info <name>` (Tier 2)

```
GitHub
  Status:      connected
  Collected:   3 days ago (weekly recommended)
  Version:     1.2.0
  Category:    developer
  Collects:    repositories, commits, stars, profile
  Auth:        browser session at github.com
  Description: Exports your GitHub activity data.
```

### `vana sources list --json` (Tier 3)

Full structured data including checksums, URLs, selectors, timestamps, frequency metadata.

### Design Principles

1. **List is for scanning** -- 4-5 columns max, truncate descriptions
2. **Info is for deciding** -- everything needed to evaluate
3. **JSON is for machines** -- all fields, no formatting
4. **Scopes as plain language** -- "repos, commits, stars" not "repo:read, commit:list"
5. **Status indicators in list** -- connected/available/error at a glance
6. **Descriptions in info only** -- never in list output
