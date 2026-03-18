# CLI Open Issues

Tracked issues for the CLI, organized by what kind of work each requires.

**Task types:**

- **Iterate** — we have enough docs/research; apply findings to code or copy
- **Research** — need investigation, benchmarking, or code archaeology first
- **Brainstorm** — open-ended design question; multiple plausible paths
- **Tim + Claude** — needs a decision from Tim, possibly with Claude's input

---

## Iterate

Issues where we already know enough to act. Existing docs
(CLI-UX-QUALITY-BAR.md, CLI-DEMO-GUIDELINES.md, agent-friendly research)
provide the reference frame.

### Connect flow transcript quality audit

The connect flow has the right overall intention but hasn't had close
attention to details. Multiple paused spinner lines stack up line-by-line
during `vana connect`, making it look like a log dump rather than a
choreographed experience. But the spinners are just the symptom — the
deeper issue is that the full connect transcript (preparing → connecting →
progress → outcome → next steps) hasn't been reviewed line-by-line against
what best-in-class CLIs produce.

**What to do:** Take each connect transcript variant (success, no-input,
legacy, unavailable) and compare them side-by-side against production CLI
transcripts from Vercel deploy, Railway up, `gh run watch`, Stripe CLI.
Look at: how do they handle multi-phase progress? How do completed steps
render? What does the "waiting" state look like? How much context does each
line earn its place?

This is more than a spinner fix — it's a line-by-line quality pass on
the most important user journey in the CLI.

**Ref:** CLI-UX-QUALITY-BAR.md, CLI-TRANSCRIPTS.md (connect sections)

### State labeling and the headed/headless/agent mental model

The labels "needs attention", "legacy", and "manual step" in `vana status`
and `vana sources` are confusing — but relabeling them is only the surface
issue. The deeper question is: what mental model should users have for how
connector states flow across different execution contexts?

**The confusion:** "Legacy" means the connector doesn't call
`requestInput` — so when it needs auth, it calls `showBrowser`/`promptUser`
instead, which requires a headed display. This makes "legacy" functionally
equivalent to `--no-input` in a headless environment. But "legacy" sounds
like "old and broken" when it really means "browser-required auth flow."

**Questions that need answers:**

- When `vana status` shows "needs attention" for Shop, does that mean an
  agent tried `--no-input` and it needed a browser? Will it auto-resume if
  run again headed? What's the user's next action?
- If a connector is "legacy" and the user is in a headed desktop session,
  should the CLI just open the browser automatically? The label "manual
  step" implies the user has to do something — but what, exactly?
- How should an agent interpret these states? Can it recover, or does it
  need to hand off to a human?
- Are "legacy" and "interactive" permanent properties of a connector, or
  can a connector support both modes?

**What to do:** First, map out the actual state transitions across
contexts (headed interactive, headless interactive, headless no-input,
agent-driven). Then design labels that help users understand what happened
and what to do next. The labels should be context-aware if needed.

**Ref:** CLI-TRANSCRIPTS.md (status, connect-shop sections)

### "What I would do next" specificity → **Done**

Next-step suggestions now use specific source names and copy-pasteable
commands throughout. See Done section.

**Ref:** CLI-UX-QUALITY-BAR.md, CLI-TRANSCRIPTS.md

### Agent demo GIFs/transcripts

Show a coding agent (Claude Code) using the CLI end-to-end. The SKILL.md
already exists in data-connectors. Script a VHS-style demo that shows an
agent running `vana connect github --json --no-input` and processing the
output.

**Ref:** CLI-AGENT-FRIENDLY.md, data-connectors/skills/vana-connect/SKILL.md

---

## Research

Issues where we need to investigate code, compare implementations, or gather
data before we can act.

### `vana data show` schema assumptions → **Research complete, needs design**

