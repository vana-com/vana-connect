# CLI Agent-Friendly Integration

_March 16, 2026_

Research and roadmap for making the `vana` CLI a first-class tool for AI agents
(coding agents, automation pipelines, MCP clients).

Based on 2026 benchmarks, production CLI patterns, and emerging standards.

## Current state

The CLI already ships several agent-friendly features:

- `--json` flag on all commands (JSONL streaming events to stdout)
- `--no-input` and `--yes` flags to skip interactive prompts
- `--quiet` flag to suppress non-essential output
- Typed `CliOutcomeStatus` codes in JSONL outcomes
- Zod schemas for all output types (`cliEventSchema`, `cliStatusSchema`, etc.)
- Consistent exit codes (0 success, 1 failure)

## Why CLI > MCP for agents (the data)

ScaleKit benchmark (Claude Sonnet 4, 5 GitHub tasks, 25 runs each):

| Approach                     | Tokens/task     | Reliability  | Monthly cost @10k ops |
| ---------------------------- | --------------- | ------------ | --------------------- |
| CLI alone                    | 1,365 – 9,386   | 100% (25/25) | ~$3.20                |
| CLI + SKILL.md (~800 tokens) | 2,816 – 12,210  | 100% (25/25) | ~$3.50                |
| MCP (direct)                 | 32,279 – 82,835 | 72% (18/25)  | ~$55.20               |
| MCP (via gateway)            | ~CLI-level      | ~99%         | ~$5.00                |

**Key insight:** An 800-token skill file reduces agent tool calls by a third
and latency by a third versus naive CLI usage. MCP costs 4–32x more tokens
than CLI for equivalent tasks.

The 2026 consensus: **CLIs are the most cost-effective and reliable transport
for AI agents.** The winning pattern is CLI + Skills, with optional MCP for
IDE/agent integrations that expect it.

## Three competing discovery standards

### AGENTS.md (Linux Foundation / Agentic AI Foundation)

Plain Markdown at repo root. Consumed by 60,000+ projects. Supported by Claude
Code, OpenAI Codex, Cursor, Gemini CLI, VS Code Copilot, Devin, Aider.
Think of it as "README for agents."

We already ship one at `/AGENTS.md`.

### SKILL.md (Anthropic / agentskills.io)

Structured format with YAML frontmatter (`name`, `description`, `license`,
`compatibility`, `allowed-tools`) plus Markdown instructions. Progressive
disclosure: ~100 tokens of metadata loaded at startup, full instructions
(<5,000 tokens) loaded only when the skill activates.

Works across Claude Code, OpenAI Codex, and OpenClaw.

### MCP tool definitions (Anthropic MCP spec)

JSON-schema tool definitions exposed via the Model Context Protocol. Most
structured option but most token-expensive upfront (55,000 tokens for GitHub's
43 tools).

## Roadmap

### Tier 1 — Low effort, high impact

#### a) Ship a SKILL.md alongside the CLI

```yaml
---
name: connect-data
description: >
  Connect personal data from web platforms (GitHub, Spotify, Shop, etc.)
  via headless browser automation. Use when collecting user data, checking
  connection status, or managing data sources.
allowed-tools: Bash(vana:*)
---
```

Document each command with examples, expected JSON output shapes, and error
recovery patterns. This is the single highest-ROI move — 800 tokens of
guidance reduces agent errors by a third.

#### b) `AGENT` environment variable detection

When `AGENT` is set, auto-enable `--json` and `--no-input`. This lets any
coding agent use `vana` without remembering flags. Mirrors the `CI=true`
convention. Already implemented by Goose (`AGENT=goose`), Amp (`AGENT=amp`).

Active proposal: github.com/agentsmd/agents.md/issues/136

#### c) Enrich error JSON with `retryable` and `suggestion` fields

```json
{
  "type": "outcome",
  "status": "runtime_error",
  "error_code": "runtime_error",
  "retryable": true,
  "suggestion": "run `vana setup --yes` to install the runtime"
}
```

Follows RFC 9457 structured error pattern. Cloudflare's implementation is the
gold standard — delivers 98% token reduction vs unstructured errors.

#### d) Route human messages to stderr in JSON mode

Currently `createEmitter.info()` suppresses messages in JSON mode. Instead,
write them to stderr so agents get both the structured JSONL on stdout and
human-readable context on stderr.

