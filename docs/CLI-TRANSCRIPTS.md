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
  sources [options]           List supported sources
  status [options]            Show runtime and Personal Server status
  doctor [options]            Inspect local CLI, runtime, and install health
  setup [options]             Install or repair the local runtime
  data                        Inspect collected datasets, paths, and summaries
  logs [options] [source]     Inspect stored connector run logs
  help [command]              display help for command

Start here:
  vana connect
  vana status
  vana data list

Automation:
  vana connect github --json --no-input
  vana sources --json | jq '.sources[] | {id, authMode}'

Support:
  vana doctor
  vana logs

Version:
  0.8.1 (stable, development checkout)
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

→ Runtime
The local runtime is already installed.
  Browser:          /opt/playwright/chromium-1200/chrome-linux64/chrome

→ Next
  • Check overall status with `vana status`.
  • Connect GitHub with `vana connect github`.
```

<!-- END:setup -->

---

## State and diagnostics

### `vana status`

<!-- BEGIN:status -->

```
$ vana status

Vana Connect status

Need attention (2) • Connected (2) • Local only (2)

→ Environment
  Runtime:          installed
  Browser:          /opt/playwright/chromium-1200/chrome-linux64/chrome
  Personal Server:  unavailable

→ Needs attention (2)
Shop [legacy] [manual step]
  Run `vana connect shop` without `--no-input` to complete the manual browser step.
  Updated:          Mar 14, 2026, 8:11 AM
  Run log:          ~/.dataconnect/logs/run-shop-demo.log
Steam [unavailable]
  No connector is available for Steam right now.
  Updated:          Mar 14, 2026, 8:12 AM
  Run log:          ~/.dataconnect/logs/fetch-steam-demo.log

→ Connected (2)
GitHub [interactive] [local]
  Inspect the latest local dataset with `vana data show github`.
  Session:          Saved for faster reconnects.
  State:            Saved locally
  Updated:          Mar 14, 2026, 8:10 AM
  Path:             ~/.dataconnect/last-result.json
Spotify [interactive] [local]
  Inspect the latest local dataset with `vana data show spotify`.
  State:            Saved locally
  Updated:          Mar 13, 2026, 4:23 PM
  Path:             ~/.dataconnect/spotify-result.json

→ Next
  • Complete the manual browser step for Shop with `vana connect shop`.
  • Inspect the latest run log with `vana logs shop`.
  • Review the data you already collected with `vana data list`.
```

<!-- END:status -->

### `vana doctor`

<!-- BEGIN:doctor -->

```
$ vana doctor

Vana Connect doctor

→ Summary
  CLI:              0.8.1
  Channel:          stable
  Install:          Development checkout
  Runtime:          installed
  Personal Server:  unavailable
  Tracked sources:  4
  Attention:        2
  Connected:        2
  Headed sessions:  Unavailable
  Managed profiles: Available
  Screenshots:      Available

→ Checks
  CLI:              Version 0.8.1
  Runtime:          Browser available at /opt/playwright/chromium-1200/chrome-linux64/chrome
  Personal Server:  Unavailable. Connects will stay local until a Personal Server is reachable.
  Executable:       Present at /usr/local/bin/node
  Data home:        Present at ~/.dataconnect
  State file:       Present at ~/.dataconnect/vana-connect-state.json
  Connector cache:  Present at ~/.dataconnect/connectors
  Browser profiles: Present at ~/.dataconnect/browser-profiles
  Logs:             Present at ~/.dataconnect/logs
  Tracked sources:  4 sources in local state
  Latest issue:     Shop: manual step

→ Needs attention
Shop [legacy] [manual step]
  Run `vana connect shop` without `--no-input` to complete the manual browser step.
  Updated:          Mar 14, 2026, 8:11 AM
  Run log:          ~/.dataconnect/logs/run-shop-demo.log
Steam [unavailable]
  No connector is available for Steam right now.
  Updated:          Mar 14, 2026, 8:12 AM
  Run log:          ~/.dataconnect/logs/fetch-steam-demo.log

→ Paths
  Executable:       /usr/local/bin/node
  Data home:        ~/.dataconnect
  State file:       ~/.dataconnect/vana-connect-state.json
  Connector cache:  ~/.dataconnect/connectors
  Browser profiles: ~/.dataconnect/browser-profiles
  Logs:             ~/.dataconnect/logs

→ Lifecycle
  Upgrade:          git pull && pnpm install && pnpm build
  Uninstall:        Remove the local checkout and any generated ~/.dataconnect state.

→ Next
  • Your Personal Server is unavailable, so successful runs will stay local.
  • Check overall status with `vana status`.
  • Inspect the latest issue log with `vana logs shop`.
