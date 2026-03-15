# Vana CLI

`vana` is the local collection CLI for connector setup, browser automation, and
dataset inspection.

Use this README when you want the CLI itself, not the SDK.

## Install

If you are evaluating the current branch rollout, use the prerelease path.

macOS with Homebrew:

```bash
brew tap vana-com/vana
brew install vana
```

macOS and Linux hosted installer:

```bash
curl -fsSL https://raw.githubusercontent.com/vana-com/vana-connect/feat/connect-cli-v1/install/install.sh | sh -s -- --version canary-feat-connect-cli-v1
```

Windows PowerShell hosted installer:

```powershell
& ([scriptblock]::Create((iwr https://raw.githubusercontent.com/vana-com/vana-connect/feat/connect-cli-v1/install/install.ps1 -useb).Content)) --version canary-feat-connect-cli-v1
```

Current prerelease tag:

`canary-feat-connect-cli-v1`

Release page:

`https://github.com/vana-com/vana-connect/releases/tag/canary-feat-connect-cli-v1`

## Start Here

```bash
vana --version
vana doctor
vana status
vana sources
vana connect github
vana data list
vana data show github
vana logs github
```

## Command Surface

Core commands:

```bash
vana --version
vana version
vana doctor
vana logs
vana connect
vana sources
vana connect github
vana connect github --json --no-input
vana status
vana setup
vana data list
vana data path github --json
vana data show github --json | jq '.summary.lines'
```

Behavior:

- `vana connect` opens a guided source picker in human mode.
- `vana connect <source>` runs the end-to-end collection flow.
- `vana connect <source> --json --no-input` is the strict machine-safe path.
- `vana sources` surfaces readiness and recommends the best next source.
- `vana doctor` inspects install, runtime, and local state health.
- `vana logs` exposes the stored connector run logs.
- `vana data ...` lets you inspect collected datasets without opening raw JSON.

## Shell Contract

- `--json` writes machine-readable output to stdout without human narration.
- successful completion returns exit code `0`
- actionable non-success outcomes return exit code `1`
- `vana doctor --json` includes install method, channel, and lifecycle commands

See the full contract in
[CLI-EXIT-CODE-MATRIX.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-EXIT-CODE-MATRIX.md).

## Shell Examples

```bash
vana status --json | jq '.summary'
vana sources --json | jq '.summary, .recommendedSource'
vana data list --json | jq '.datasets[] | {source, dataState, path}'
vana data show github --json | jq '.summary, .data.profile'
vana logs --json | jq '.logs[] | {source, path}'
vana doctor --json | jq '.paths.executable, .lifecycle'
```

## Upgrade And Uninstall

Check the exact lifecycle commands for your install with:

```bash
vana doctor
```

Typical upgrades:

- Homebrew:
  ```bash
  brew update
  brew upgrade vana
  ```
- macOS/Linux installer:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/vana-com/vana-connect/main/install/install.sh | sh
  ```
- Windows installer:
  ```powershell
  iwr https://raw.githubusercontent.com/vana-com/vana-connect/main/install/install.ps1 -useb | iex
  ```

Typical removal:

- Homebrew:
  ```bash
  brew uninstall vana
  ```
- macOS/Linux installer:
  ```bash
  rm -f ~/.local/bin/vana
  rm -rf ~/.local/share/vana
  ```
- Windows installer:
  - remove `%USERPROFILE%\\AppData\\Local\\Microsoft\\WinGet\\Links\\vana.cmd`
  - remove `%USERPROFILE%\\AppData\\Local\\Vana`

To remove local runtime and collected state too:

```bash
rm -rf ~/.dataconnect
```

## Demo And Review Surfaces

Published demo media:

- [status-and-sources.gif](https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/status-and-sources.gif)
- [data-inspection.gif](https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/data-inspection.gif)
- [connect-success.gif](https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/connect-success.gif)

Best review index:

- [CLI-REVIEW-SURFACE.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-REVIEW-SURFACE.md)

Transcript directory:

- [docs/transcripts/README.md](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/README.md)

VHS directory:

- [docs/vhs/README.md](/home/tnunamak/code/vana-connect-cli-pr/docs/vhs/README.md)

## Local Development

```bash
pnpm install
pnpm build
node dist/cli/bin.js status
```

Refresh local review artifacts:

```bash
pnpm demo:vhs:fixtures
pnpm demo:transcripts
```

Render demo media once `vhs` or Docker is available:

```bash
pnpm demo:vhs
```

Watch the release lane and canary publication:

```bash
pnpm release:watch
```
