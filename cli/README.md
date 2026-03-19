# vana

**Portable personal data, from the terminal.**

[![Release](https://img.shields.io/github/v/release/vana-com/cli)](https://github.com/vana-com/cli/releases)
![macOS · Linux · Windows](https://img.shields.io/badge/platform-macOS%20·%20Linux%20·%20Windows-blue)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)


`vana` collects your data from platforms you use. You log in through a browser
on your machine, and the CLI saves it locally as JSON.

### Highlights

- **Fully local**: credentials and collected data never leave your machine
- **Any platform**: connects through a browser session, not a restricted API
- **Inspectable**: collected data is JSON you can summarize, query, or pipe
- **Agent-ready**: `--json` and `--no-input` flags for scripts and AI agents
- **Session caching**: log in once, reconnect faster next time
- **Extensible**: connectors are standalone modules; add new platforms without touching the core

## Install

macOS (Homebrew):

```bash
brew install vana-com/tap/vana
```

macOS and Linux:

```bash
curl -fsSL https://cli.vana.com/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://cli.vana.com/install.ps1 | iex
```

Verify with `vana --version`.

## Quick start

```console
$ vana connect github

  Connect GitHub

  ✓ Signed in
  ✓ Profile
  ✓ Repositories — 8 found
  ✓ Starred

  ✓ Connected GitHub.
  Collected your GitHub data and synced it to your Personal Server.

  Next: vana data show github
```

Your data is on disk at `~/.vana/results/`.

```bash
vana data show github --json | jq '.summary'
```

Explore further:

```bash
vana sources               # See all available platforms
vana connect               # Interactive source picker
vana status                # What's connected, what needs attention
```

## How it works

1. `vana connect <source>` launches a browser on your machine
2. You log in (credentials stay on your machine)
3. The CLI collects your data and saves it to `~/.vana/`
4. `vana data show <source>` summarizes what was collected

Sessions are cached, so reconnecting is faster next time. Your data is files
on disk. Inspect, move, or delete them whenever you want.

## Commands

| Command                       | What it does                                 |
| ----------------------------- | -------------------------------------------- |
| `vana connect [source]`       | Connect a platform and collect your data     |
| `vana connect <src> --detach` | Connect in the background                    |
| `vana sources`                | List available platforms                     |
| `vana data list`              | Show all collected datasets                  |
| `vana data show <source>`     | Summarize a collected dataset                |
| `vana status`                 | Connection health and system overview        |
| `vana collect [source]`       | Re-collect data from a connected source      |
| `vana schedule add`           | Schedule daily collection (launchd/cron)     |
| `vana skills list`            | List available agent skills                  |
| `vana skills install <name>`  | Install a skill for your AI agent            |
| `vana mcp`                    | Start MCP server (Claude Code, Cursor, etc.) |
| `vana doctor`                 | Diagnose installation and runtime health     |
| `vana logs [source]`          | View run logs                                |
| `vana setup`                  | Install or repair the browser runtime        |

Run `vana <command> --help` for detailed usage.

### For scripts and AI agents

Commands support structured output:

```bash
vana connect github --json --no-input    # Machine-safe — never prompts
vana data show github --json | jq        # Pipe collected data anywhere
vana sources --json                      # Discover platforms programmatically
```

`--json` writes structured output to stdout. `--no-input` guarantees no
interactive prompts. The CLI exits `1` if input is needed. See the
[exit code reference](docs/CLI-EXIT-CODE-MATRIX.md) for the full contract.

## Sources

`vana` connects to any platform that has a web login. Connectors handle the
automation for each source.

The CLI shares its connector format with
[DataConnect](https://github.com/vana-com/data-connect) and the
[data-connectors](https://github.com/vana-com/data-connectors) repository.

Available: **GitHub**, **ChatGPT**, **Instagram**, **LinkedIn**, **Spotify**,
**YouTube**, **Shop**, **Oura Ring**, **Uber**.

Run `vana sources` to see what's available on your install.

Missing a platform?
[Request one](https://github.com/vana-com/cli/issues/new?template=source-request.yml)
· [Build a connector](docs/building-connectors.md)

## Ecosystem

`vana` is the CLI for [Vana](https://vana.org)'s data portability network. It
shares connectors and local storage with
[DataConnect](https://github.com/vana-com/data-connect), the desktop app. For
building apps that request user data, see the
[Connect SDK](https://github.com/vana-com/vana-connect).

## Privacy

**Credentials**: You log in through a browser on your machine. Vana never
sees your password, token, or session cookie.

**Collected data**: Saved to `~/.vana/` as local files. Nothing is
uploaded.

**Browser sessions**: Cached in `~/.vana/browser-profiles/` for faster
reconnects. Delete them any time.

**Telemetry**: None.

## Troubleshooting

```bash
vana doctor              # Runtime, browser, and state health
vana logs <source>       # Latest run log for a source
```

| Problem                 | Fix                                        |
| ----------------------- | ------------------------------------------ |
| Browser runtime missing | `vana setup`                               |
| Login expired           | `vana connect <source>` to re-authenticate |
| Connector fails         | `vana logs <source>` for details           |

## Uninstall

Remove the CLI:

```bash
brew uninstall vana                  # Homebrew
rm -f ~/.local/bin/vana              # Script install (macOS / Linux)
```

Remove collected data and state:

```bash
rm -rf ~/.vana
```

## Documentation

- [Building connectors](docs/building-connectors.md)
- [Exit code reference](docs/CLI-EXIT-CODE-MATRIX.md)
- [Architecture](docs/architecture.md)

## Community

- [Issues](https://github.com/vana-com/cli/issues): bugs and source requests
- [Discussions](https://github.com/vana-com/cli/discussions): questions and ideas
- [Discord](https://discord.gg/vana): chat with the team
- [Contributing](CONTRIBUTING.md)

## License

MIT