```

<!-- END:doctor -->

### `vana logs`

<!-- BEGIN:logs -->

```
$ vana logs

Run logs (3)

Need attention (2) • Successful (1) • Local (1)

→ Needs attention (2)
Steam [unavailable]
  Path:             ~/.dataconnect/logs/fetch-steam-demo.log
  Updated:          Mar 14, 2026, 8:12 AM
Shop [manual step]
  Path:             ~/.dataconnect/logs/run-shop-demo.log
  Updated:          Mar 14, 2026, 8:11 AM

→ Successful runs (1)
GitHub [local]
  Path:             ~/.dataconnect/logs/run-github-demo.log
  Updated:          Mar 14, 2026, 8:10 AM

→ Next
  • Inspect the latest issue log with `vana logs steam`.
  • Inspect a successful run with `vana logs github`.
  • Check overall status with `vana status`.
```

<!-- END:logs -->

---

## Discovery

### `vana sources`

<!-- BEGIN:sources -->

```
$ vana sources

Available sources (3)

Connected (2) • With manual step (1)

→ Connected (2)
GitHub [local] [interactive] [installed]
  Exports your GitHub profile, repositories, and starred repositories using Playwright browser automation.
  Inspect with `vana data show github`.
Spotify [local] [interactive] [installed]
  Exports your Spotify playlists using Playwright browser automation.
  Inspect with `vana data show spotify`.

→ Manual steps (1)
Shop [legacy] [installed]
  Exports your Shop app order history using Playwright browser automation.
  Flow: finishes with a manual browser step on this machine.

→ Next
  • Inspect what you already collected with `vana data list`.
  • Complete Shop with `vana connect shop`.
  • Or browse the guided picker with `vana connect`.
```

<!-- END:sources -->

---

## Post-success data surfaces

### `vana data list`

<!-- BEGIN:data-list -->

```
$ vana data list

Collected data (2)

Dataset (2) • Local only (2) • Synced (0)

GitHub [local]
  Profile: tnunamak
  Repositories: 2
  Latest repos: vana-connect, data-connectors
  Starred: 0
  State:            Saved locally
  Updated:          Mar 14, 2026, 8:10 AM
  Path:             ~/.dataconnect/last-result.json

Spotify [local]
  Profile: tnunamak
  Playlists: 2
  Playlists: Data Portability, Build Flow
  State:            Saved locally
  Updated:          Mar 13, 2026, 4:23 PM
  Path:             ~/.dataconnect/spotify-result.json

→ Next
  • Inspect GitHub with `vana data show github`.
  • Or print its path with `vana data path github`.
  • Connect another source with `vana sources`.
```

<!-- END:data-list -->

### `vana data list` (clean machine)

<!-- BEGIN:data-list-empty -->

```
$ vana data list

Collected data

No local datasets collected yet.

→ Next
  • Collect your first dataset with `vana connect github`.
  • Check overall status with `vana status`.
```

<!-- END:data-list-empty -->

### `vana data show github`

<!-- BEGIN:data-show-github -->

```
$ vana data show github

GitHub data

→ Summary
  • Profile: tnunamak
  • Repositories: 2
  • Latest repos: vana-connect, data-connectors
  • Starred: 0

  Path:             ~/.dataconnect/last-result.json
  Updated:          Mar 14, 2026, 8:10 AM
  State:            Saved locally

→ Next
  • Print the path with `vana data path github`.
  • Use `vana data show github --json | jq` for structured inspection.
  • Reconnect GitHub with `vana connect github`.
  • Connect another source with `vana sources`.
  • Inspect other datasets with `vana data list`.
  • Check overall status with `vana status`.
```

<!-- END:data-show-github -->

### `vana data show github` (missing)

<!-- BEGIN:data-show-github-missing -->

```
$ vana data show github

No collected dataset found for GitHub. Run `vana connect github` first.

→ Next
  • Collect data with `vana connect github`.
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

→ Preparing
Finding a connector for GitHub...
Connector ready.
Exports your GitHub profile, repositories, and starred repositories using Playwright browser automation.
  If needed, Vana Connect will ask for details in this terminal. Those details stay local to this machine.
  Found an existing GitHub session. Reusing it if it is still valid...

→ Connecting
Connecting to GitHub...
Collecting your data...
  Checking GitHub login...
  Login confirmed. Collecting data in background...
  Profile (1/3): Fetching profile...
  Repositories (2/3): Fetched 2 repositories
  Starred (3/3): Fetched 0 starred repositories
✓ Connected GitHub.
  Collected your GitHub data and saved it locally.

→ Collected
  • Profile: tnunamak
  • Repositories: 2
  • Latest repos: vana-connect, data-connectors
  • Starred: 0