`summarizeResultData()` in `src/cli/index.ts:3453-3507` is **entirely
hardcoded**. It checks for specific field names: `profile.username`,
`repositories`, `starred`, `orders`, `playlists`, and
`exportSummary.details`. `summarizeNamedItems()` assumes array items have
a `name` field. Zero runtime validation against schemas.

**Findings:**

- If a connector returns data in an unexpected shape, summary lines are
  **silently skipped**. No warning to the user — they just see less info.
- `data-connectors/schemas/` has 25+ JSON Schema files that define
  connector output (e.g. `github.repositories.json` defines `name`, `url`,
  `description`, etc.) — but the CLI doesn't read or validate against them.
- Every new connector requires adding hardcoded field names to
  `summarizeResultData()`. This won't scale.

**Brittle assumptions (every instance):**

| Line | Assumption                                    | Risk                           |
| ---- | --------------------------------------------- | ------------------------------ |
| 3466 | `data.profile?.username` string               | Silently skipped if missing    |
| 3470 | `data.repositories` is array                  | Silently skipped if wrong type |
| 3472 | Repo items have `.name` string                | Preview line disappears        |
| 3478 | `data.starred` is array                       | Silently skipped               |
| 3482 | `data.orders` is array                        | Silently skipped               |
| 3486 | `data.playlists` is array, items have `.name` | Silently skipped               |
| 3495 | `data.exportSummary?.details` string          | Fallback only                  |

**What needs to happen:** Design a mechanical summary system. Options:

1. Use `exportSummary` from connectors (already returned by some)
2. Read JSON Schema metadata to auto-generate summaries
3. Define a `displayHints` field in registry.json per connector
4. Walk the JSON generically (count arrays, show top-level keys)

**This is now a design question, not a research question.** Moves to
Tim + Claude for the approach decision.

### Connector metadata utilization → **Mostly done**

The CLI now fetches and uses connector metadata extensively. Scopes,
versions, checksums, export frequency, and icons are used in
`vana sources`, `vana sources --detail`, `vana status`, and the new
`vana collect` command.

**What's implemented:**

| Field                  | Status  | Where used                                                   |
| ---------------------- | ------- | ------------------------------------------------------------ |
| `scopes[].label`       | Done    | Sources detail view, status badges, Personal Server sync     |
| `scopes[].description` | Done    | `vana sources --detail` view                                 |
| `version`              | Done    | Displayed in sources/status views                            |
| `checksums`            | Done    | Displayed in sources views                                   |
| `iconURL`              | Done    | Rendered in sources/status views for capable terminals       |
| `exportFrequency`      | Done    | Shown in sources detail view                                 |
| `connectURL`           | Not yet | Could open the correct login page during `vana connect`      |
| `connectSelector`      | Not yet | Could verify login state before running the connector        |
| `runtime`              | Not yet | Could validate runtime compatibility before attempting a run |

**Remaining items:**

- `connectURL` / `connectSelector` — smarter connect flows (pre-auth)
- `runtime` — pre-run compatibility validation
- Update-available detection (version comparison against installed)

**Research docs:**

- [Version Tracking](research/VERSION-TRACKING-RESEARCH.md)
- [Freshness UX](research/FRESHNESS-UX-RESEARCH.md)
- [Pre-Auth Patterns](research/PRE-AUTH-PATTERNS-RESEARCH.md)
- [Scope Display](research/SCOPE-DISPLAY-RESEARCH.md)

### Color palette verification → **Done (destructive aligned)**

The CLI theme lives in `src/cli/render/theme.ts`. Brand colors were
compared against `vana-app/packages/ui/src/styles/shadcn.css`.

**Current state:**

| Role                | CLI hex   | Brand hex        | Match?                                             |
| ------------------- | --------- | ---------------- | -------------------------------------------------- |
| Accent / primary    | `#4141fc` | `#4141fc`        | Yes                                                |
| Success             | `#00d50b` | `#00d50b`        | Yes                                                |
| Destructive / error | `#E7000B` | `#E7000B`        | Yes — updated to Vana brand vivid red              |
| Warning             | `#BA8B00` | _(not in brand)_ | Acceptable — functional color with no brand equiv. |

