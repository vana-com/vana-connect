# Vana CLI

Collect user data locally, inspect it immediately, and keep the flow scriptable.

`vana` is the local collection CLI for connector setup, browser automation, and
dataset inspection.

## Start Here

Install the current canary:

macOS with Homebrew:

```bash
brew tap vana-com/vana
brew install vana
```

macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/vana-com/vana-connect/feat/connect-cli-v1/install/install.sh | sh -s -- --version canary-feat-connect-cli-v1
```

Windows PowerShell:

```powershell
& ([scriptblock]::Create((iwr https://raw.githubusercontent.com/vana-com/vana-connect/feat/connect-cli-v1/install/install.ps1 -useb).Content)) --version canary-feat-connect-cli-v1
```

Then run:

```bash
vana --version
vana doctor
vana connect github
vana data show github
```

Current prerelease tag:

`canary-feat-connect-cli-v1`

Release page:

`https://github.com/vana-com/vana-connect/releases/tag/canary-feat-connect-cli-v1`

## What It Feels Like

- `vana connect` opens a guided source picker in human mode.
- `vana connect <source>` runs the full collection flow.
- `vana connect <source> --json --no-input` is the strict machine-safe path.
- `vana doctor` checks install, runtime, and local state health.
- `vana data ...` inspects collected datasets without opening raw JSON.
- `vana logs` exposes stored connector run logs.

Credentials stay local to this machine. Successful runs are explicit about
whether data stayed local or synced to a Personal Server.

## Demo

See all CLI surfaces with their exact output in the
[CLI transcripts](CLI-TRANSCRIPTS.md).

## Core Commands

Human mode:

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

Machine mode:

```bash
vana version --json | jq
vana status --json | jq '.summary'
vana sources --json | jq '.summary, .recommendedSource'
vana data show github --json | jq '.summary, .data.profile'
vana connect github --json --no-input
```

Contract:

- `--json` writes machine-readable output to stdout without human narration.
- successful completion returns exit code `0`
- actionable non-success outcomes return exit code `1`

Full contract:

- [CLI exit code matrix](CLI-EXIT-CODE-MATRIX.md)

## Review Surface

If you want to review the CLI systematically, start here:

- [CLI review surface](CLI-REVIEW-SURFACE.md)

Supporting artifacts:

- [CLI transcripts](CLI-TRANSCRIPTS.md)

## Lifecycle

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
pnpm demo:transcripts
```

Watch the release lane and canary publication:

```bash
pnpm release:watch
```
