# CLI Review Surface

This document is the quickest way to review the current `vana` CLI as a
product.

Use it when you want to answer:

- what commands exist?
- what should a human see?
- what should automation see?
- which transcript or demo should I open?
- which acceptance commands should I run first?

## Core Command Tree

Top level:

- `vana`
- `vana --help`
- `vana --version`
- `vana version`
- `vana status`
- `vana doctor`
- `vana sources`
- `vana sources <source>`
- `vana connect`
- `vana connect <source>`
- `vana collect`
- `vana collect <source>`
- `vana data`
- `vana data list`
- `vana data show <source>`
- `vana data path <source>`
- `vana logs`
- `vana logs <source>`
- `vana setup`
- `vana server`
- `vana server status`
- `vana server set-url <url>`
- `vana server clear-url`
- `vana server sync`
- `vana server data`
- `vana server data <scope>`

JSON / agent-safe surfaces:

- `vana version --json`
- `vana status --json`
- `vana doctor --json`
- `vana sources --json`
- `vana sources <source> --json`
- `vana connect <source> --json --no-input`
- `vana collect --json`
- `vana collect <source> --json --no-input`
- `vana data list --json`
- `vana data show <source> --json`
- `vana data path <source> --json`
- `vana logs --json`
- `vana logs <source> --json`
- `vana server --json`
- `vana server status --json`
- `vana server set-url <url> --json`
- `vana server clear-url --json`
- `vana server sync --json`
- `vana server data --json`
- `vana server data <scope> --json`

## Review Order

If you only have a few minutes, review the
[CLI transcripts](CLI-TRANSCRIPTS.md) in this order:

1. [`vana --help`](CLI-TRANSCRIPTS.md#vana---help)
2. [`vana doctor`](CLI-TRANSCRIPTS.md#vana-doctor)
3. [`vana status`](CLI-TRANSCRIPTS.md#vana-status)
4. [`vana sources`](CLI-TRANSCRIPTS.md#vana-sources)
5. [Successful connect](CLI-TRANSCRIPTS.md#successful-interactive-path)
6. [`vana collect`](CLI-TRANSCRIPTS.md#vana-collect)
7. [`vana data show github`](CLI-TRANSCRIPTS.md#vana-data-show-github)
8. [`vana server status`](CLI-TRANSCRIPTS.md#vana-server-status)
9. [`vana server sync`](CLI-TRANSCRIPTS.md#vana-server-sync)
10. [`vana logs`](CLI-TRANSCRIPTS.md#vana-logs)

That sequence covers:

- first impression
- trust and diagnostics
- source discovery
- successful collection
- re-collection of existing sources
- post-success payoff
- personal server integration
- operator/debug follow-through

## Human Review Surfaces

All transcripts are in [CLI-TRANSCRIPTS.md](CLI-TRANSCRIPTS.md), organized by
category: foundational, state/diagnostics, discovery, data surfaces, connect
flows, collect flows, and server management.

## Machine Review Surfaces

Use these when reviewing shell composability and agent behavior:

- `vana version --json`
- `vana status --json`
- `vana doctor --json`
- `vana sources --json`
- `vana sources github --json`
- `vana data list --json`
- `vana data show github --json`
- `vana data path github --json`
- `vana logs --json`
- `vana connect github --json --no-input`
- `vana connect shop --json --no-input`
- `vana collect --json`
- `vana collect github --json --no-input`
- `vana server --json`
- `vana server status --json`
- `vana server set-url https://ps-abc123.server.vana.org --json`
- `vana server clear-url --json`
- `vana server sync --json`
- `vana server data --json`
- `vana server data github --json`

Related contract docs:

- [CLI-EXIT-CODE-MATRIX.md](CLI-EXIT-CODE-MATRIX.md)
- [CLI-EXECUTION-PLAYBOOK.md](CLI-EXECUTION-PLAYBOOK.md)

## Demo Media

Animated recordings of every CLI surface. Regenerate with `pnpm demo:vhs`.
GIFs are rendered by CI and attached to the
[canary release](https://github.com/vana-com/vana-connect/releases/tag/canary-feat-connect-cli-v1).

[release]: https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1

### Foundational

#### `vana --help`

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/help.gif" width="800" alt="vana --help" />

#### `vana data --help`

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/data-help.gif" width="600" alt="data-help" />

#### `vana setup`

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/setup.gif" width="600" alt="setup" />

### State and diagnostics

#### `vana status`

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/status.gif" width="800" alt="status" />

#### `vana doctor`

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/doctor.gif" width="800" alt="doctor" />

#### `vana logs`

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/logs.gif" width="600" alt="logs" />

### Discovery

#### `vana sources`

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/sources.gif" width="600" alt="sources" />

### Post-success data surfaces

#### `vana data list`

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/data-list.gif" width="600" alt="data-list" />

#### `vana data list` (clean machine)

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/data-list-empty.gif" width="600" alt="data-list-empty" />

#### `vana data show github`

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/data-show-github.gif" width="600" alt="data-show-github" />

#### `vana data show github` (missing)

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/data-show-github-missing.gif" width="600" alt="data-show-github-missing" />

#### `vana data path github`

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/data-path-github.gif" width="600" alt="data-path-github" />

### Connect flows

#### Successful interactive path

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/connect-github-success.gif" width="800" alt="connect-github-success" />

#### `--no-input` path (no session)

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/connect-github-no-input.gif" width="600" alt="connect-github-no-input" />

#### `--no-input` path (session reuse attempt)

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/connect-github-session-reuse-no-input.gif" width="600" alt="connect-github-session-reuse-no-input" />

#### Legacy/manual interactive path (Shop)

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/connect-shop.gif" width="600" alt="connect-shop" />

#### Legacy/manual `--no-input` path (Shop)

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/connect-shop-no-input.gif" width="600" alt="connect-shop-no-input" />

#### Unavailable connector (Steam)

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/connect-steam.gif" width="600" alt="connect-steam" />

#### Unavailable connector `--no-input` (Steam)

<img src="https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/connect-steam-no-input.gif" width="600" alt="connect-steam-no-input" />

## Acceptance Commands

Fast local review:

```bash
pnpm preflight:cli
pnpm demo:transcripts
```

Fast human CLI spot-check:

```bash
vana --version
vana doctor
vana status
vana sources
vana sources github
vana connect github
vana collect github
vana data show github
vana server status
vana server sync
vana logs github
```

Fast machine CLI spot-check:

```bash
vana version --json | jq
vana status --json | jq
vana sources --json | jq '.summary, .recommendedSource'
vana sources github --json | jq
vana data show github --json | jq '.summary, .data.profile'
vana connect github --json --no-input
vana collect --json | jq
vana server status --json | jq
vana server sync --json | jq
vana server data --json | jq
```

## Regeneration

Refresh transcripts (updates [CLI-TRANSCRIPTS.md](CLI-TRANSCRIPTS.md) in place):

```bash
pnpm demo:transcripts
```

Render demo media:

```bash
pnpm demo:vhs
```

Watch the deployed canary lane:

```bash
pnpm release:watch
```