- The **VHS Catppuccin Mocha** theme is a generic dark theme with no Vana
  brand colors. It's fine for recording demos but shouldn't be cited as
  "brand-accurate."

**Remaining:** Decide whether warning needs a brand-sanctioned color or
if `#BA8B00` is acceptable long-term.

### `--no-input` vs input-up-front → **Research complete, gap confirmed**

`--no-input` propagates through the CLI as `allowHeaded = !request.noInput`
in the runtime. Three distinct code paths are affected:

| API              | With `--no-input`                                    | Without                    |
| ---------------- | ---------------------------------------------------- | -------------------------- |
| `requestInput()` | Throws `NeedsInputError`                             | Prompts user interactively |
| `promptUser()`   | Emits `legacy-auth` event, returns early             | Shows prompt               |
| `showBrowser()`  | Emits `legacy-auth` event, returns `{headed: false}` | Opens browser              |

**Key findings:**

- **No mechanism exists for pre-supplying input.** There are no env vars,
  flags, config files, or stdin pipes that let an agent provide credentials
  ahead of time. The only options are "interactive" or "skip entirely."
- **Auth mode is detected by regex on connector script content**, not by a
  declared property. The runtime scans for `requestInput` calls to classify
  connectors as "interactive" vs "legacy."
- **The gap between "skip all prompts" and "provide answers ahead of time"
  is real and unaddressed.** An agent that has GitHub credentials cannot
  pass them to `vana connect github --no-input` — it can only fail.

**This is now a product decision, not a research question.** See the
Tim + Claude section for the product model discussion.

### Personal server integration → **Partially done**

Significant progress on the CLI's Personal Server integration. Scope-aware
ingest, per-scope state tracking, honest sync badges, and a full
`vana server` command group are now implemented. Auth and tunnel awareness
remain as gaps.

**What's implemented:**

- Scope-aware ingest with proper scope resolver (maps connector output
  fields to PS scopes)
- Personal Server client with per-scope POST to `/v1/data/{scope}`
- Per-scope sync state tracking (which scopes synced, which failed)
- Honest sync badges in status views
- `vana server status` — shows server URL (with source clarity: auto-detected
  vs saved vs env var), connection state, and sync status
- `vana server data` — shows what data is stored on the server
- `vana server sync` — manual sync retry for previously collected data
- Server status URL source labeling (auto-detected vs saved vs env var)

**Remaining gaps:**

| Gap                          | Why it matters                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No persistent URL config** | `VANA_PERSONAL_SERVER_URL` is env-only. Users must set it every session. No `~/.vana` or `~/.vana` config file stores the URL.                                                                                                    |
| **No auth on ingest**        | POST `/v1/data/{scope}` is open on the server side today. For public/tunnel URLs, anyone who knows the URL can write data. The server supports Web3Signed auth (EIP-191) for reads and dev tokens for dev — the CLI uses neither. |
| **No tunnel awareness**      | DataConnect creates FRP tunnels and shows the public URL in its UI. The CLI can't discover or display this URL. The tunnel config lives at `~/.vana/personal-server/tunnel/frpc.toml`.                                            |
| **No gateway registration**  | The personal server self-registers with the Data Gateway via EIP-712 signed messages through an account signing service. The CLI doesn't participate in this flow.                                                                |
| **No grant management**      | Can't view/revoke data access grants from CLI.                                                                                                                                                                                    |

**Auth architecture (from personal-server-ts):**

- **Web3Signed**: `Authorization: Web3Signed {base64url_payload}.{signature}` —
  EIP-191 signed, includes audience/method/uri/bodyHash/expiry. Used for
  read endpoints. The CLI would need a private key to sign requests.
- **Dev token**: `Authorization: Bearer {token}` — 32-byte random hex,
  generated per session, emitted to DataConnect UI. Bypasses Web3Signed.
  Ephemeral, not persisted.
