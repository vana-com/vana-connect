# CLI Transcripts

Generated review artifacts for the human-mode CLI. These are deterministic
fixture-based captures — not live runs.

Refresh with:

```bash
pnpm demo:transcripts
```

For the full review index, see [CLI-REVIEW-SURFACE.md](CLI-REVIEW-SURFACE.md).

---

## Foundational

### `vana --help`

<!-- BEGIN:help -->

```
$ vana --help

Usage: vana [options] [command]

Connect sources, collect data, and inspect it locally.

Options:
  -v, --version               Print CLI version
  -h, --help                  display help for command

Commands:
  version [options]           Print CLI version
  connect [options] [source]  Connect a source and collect data
  sources [options] [source]  List supported sources, or show detail for one
                              source
  collect [options] [source]  Re-collect data from a previously connected source
  status [options]            Show runtime and Personal Server status
  doctor [options]            Inspect local CLI, runtime, and install health
  setup [options]             Install or repair the local runtime
  data                        Inspect collected datasets, paths, and summaries
  logs [options] [source]     Inspect stored connector run logs
  server [options]            Manage Personal Server connection
  help [command]              display help for command

Quick start:
  vana connect           Connect a source and collect data
  vana sources           Browse available sources
  vana status            Check system health

Data:
  vana data list         List collected datasets
  vana data show <src>   Inspect a dataset

Server:
  vana server            Personal Server status and management

More:
  vana doctor            Detailed diagnostics
  vana logs [source]     View run logs
  vana setup             Install or repair runtime
```

<!-- END:help -->

### `vana data --help`

<!-- BEGIN:data-help -->

```
$ vana data --help

Usage: vana data [options] [command]

Inspect collected datasets, paths, and summaries

Options:
  -h, --help               display help for command

Commands:
  list [options]           List locally available collected datasets
  show [options] <source>  Show a collected dataset
  path [options] <source>  Print the local path for a collected dataset

Examples:
  vana data list
  vana data show github
  vana data path github --json
```

<!-- END:data-help -->

### `vana setup`

<!-- BEGIN:setup -->

```
$ vana setup

Vana Connect setup
Runtime
The local runtime is already installed.
  Browser:       /opt/playwright/chromium-1208/chrome-linux64/chrome

  Next: `vana connect github`
```

<!-- END:setup -->

---

## State and diagnostics

### `vana status`

<!-- BEGIN:status -->

```
$ vana status

Vana Connect

  Runtime:       installed
  Personal Server: not connected
  Sources:       0 connected, 1 needs attention

  Next: Browse available sources with `vana sources`.
```

<!-- END:status -->

### `vana doctor`

<!-- BEGIN:doctor -->

```
$ vana doctor

Vana Connect doctor
Summary
  CLI:           0.8.1
  Channel:       stable
  Install:       Development checkout
  Runtime:       installed
  Personal Server: available
  Tracked sources: 1
  Attention:     1
  Connected:     0
  Headed sessions: Unavailable
  Managed profiles: Available
  Screenshots:   Available

Checks
  CLI:           Version 0.8.1
  Runtime:       Browser available at /opt/playwright/chromium-1208/chrome-linux64/chrome
  Personal Server: http://localhost:8080
  Executable:    Present at /usr/local/bin/node
  Data home:     Present at ~/.dataconnect
  State file:    Present at ~/.dataconnect/vana-connect-state.json
  Connector cache: Present at ~/.dataconnect/connectors
  Browser profiles: Missing at ~/.dataconnect/browser-profiles
  Logs:          Present at ~/.dataconnect/logs
  Tracked sources: 1 source in local state
  Latest issue:  GitHub: Checksum mismatch

Needs attention
GitHub unavailable
  Checksum mismatch for GitHub connector script.
  Updated:       <timestamp>
  Run log:       ~/.dataconnect/logs/fetch-github-<timestamp>.log

Paths
  Executable:    /usr/local/bin/node
  Data home:     ~/.dataconnect
  State file:    ~/.dataconnect/vana-connect-state.json
  Connector cache: ~/.dataconnect/connectors
  Browser profiles: ~/.dataconnect/browser-profiles
  Logs:          ~/.dataconnect/logs

Lifecycle
  Upgrade:       git pull && pnpm install && pnpm build
  Uninstall:     Remove the local checkout and any generated ~/.dataconnect state.

  Next: Check overall status with `vana status`.
```

