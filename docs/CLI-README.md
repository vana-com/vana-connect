# Vana CLI

`vana` is the local collection CLI for connector setup, browser automation, and
dataset inspection.

This page is the CLI-first entrypoint. Use it instead of the SDK README when
you want to install, try, or review the CLI itself.

## Install

Current branch prerelease tag:

`canary-feat-connect-cli-v1`

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

Release page:

`https://github.com/vana-com/vana-connect/releases/tag/canary-feat-connect-cli-v1`

## Start Here

```bash
vana --version
vana doctor
vana status
vana sources
vana connect github
vana data show github
vana logs github
```

What to expect:

- `vana connect` opens a guided source picker in human mode.
- `vana connect <source>` runs the end-to-end collection flow.
- `vana connect <source> --json --no-input` is the strict machine-safe path.
- `vana doctor` inspects install, runtime, and local state health.
- `vana data ...` inspects collected datasets without opening raw JSON.
- `vana logs` exposes stored connector run logs.

## Demo

The current prerelease demos are published from CI:

![Vana status and sources demo](https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/status-and-sources.gif)

![Vana data inspection demo](https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/data-inspection.gif)

![Vana successful connect demo](https://github.com/vana-com/vana-connect/releases/download/canary-feat-connect-cli-v1/connect-success.gif)

The `connect` demo is meant to show a short payoff story:

- connect GitHub
- then inspect the collected dataset

## Shell Use

Useful human commands:

```bash
vana version
vana doctor
vana status
vana sources
vana connect github
vana data list
vana data show github
vana logs github
```

Useful machine-readable commands:

```bash
vana version --json | jq
vana status --json | jq '.summary'
vana sources --json | jq '.summary, .recommendedSource'
vana data show github --json | jq '.summary, .data.profile'
vana connect github --json --no-input
```

Contract notes:

- `--json` writes machine-readable output to stdout without human narration.
- successful completion returns exit code `0`
- actionable non-success outcomes return exit code `1`

For the full exit-code and shell contract, use
[CLI-EXIT-CODE-MATRIX.md](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-EXIT-CODE-MATRIX.md).

## Review Surface

If you want to review the CLI systematically, start here:

- [CLI review surface](/home/tnunamak/code/vana-connect-cli-pr/docs/CLI-REVIEW-SURFACE.md)

Supporting review artifacts:

- [CLI transcripts](/home/tnunamak/code/vana-connect-cli-pr/docs/transcripts/README.md)
- [CLI VHS demos](/home/tnunamak/code/vana-connect-cli-pr/docs/vhs/README.md)

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