- **Ingest endpoint**: Currently **no auth** on POST `/v1/data/{scope}`.
  This needs to change before public URLs are standard.

**What still needs to happen:**

1. **Config persistence** — `vana server set-url <url>` that writes to
   `~/.vana/personal-server-url` or similar. Fall back to env var,
   then port scan.
2. **Auth integration** — decide whether CLI uses Web3Signed (needs
   private key management) or dev tokens (needs discovery from
   DataConnect). For cloud-hosted, likely Web3Signed.
3. **Tunnel URL discovery** — read from FRP config at
   `~/.vana/personal-server/tunnel/frpc.toml`, or query the
   running server for its public URL.

**This is a Brainstorm → Tim + Claude pipeline.** The auth model and
tunnel discovery need product decisions before implementation.

---

## Brainstorm

Open-ended design questions with multiple plausible approaches. Need creative
exploration before converging.

### "Steam not available" — the extensibility experience

This is one of the deepest UX questions for the CLI. When a user asks for
a source we don't support yet, the current response is a dead end: "Steam
is not available yet." That's the moment where a best-in-class CLI turns a
limitation into an opportunity.

**Why this matters:** The connector creation agent skill already exists
(`data-connectors/skills/vana-connect/CREATE.md`) and can build a working
connector from scratch. The infrastructure is there. The question is: how
does the CLI bridge the gap between "we don't have this" and "let's make
it happen right now"?

**The design space:**

1. **Agent-assisted creation (highest ambition).** Detect if the user has
   a coding agent (Claude Code, Codex, etc.). If so, offer to launch
   connector creation in a parallel terminal. The agent reads the SKILL.md,
   scaffolds the connector, tests it, and the user comes back to a working
   `vana connect steam`. Questions: how does the CLI hand off to the agent?
   How does the agent signal completion? Can the user's original terminal
   wait and resume? What if the agent needs interactive approval?

2. **One-liner handoff.** Print a command the user can paste into another
   terminal that kicks off the creation flow. The original terminal waits
   or the user comes back when ready. Lower magic, higher transparency.

3. **Request submission.** Collect the platform URL, desired data types,
   and auth method, then submit a structured request (GitHub issue, API
   call, local file). Someone or something builds the connector later.

4. **File-based handoff.** Write a structured request file (JSON/YAML)
   that any agent can pick up asynchronously. The user's next Claude Code
   session could detect it and offer to build the connector.

5. **Graceful degradation.** If no agent is available and the user doesn't
   want to request, at minimum show what data the platform likely has and
   what a connector would do, so the user understands the value.

**Key constraints:**

- User may or may not have a coding agent installed
- Agent may need interactive approval from the user
- Don't lose the user's progress in the current terminal
- The SKILL.md + CREATE.md already define the full connector creation flow
- Different user personas: developer (can code), power user (has an agent),
  casual user (just wants their data)

**What makes this best-in-class:** The CLI that turns "not supported" into
"let's build it together" is qualitatively different from one that just
says "sorry." This is a Vana differentiator — the data portability
protocol is open, connectors are open, and the tooling to create them is
agent-ready. The UX should reflect that.

**Tim's input needed on:** Which persona to design for first. How much
magic vs explicit user action. Whether this is a v1 or v2 feature.

### Bundled skills / agent doc installation

Should `vana` install a SKILL.md into the user's agent directory (e.g.
`~/.claude/skills/`)? Or is hosting good agent docs online sufficient?

**Possible paths:**

- `vana setup` also installs the SKILL.md for detected agents
- `vana agent-setup` as a separate command
- Just host docs at a well-known URL and rely on llms.txt / web discovery
- Ship the SKILL.md in the npm package, let agents find it

**Ref:** CLI-AGENT-FRIENDLY.md (Tier 1a)

---

## Tim + Claude

Decisions that need Tim's input. These block other work or set direction.