<!-- END:doctor -->

### `vana logs`

<!-- BEGIN:logs -->

```
$ vana logs

Run logs (1)

Need attention (1)

Needs attention (1)
GitHub unavailable
  Path:          ~/.dataconnect/logs/fetch-github-<timestamp>.log
  Updated:       <timestamp>

  Next: Inspect the latest issue log with `vana logs github`.
```

<!-- END:logs -->

---

## Discovery

### `vana sources`

<!-- BEGIN:sources -->

```
$ vana sources

Available sources (9)

Ready now (1) · Browser login (8)

Ready now (1)
GitHub recommended
  Your GitHub profile, repositories, and starred repositories.

Browser login (8)
ChatGPT
  Your email, memories, and all conversations from ChatGPT.
Instagram
  Your Instagram profile, posts, and ad interests.
LinkedIn
  Your LinkedIn profile, experience, education, skills, languages, and connections.
Oura Ring
  Your Oura Ring readiness scores, sleep data, and daily activity.
Shop
  Your Shop app order history.
Spotify
  Your Spotify library, playlists, listening history, and preferences.
Uber
  Your Uber trip history and receipts.
YouTube
  Your YouTube profile, subscriptions, playlists, playlist items, liked videos, watch later list, and recent watch history.

  Next: `vana connect github`
```

<!-- END:sources -->

### `vana sources github`

<!-- BEGIN:sources-github -->

```
$ vana sources github

GitHub new

Your GitHub profile, repositories, and starred repositories.

  Version:       1.1.3
  Export frequency: unknown
  Auth mode:     terminal
  Company:       github

  Next: `vana connect github`
```

<!-- END:sources-github -->

---

## Post-success data surfaces

### `vana data list`

<!-- BEGIN:data-list -->

```
$ vana data list

Collected data (2)

GitHub [synced]
  Profile: tnunamak
  Repositories: 2
  Latest repos: vana-connect, data-connectors
  Starred: 0
  Updated:       Mar 14, 2026, 8:10 AM
  Path:          ~/.dataconnect/last-result.json

Spotify [local]
  Profile: tnunamak
  Playlists: 2
  Playlists: Data Portability, Build Flow
  Updated:       Mar 13, 2026, 4:23 PM
  Path:          ~/.dataconnect/spotify-result.json

  Next: `vana data show github`
```

<!-- END:data-list -->

### `vana data list` (clean machine)

<!-- BEGIN:data-list-empty -->

```
$ vana data list

Collected data

  No datasets yet.

  Next: `vana connect github`
```

<!-- END:data-list-empty -->

### `vana data show github`

<!-- BEGIN:data-show-github -->

```
$ vana data show github

GitHub data

  Profile: tnunamak
  Repositories: 2
  Latest repos: vana-connect, data-connectors
  Starred: 0

  Path:          ~/.dataconnect/last-result.json
  Updated:       Mar 14, 2026, 8:10 AM

  Next: `vana data path github`
```

<!-- END:data-show-github -->

### `vana data show github` (missing)

<!-- BEGIN:data-show-github-missing -->

```
$ vana data show github

No collected dataset found for GitHub. Run `vana connect github` first.

  Next: `vana connect github`
```

<!-- END:data-show-github-missing -->

### `vana data path github`

<!-- BEGIN:data-path-github -->

```
$ vana data path github

~/.dataconnect/last-result.json
```

<!-- END:data-path-github -->

---

## Connect flows

### Successful interactive path

<!-- BEGIN:connect-github-success -->

```
$ vana connect github

  Connect GitHub

  ✓ Signed in
  ✓ Profile
  ✓ Repositories — 8 found
  ✓ Starred — 0 found

  ✓ Connected GitHub.
  Collected your GitHub data and synced it to your Personal Server.

  Next: vana data show github
```

<!-- END:connect-github-success -->

### Interactive-required / `--no-input` path

<!-- BEGIN:connect-github-no-input -->

```
$ vana connect github --no-input

  Connect GitHub


  ✕ GitHub needs credentials. Run without --no-input to authenticate.
```