→ Saved locally
  Path:             ~/.dataconnect/last-result.json
  Session:          Saved for faster reconnects.
  Server:           Unavailable, so this run stayed local.
  Run log:          ~/.dataconnect/logs/run-github-<timestamp>.log

→ Next
  • Inspect the data with `vana data show github`
  • Connect another source with `vana sources`
  • Inspect the run log with `vana logs github`.
  • Or check overall status with `vana status`
```

<!-- END:connect-github-success -->

### Interactive-required / `--no-input` path

<!-- BEGIN:connect-github-no-input -->

```
$ vana connect github --json --no-input

Connect GitHub

→ Preparing
Finding a connector for GitHub...
Connector ready.
Exports your GitHub profile, repositories, and starred repositories using Playwright browser automation.
  If needed, Vana Connect will ask for details in this terminal. Those details stay local to this machine.

→ Connecting
Connecting to GitHub...
Collecting your data...
  Checking GitHub login...

→ Input required
GitHub needs additional input before it can connect.
  Because `--no-input` is enabled, Vana stopped before prompting in this terminal.

→ Next
  • Run `vana connect github` without `--no-input`.
  • Inspect the latest run log with `vana logs github`.
  • Or check overall status with `vana status`.
```

<!-- END:connect-github-no-input -->

### Session reuse attempt in `--no-input` path

<!-- BEGIN:connect-github-session-reuse-no-input -->

```
$ vana connect github --json --no-input

Connect GitHub

→ Preparing
Finding a connector for GitHub...
Connector ready.
Exports your GitHub profile, repositories, and starred repositories using Playwright browser automation.
  If needed, Vana Connect will ask for details in this terminal. Those details stay local to this machine.
  Found an existing GitHub session. Reusing it if it is still valid...

→ Connecting
Connecting to GitHub...
Collecting your data...
  Checking GitHub login...

→ Input required
GitHub needs additional input before it can connect.
  Because `--no-input` is enabled, Vana stopped before prompting in this terminal.

→ Next
  • Run `vana connect github` without `--no-input`.
  • Inspect the latest run log with `vana logs github`.
  • Or check overall status with `vana status`.
```

<!-- END:connect-github-session-reuse-no-input -->

### Legacy/manual interactive path

<!-- BEGIN:connect-shop -->

```
$ vana connect shop

Connect Shop

→ Preparing
Finding a connector for Shop...
Connector ready.
Exports your Shop app order history using Playwright browser automation.
  If needed, Vana Connect will open a local browser session on this machine.
  Found an existing Shop session. Reusing it if it is still valid...

→ Manual step required
Shop still needs a manual browser step on this machine.
  This source needs a manual browser step, but no local display server is available. Run this command in a desktop session or use xvfb-run.

→ Next
  • Run this command in a desktop session.
  • Or retry with `xvfb-run -a vana connect shop`.
  • Inspect the latest run log with `vana logs shop`.
  • Or check overall status with `vana status`.
```

<!-- END:connect-shop -->

### Legacy/manual `--no-input` path

<!-- BEGIN:connect-shop-no-input -->

```
$ vana connect shop --json --no-input

Connect Shop

→ Preparing
Finding a connector for Shop...
Connector ready.
Exports your Shop app order history using Playwright browser automation.
  If needed, Vana Connect will open a local browser session on this machine.

→ Connecting
Connecting to Shop...
Collecting your data...

→ Manual step required
Shop still needs a manual browser step on this machine.
  Because `--no-input` is enabled, Vana stopped before opening that session.

→ Next
  • Run `vana connect shop` without `--no-input`.
  • Inspect the latest run log with `vana logs shop`.
  • Or check overall status with `vana status`.
  Run log:          ~/.dataconnect/logs/run-shop-<timestamp>.log
```

<!-- END:connect-shop-no-input -->

### Unavailable connector interactive path

<!-- BEGIN:connect-steam -->

```
$ vana connect steam

Connect Steam

→ Preparing
Finding a connector for Steam...

→ Not available yet
No connector is available for Steam right now.

→ Next
  • Try GitHub with `vana connect github`.
  • Browse available sources with `vana sources`.
  • Or check overall status with `vana status`.
```

<!-- END:connect-steam -->

### Unavailable connector `--no-input` path

<!-- BEGIN:connect-steam-no-input -->

```
$ vana connect steam --json --no-input

Connect Steam

→ Preparing
Finding a connector for Steam...

→ Not available yet
No connector is available for Steam right now.

→ Next
  • Try GitHub with `vana connect github`.
  • Browse available sources with `vana sources`.
  • Or check overall status with `vana status`.
```

<!-- END:connect-steam-no-input -->