### Source selection and multi-connect interaction patterns

`vana connect` has a guided picker and `vana sources` lists what's
available. But the interaction patterns for "I want to connect several
things" haven't been designed.

**Questions:**

- Should `vana sources` support multi-select? What does that look like
  in a terminal (checkboxes, space-to-toggle, like `gum choose --no-limit`)?
- Should `vana connect` with no args offer to connect everything
  available, or just pick one?
- What do best-in-class CLIs do for multi-resource operations? (e.g.
  `gh repo clone` doesn't batch, but `brew install` does)
- How does multi-connect interact with the progress UX — parallel or
  sequential? What if one source needs input and another doesn't?
- For agents: should `vana connect --all --no-input` be a thing?

**What needs to happen:** Research best-in-class multi-select and
batch-operation patterns in production CLIs. Then Tim + Claude decide
whether this is right for v1 or a later iteration, and if so, what the
interaction model is.

**Tim's input needed on:** Is this a real user need now, or premature
complexity? What's the expected usage pattern — connect one source at
a time, or batch onboarding?

### `--no-input` vs providing input up front (product model)

Even after the research agent reports back on what's technically possible,
there's a product question: how should users think about the spectrum from
fully interactive → fully automated?

**The spectrum:**

1. Headed + interactive (user watches browser, types credentials)
2. Headless + interactive (CLI prompts for credentials, browser hidden)
3. Headless + pre-supplied input (agent passes creds via flags/env/config)
4. Headless + `--no-input` (fail if input needed)

**What Tim needs to decide:** Do we want to support #3? If so, what's the
interface — env vars, a config file, CLI flags, stdin JSON?

### Connector description copy

Current: "Exports your X using Playwright browser automation." This is
verbose and leaks implementation details. But descriptions come from the
**data-connectors registry**, not the CLI.

**What Tim needs to decide:** Fix upstream in data-connectors? What's the
right copy pattern? Suggestions:

- "Your GitHub profile, repositories, and starred repos" (drop verb + method)
- "Collects your GitHub data via Playwright" (shorter)
- "GitHub profile, repos, and stars" (ultra-terse)

---

## Upstream dependencies

Issues that require changes in other repos first.

### Connector descriptions (data-connectors)

Blocked on Tim's copy decision above. Once decided, change
`registry.json` in data-connectors. Demo fixtures here will follow
automatically via `prepare-vhs-fixtures.mjs`.

### Personal server ingest idempotency (personal-server-ts)

`POST /v1/data/{scope}` creates a new versioned file on every call
(new `collectedAt` timestamp each time). If the CLI retries a sync
for already-posted data, the server stores a duplicate version. The
server needs a deduplication mechanism — e.g., accept a client-supplied
`collectedAt` or content hash and return 200 instead of 201 if it
already has that version.

---

## Done

- [x] ~~Purple box around GIFs~~ — removed MarginFill from all VHS tapes
- [x] ~~GIF CI automation~~ — CI renders GIFs and attaches to canary release;
      all markdown now uses release URLs
- [x] ~~Personal Server integration~~ — scope-aware ingest with proper scope
      resolver, PS client, per-scope state tracking, honest sync badges,
      `vana server status/data/sync` commands (auth and tunnel gaps remain,
      tracked above)
- [x] ~~Connector metadata utilization~~ — scopes, versions, checksums, export
      frequency, icons used in sources/status/detail views, `vana collect`
      command (connectURL/connectSelector/runtime remain, tracked above)
- [x] ~~Next-step specificity~~ — suggestions now use specific source names and
      copy-pasteable commands
- [x] ~~Color palette alignment~~ — destructive color updated to Vana brand
      `#E7000B`
- [x] ~~VHS demos for new commands~~ — collect, sources detail, server
      status/sync/data tapes created
- [x] ~~Server status URL source clarity~~ — auto-detected vs saved vs env var
      labeled clearly
- [x] ~~Clean error handling for command typos~~ — no stack traces on unknown
      commands

---

## New (March 18, 2026)

### Test MCP server with Claude Code

Configure Claude Code to use `vana mcp` as an MCP server and verify: tools appear in the agent's tool list, `check_status` and `list_sources` return correct data, `connect_source` correctly rejects legacy sources and works for interactive sources via IPC, `show_data` returns collected datasets. Test with both local dev build and canary install.

### Non-TTY IPC mode for requestInput (agent auth unlock)

The runtime already has file-based IPC for credential prompts: `pending-input-{runId}.json` written by the connector, `input-response-{runId}.json` polled for the answer (`src/runtime/playwright/in-process-run.ts:231-239`). Currently the CLI reads the pending file and prompts via inquirer (interactive stdin).

For agents: a `--ipc` mode where the CLI leaves the pending-input file for the agent to discover. The agent reads the question, asks the user, writes the response file. The connector resumes. No interactive stdin needed. This works with Claude Code's fire-and-forget Bash tool: run `vana connect github --ipc` in background, poll for `~/.vana/pending-input-*.json`, ask user, write response, poll for completion.

This is the key unlock for agent-driven auth on interactive sources. Without it, agents cannot connect any source that requires credentials.

### Stale browser profile lock after interrupted connect

When `vana connect` is interrupted (ctrl+c, agent background task killed), the Chromium `SingletonLock` file at `~/.vana/browser-profiles/{source}/SingletonLock` is not cleaned up. Subsequent connect attempts fail with "Failed to create a ProcessSingleton." The CLI should detect and remove stale lock files before launching the browser.

### Agent-friendly credential passing

Interactive connectors (authMode: "interactive") use inquirer prompts for credentials. Agents can't reliably handle interactive stdin. Need a `--credentials-stdin` or `--credentials-json` flag that pre-fills fields without prompting, enabling one-shot agent credential flow: agent asks user for creds, pipes them in, done.

### MCP connect_source should check auth mode before spawning

The MCP `connect_source` tool currently spawns a child process for any source. For `legacy` (browser auth) sources, it should return immediately with instructions for the user instead of hanging or failing silently. Check auth mode via `vana sources --json` before attempting connection.

### Skill composition: next-prompt should not attempt connections

The next-prompt skill should only work with already-connected data. It should not invoke the connect flow. If sources aren't connected, it should list them and tell the user to connect them in their own terminal. The connect-data skill handles connections — skills should not overlap.

### Async/background connect

`vana connect chatgpt` took 4m50s synchronously. For large sources, this blocks the terminal. Need `--background` mode that starts collection and returns immediately, with status queryable via `vana status` or `vana connect --status`. Terminal bell or system notification on completion.

### Scheduled collection

Cron-like re-collection of connected sources on a cadence. Related to the `next-prompt` skill which needs fresh data. Prior art: Dependabot (fully async, results as PRs), OpenClaw (cron-scheduled tasks), ChatGPT Scheduled Tasks.

### SEA binary stack trace on unknown commands

`vana disconnect` shows a full `CommanderError` stack trace in the SEA (single executable) build. The local dev build handles this correctly. The SEA packaging needs its own top-level catch. (GitHub issue #59)

### Stale checked-in transcripts

`docs/CLI-TRANSCRIPTS.md` is stale. CI generates fresh transcripts as release artifacts but doesn't commit them back. Either auto-commit from CI or accept that checked-in transcripts are reference-only. (GitHub issue #60)

### Mechanical date filtering for collected data

To support `vana next` properly, need the ability to extract "what changed in the last 24 hours" mechanically. Approaches: diff between collection runs (requires result versioning), connector-level timestamp annotations, or upstream activity feeds. For now, the `next-prompt` skill teaches the agent to parse timestamps from raw data. (GitHub issue #57)

### Data versioning and result history

Currently each source stores only the latest result. For diffing and trend analysis, need historical snapshots with a retention policy. (GitHub issue #58)