<!-- END:connect-github-no-input -->

### `--json --no-input` path

<!-- BEGIN:connect-github-json-no-input -->

```
$ vana connect github --json --no-input

{"type":"setup-check","runtime":"installed"}
{"type":"outcome","status":"connector_unavailable","source":"github","reason":"..."}
```

<!-- END:connect-github-json-no-input -->

### Unavailable connector

<!-- BEGIN:connect-steam -->

```
$ vana connect steam

  Connect Steam


  ✕ Steam is not available.
  See what's ready: vana sources
```

<!-- END:connect-steam -->

### Unavailable connector `--no-input` path

<!-- BEGIN:connect-steam-no-input -->

```
$ vana connect steam --no-input

  Connect Steam


  ✕ Steam is not available.
  See what's ready: vana sources
```

<!-- END:connect-steam-no-input -->

### Runtime error

<!-- BEGIN:connect-runtime-error -->

```
$ vana connect github

  Connect GitHub


  ✕ Problem connecting GitHub.
  Connector run failed.
  Retry: vana connect github
```

<!-- END:connect-runtime-error -->

### Legacy/manual step required

<!-- BEGIN:connect-shop -->

```
$ vana connect shop

  Connect Shop


  ✕ Manual step required for Shop.
  Complete the browser step locally, then rerun vana connect shop.
```

<!-- END:connect-shop -->

---

## Collect flows

### `vana collect`

<!-- BEGIN:collect -->

```
$ vana collect

No sources are due for collection.
```

<!-- END:collect -->

### `vana collect github`

<!-- BEGIN:collect-github -->

```
$ vana collect github

Source "github" has not been connected yet. Run `vana connect github` first.
```

<!-- END:collect-github -->

---

## Server management

### `vana server --help`

<!-- BEGIN:server-help -->

```
$ vana server --help

Usage: vana server [options] [command]

Manage Personal Server connection

Options:
  --json                   Output machine-readable JSON
  -h, --help               display help for command

Commands:
  status [options]         Show Personal Server status
  set-url [options] <url>  Save a Personal Server URL
  clear-url [options]      Remove the saved Personal Server URL
  sync [options]           Sync all local-only datasets to your Personal Server
  data [options] [scope]   List scopes stored in your Personal Server

Examples:
  vana server
  vana server set-url http://localhost:8080
  vana server set-url https://ps-abc123.server.vana.org
  vana server clear-url
```

<!-- END:server-help -->

### `vana server status`

<!-- BEGIN:server-status -->

```
$ vana server status

Personal Server

  URL:           http://localhost:8080 (auto-detected)
  Status:        healthy
  Version:       0.0.1
  Uptime:        15h 22m
  Owner:         0x2AC93684679a5bdA03C6160def908CdB8D46792f

  Save with `vana server set-url http://localhost:8080`.

  More: `vana server sync` | `vana server data` | `vana server --help`
```

<!-- END:server-status -->

### `vana server status` (not connected)

<!-- BEGIN:server-status-not-connected -->

```
$ vana server status

Personal Server

  Status:        Not connected

  Set a URL: `vana server set-url <url>`
  Or set VANA_PERSONAL_SERVER_URL environment variable
  Or start a Personal Server on localhost:8080
```

<!-- END:server-status-not-connected -->

### `vana server sync`

<!-- BEGIN:server-sync -->

```
$ vana server sync

github:
    github.profile ✓
    github.repositories ✗ (HTTP 400)
    github.starred ✗ (HTTP 400)
spotify:
    spotify.profile ✓
    spotify.playlists ✗ (HTTP 400)
Synced 2 dataset(s).
```

<!-- END:server-sync -->

### `vana server sync` (nothing pending)

<!-- BEGIN:server-sync-empty -->

```
$ vana server sync

No pending datasets to sync.
```

<!-- END:server-sync-empty -->

### `vana server data`

<!-- BEGIN:server-data -->

```
$ vana server data

  github.profile:   1 version
  spotify.profile:  1 version

  Showing locally-known scopes. Connect your Personal Server for live data.
```

<!-- END:server-data -->

### `vana server data` (empty)

<!-- BEGIN:server-data-empty -->

```
$ vana server data

No scopes found.
```

<!-- END:server-data-empty -->
