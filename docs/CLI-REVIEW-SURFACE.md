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

If you only have a few minutes, review in this order:

1. [help.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/help.txt)
2. [doctor.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/doctor.txt)
3. [status.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/status.txt)
4. [sources.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/sources.txt)
5. [connect-github-success.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/connect-github-success.txt)
6. [data-show-github.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/data-show-github.txt)
7. [logs.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/logs.txt)

That sequence covers:

- first impression
- trust and diagnostics
- source discovery
- successful collection
- post-success payoff
- operator/debug follow-through

## Human Review Surfaces

Foundational:

- `vana`
  - [help.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/help.txt)
- `vana data`
  - [data-help.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/data-help.txt)
- `vana setup`
  - [setup.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/setup.txt)

State and diagnostics:

- `vana status`
  - [status.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/status.txt)
- `vana doctor`
  - [doctor.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/doctor.txt)
- `vana logs`
  - [logs.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/logs.txt)

Discovery:

- `vana sources`
  - [sources.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/sources.txt)

Post-success data surfaces:

- `vana data list`
  - [data-list.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/data-list.txt)
- `vana data list` on a clean machine
  - [data-list-empty.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/data-list-empty.txt)
- `vana data show github`
  - [data-show-github.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/data-show-github.txt)
- `vana data show github` when missing
  - [data-show-github-missing.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/data-show-github-missing.txt)
- `vana data path github`
  - [data-path-github.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/data-path-github.txt)

Connect flows:

- successful interactive path
  - [connect-github-success.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/connect-github-success.txt)
- interactive-required / machine-safe path
  - [connect-github-no-input.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/connect-github-no-input.txt)
- session reuse attempt in machine-safe path
  - [connect-github-session-reuse-no-input.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/connect-github-session-reuse-no-input.txt)
- legacy/manual interactive path
  - [connect-shop.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/connect-shop.txt)
- legacy/manual no-input path
  - [connect-shop-no-input.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/connect-shop-no-input.txt)
- unavailable connector interactive path
  - [connect-steam.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/connect-steam.txt)
- unavailable connector no-input path
  - [connect-steam-no-input.txt](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/connect-steam-no-input.txt)

## Demo Media

Current published canary demo assets:

- [status-and-sources.gif](https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/status-and-sources.gif)
- [data-inspection.gif](https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/data-inspection.gif)
- [connect-success.gif](https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/connect-success.gif)

What each demo should prove:

- `status-and-sources.gif`
  - first impression
  - runtime clarity
  - source maturity and recommendation quality
- `data-inspection.gif`
  - post-success payoff
  - useful summaries, not raw dumps
- `connect-success.gif`
  - success journey
  - clear end state
  - visible value after connection

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

- [CLI-EXIT-CODE-MATRIX.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-EXIT-CODE-MATRIX.md)
- [CLI-EXECUTION-PLAYBOOK.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-EXECUTION-PLAYBOOK.md)

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

Refresh transcripts:

```bash
pnpm demo:vhs:fixtures
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
