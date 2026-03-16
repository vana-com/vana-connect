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
- `vana connect`
- `vana connect <source>`
- `vana data`
- `vana data list`
- `vana data show <source>`
- `vana data path <source>`
- `vana logs`
- `vana logs <source>`
- `vana setup`

JSON / agent-safe surfaces:

- `vana version --json`
- `vana status --json`
- `vana doctor --json`
- `vana sources --json`
- `vana data list --json`
- `vana data show <source> --json`
- `vana data path <source> --json`
- `vana logs --json`
- `vana logs <source> --json`
- `vana connect <source> --json --no-input`

## Review Order

If you only have a few minutes, review the
[CLI transcripts](CLI-TRANSCRIPTS.md) in this order:

1. [`vana --help`](CLI-TRANSCRIPTS.md#vana---help)
2. [`vana doctor`](CLI-TRANSCRIPTS.md#vana-doctor)
3. [`vana status`](CLI-TRANSCRIPTS.md#vana-status)
4. [`vana sources`](CLI-TRANSCRIPTS.md#vana-sources)
5. [Successful connect](CLI-TRANSCRIPTS.md#successful-interactive-path)
6. [`vana data show github`](CLI-TRANSCRIPTS.md#vana-data-show-github)
7. [`vana logs`](CLI-TRANSCRIPTS.md#vana-logs)

That sequence covers:

- first impression
- trust and diagnostics
- source discovery
- successful collection
- post-success payoff
- operator/debug follow-through

## Human Review Surfaces

All transcripts are in [CLI-TRANSCRIPTS.md](CLI-TRANSCRIPTS.md), organized by
category: foundational, state/diagnostics, discovery, data surfaces, and
connect flows.

## Machine Review Surfaces

Use these when reviewing shell composability and agent behavior:

- `vana version --json`
- `vana status --json`
- `vana doctor --json`
- `vana sources --json`
- `vana data list --json`
- `vana data show github --json`
- `vana data path github --json`
- `vana logs --json`
- `vana connect github --json --no-input`
- `vana connect shop --json --no-input`

Related contract docs:

- [CLI-EXIT-CODE-MATRIX.md](CLI-EXIT-CODE-MATRIX.md)
- [CLI-EXECUTION-PLAYBOOK.md](CLI-EXECUTION-PLAYBOOK.md)

## Demo Media

Animated recordings of every CLI surface. Regenerate with `pnpm demo:vhs`.

### Foundational

#### `vana --help`

<img src="vhs/help.gif" width="800" alt="vana --help" />

#### `vana data --help`

<img src="vhs/data-help.gif" width="600" alt="data-help" />

#### `vana setup`

<img src="vhs/setup.gif" width="600" alt="setup" />

### State and diagnostics

#### `vana status`

<img src="vhs/status.gif" width="800" alt="status" />

#### `vana doctor`

<img src="vhs/doctor.gif" width="800" alt="doctor" />

#### `vana logs`

<img src="vhs/logs.gif" width="600" alt="logs" />

### Discovery

#### `vana sources`

<img src="vhs/sources.gif" width="600" alt="sources" />

### Post-success data surfaces

#### `vana data list`

<img src="vhs/data-list.gif" width="600" alt="data-list" />

#### `vana data list` (clean machine)

<img src="vhs/data-list-empty.gif" width="600" alt="data-list-empty" />

#### `vana data show github`

<img src="vhs/data-show-github.gif" width="600" alt="data-show-github" />

#### `vana data show github` (missing)

<img src="vhs/data-show-github-missing.gif" width="600" alt="data-show-github-missing" />

#### `vana data path github`

<img src="vhs/data-path-github.gif" width="600" alt="data-path-github" />

### Connect flows

#### Successful interactive path

<img src="vhs/connect-github-success.gif" width="800" alt="connect-github-success" />

#### `--no-input` path (no session)

<img src="vhs/connect-github-no-input.gif" width="600" alt="connect-github-no-input" />

#### `--no-input` path (session reuse attempt)

<img src="vhs/connect-github-session-reuse-no-input.gif" width="600" alt="connect-github-session-reuse-no-input" />

#### Legacy/manual interactive path (Shop)

<img src="vhs/connect-shop.gif" width="600" alt="connect-shop" />

#### Legacy/manual `--no-input` path (Shop)

<img src="vhs/connect-shop-no-input.gif" width="600" alt="connect-shop-no-input" />

#### Unavailable connector (Steam)

<img src="vhs/connect-steam.gif" width="600" alt="connect-steam" />

#### Unavailable connector `--no-input` (Steam)

<img src="vhs/connect-steam-no-input.gif" width="600" alt="connect-steam-no-input" />

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
vana connect github
vana data show github
vana logs github
```

Fast machine CLI spot-check:

```bash
vana version --json | jq
vana status --json | jq
vana sources --json | jq '.summary, .recommendedSource'
vana data show github --json | jq '.summary, .data.profile'
vana connect github --json --no-input
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