### Tier 2 — Medium effort, strong differentiation

#### e) Self-describing command (`vana describe`)

Output machine-readable command metadata for just-in-time discovery:

```json
{
  "name": "vana",
  "version": "0.1.0",
  "commands": [
    {
      "name": "connect",
      "args": [{ "name": "source", "required": true }],
      "flags": ["--json", "--no-input", "--yes", "--quiet"],
      "description": "Connect a data source and collect personal data",
      "exit_codes": { "0": "success", "1": "failure" },
      "output_schema": "CliEvent | CliOutcome (JSONL)"
    }
  ]
}
```

Agents use this instead of parsing `--help` text.

#### f) MCP server mode (`vana mcp`)

Follow the oclif-plugin-mcp-server pattern. Build a thin MCP wrapper that maps
existing Commander commands to MCP tools. Key benefit: any MCP-compatible agent
(Claude Code, Cursor, Gemini CLI, VS Code Copilot) discovers and uses `vana`
natively.

Since we use Commander (not oclif), this would be a custom implementation, but
the pattern is well-documented.

#### g) Semantic exit codes

Map `CliOutcomeStatus` values to distinct exit codes so agents can branch
without parsing JSON:

| Exit code | Status                  | Meaning                          |
| --------- | ----------------------- | -------------------------------- |
| 0         | `connected_and_synced`  | Success, data synced             |
| 0         | `connected_local_only`  | Success, data saved locally      |
| 1         | `runtime_error`         | General failure                  |
| 2         | `needs_input`           | Recoverable with interactive run |
| 3         | `setup_required`        | Recoverable with `vana setup`    |
| 4         | `auth_failed`           | Authentication problem           |
| 5         | `connector_unavailable` | Source not supported yet         |

### Tier 3 — Forward-looking

#### h) Publish JSON schemas for all output types

Export Zod schemas as JSON Schema files alongside the package, so agents can
validate output programmatically.

#### i) `--dry-run` for `connect`

Output what the connector would do without executing — useful for agents to
preview before committing to a long-running operation.

#### j) Session continuation tokens

For multi-step flows (setup -> connect -> verify), emit a `next_command` field
in outcomes so agents can chain commands without hardcoded logic:

```json
{
  "type": "outcome",
  "status": "connected_local_only",
  "next_commands": ["vana data show github", "vana connect spotify"]
}
```

## Production examples (2026)

| Project                  | Pattern                                                     |
| ------------------------ | ----------------------------------------------------------- |
| oclif-plugin-mcp-server  | Auto-discovers CLI commands, exposes as MCP tools           |
| Google Workspace CLI     | Built-in MCP server for Drive, Gmail, Calendar, Docs        |
| MCPShim                  | Daemon that turns any MCP server into shell commands        |
| mcp-cli (Philipp Schmid) | Dynamic discovery: 47K tokens → 400 tokens (99% reduction)  |
| Stripe CLI v1.37.2       | AI agent detection via User-Agent headers                   |
| Vercel agent-browser     | Accessibility-tree snapshots, `--json`, ref-based selection |

## Sources

- [ScaleKit: MCP vs CLI Benchmarking](https://www.scalekit.com/blog/mcp-vs-cli-use)
- [CLI is the New MCP](https://oneuptime.com/blog/post/2026-02-03-cli-is-the-new-mcp/view)
- [Why CLI Tools Are Beating MCP](https://jannikreinhard.com/2026/02/22/why-cli-tools-are-beating-mcp-for-ai-agents/)
- [SKILL.md Specification](https://agentskills.io/specification)
- [AGENTS.md Standard](https://agents.md/)
- [AGENT env var proposal](https://github.com/agentsmd/agents.md/issues/136)
- [RFC 9457 Structured Errors](https://noise.getoto.net/2026/03/11/slashing-agent-token-costs-by-98-with-rfc-9457-compliant-error-responses/)
- [mcp-cli Dynamic Discovery](https://www.philschmid.de/mcp-cli)
- [oclif-plugin-mcp-server](https://github.com/npjonath/oclif-plugin-mcp-server)
- [Writing CLI Tools AI Agents Want to Use](https://dev.to/uenyioha/writing-cli-tools-that-ai-agents-actually-want-to-use-39no)
