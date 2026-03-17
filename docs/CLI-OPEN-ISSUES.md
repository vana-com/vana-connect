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

### "What I would do next" specificity

The previous "next steps" suggestions were vague. Need to compare each
command's output against CLI-UX-QUALITY-BAR.md and ensure every next-step
suggestion is a concrete, copy-pasteable command.

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

### Connector metadata utilization → **Research complete, design needed**

The CLI fetches connector scripts but largely ignores the rich metadata
that data-connectors provides. Each connector has a metadata JSON file
(e.g. `github/github-playwright.json`) and the registry itself carries
per-connector fields that the CLI doesn't read.

**What data-connectors provides, what the CLI ignores:**

| Field                  | Source              | Potential CLI use                                                                                           |
| ---------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `version`              | registry + metadata | Track installed version, detect updates, show "update available" in `vana sources`                          |
| `checksums`            | registry            | Verify script integrity after download, detect tampering                                                    |
| `scopes[].label`       | metadata            | Replace hardcoded `summarizeResultData()` — display "Your repositories (2)" instead of guessing field names |
| `scopes[].description` | metadata            | Show what a connector collects _before_ running: `vana sources --detail`                                    |
| `iconURL`              | metadata            | Inline icons in terminals that support Kitty/iTerm2 graphics protocol (Kitty, WezTerm, Ghostty, iTerm2)     |
| `connectURL`           | metadata            | Open the correct login page directly during `vana connect`                                                  |
| `connectSelector`      | metadata            | Verify login state before running the connector                                                             |
| `exportFrequency`      | metadata            | Tell users how often to re-collect ("daily", "weekly")                                                      |
| `runtime`              | metadata            | Validate runtime compatibility before attempting a run                                                      |

**Why this matters:**

- **Solves the schema assumptions problem.** The `scopes` field has
  human-readable labels for every data type a connector exports. Using
  these instead of hardcoded field names in `summarizeResultData()` makes
  the CLI automatically correct for every connector, present and future.
- **Enables version-aware updates.** The registry has `version` and
  `checksums` per connector. The CLI could store the installed version
  in state and show "update available" without re-downloading.
- **Richer discovery.** `vana sources` could show scope previews,
  export frequency, and icons — making source selection more informed.

**Relationship to other issues:** This subsumes the `vana data show`
schema assumptions issue above — scope metadata is the answer to that
design question. It also informs the connector description copy issue
(scope labels are better descriptions than the registry `description`
field).

**What needs to happen:** Tim + Claude decision on which metadata fields
to use first. Suggested priority:

1. `scopes` — fixes summarization, enriches `vana sources`
2. `version` + `checksums` — integrity and update awareness
3. `iconURL` — terminal image support for capable terminals
4. `connectURL` / `connectSelector` — smarter connect flows

### Color palette verification → **Research complete, partial match**

The CLI theme lives in `src/cli/render/theme.ts`. Brand colors were
compared against `vana-app/packages/ui/src/styles/shadcn.css`.

**Findings:**

| Role                | CLI hex   | Brand hex        | Match?                                    |
| ------------------- | --------- | ---------------- | ----------------------------------------- |
| Accent / primary    | `#4141fc` | `#4141fc`        | Yes                                       |
| Success             | `#00d50b` | `#00d50b`        | Yes                                       |
| Destructive / error | `#C73636` | `#E7000B`        | No — CLI is muted red, brand is vivid red |
| Warning             | `#BA8B00` | _(not in brand)_ | No — CLI invented this color              |

- The **VHS Catppuccin Mocha** theme is a generic dark theme with no Vana
  brand colors. It's fine for recording demos but shouldn't be cited as
  "brand-accurate."
- Accent and success are spot-on. Destructive and warning diverge.

**What to do:** Align destructive to `#E7000B`. Decide whether warning
needs a brand-sanctioned color or if `#BA8B00` is acceptable as a
functional color with no brand equivalent. This is a small Iterate task
once Tim confirms the direction.

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

### Personal server integration → **Research complete, significant gaps**

The CLI is intended to become a primary user-facing interface for managing
Personal Servers — appearing in status, doctor, connect flows, and
eventually its own command group (`vana server`). Current code has a
localhost-only happy path but lacks the configuration, auth, and tunnel
awareness needed for real-world use.

**What exists today:**

- `detectPersonalServerTarget()` (`src/personal-server/index.ts:12-28`)
  scans `localhost:8080-8085` or uses `VANA_PERSONAL_SERVER_URL` env var
- `ingestResult()` POSTs collected data to `{url}/v1/data/{scope}` with
  **no auth headers** — just `Content-Type: application/json`
- `vana status` and `vana doctor` report server presence/absence
- State tracking distinguishes `connected_and_ingested` vs
  `connected_local_only`

**Why this isn't enough:**

The Personal Server ecosystem has three deployment modes the CLI needs
to support:

1. **Local** — DataConnect desktop runs the server on localhost, port
   probing works, no auth needed (current happy path)
2. **Tunneled** — DataConnect uses FRP (`frpc.server.vana.org`) to
   expose a public `https://{subdomain}.server.vana.org` URL. The CLI
   has zero awareness of this tunnel or how to discover the URL.
3. **Cloud-hosted** (future) — server runs remotely, requires auth,
   URL must be configured and persisted

**Specific gaps:**

| Gap                          | Why it matters                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No persistent URL config** | `VANA_PERSONAL_SERVER_URL` is env-only. Users must set it every session. No `~/.dataconnect` or `~/.vana` config file stores the URL.                                                                                             |
| **No auth on ingest**        | POST `/v1/data/{scope}` is open on the server side today. For public/tunnel URLs, anyone who knows the URL can write data. The server supports Web3Signed auth (EIP-191) for reads and dev tokens for dev — the CLI uses neither. |
| **No tunnel awareness**      | DataConnect creates FRP tunnels and shows the public URL in its UI. The CLI can't discover or display this URL. The tunnel config lives at `~/.dataconnect/personal-server/tunnel/frpc.toml`.                                     |
| **No gateway registration**  | The personal server self-registers with the Data Gateway via EIP-712 signed messages through an account signing service. The CLI doesn't participate in this flow.                                                                |
| **No manual sync retry**     | If auto-ingest fails after `vana connect`, there's no `vana server sync` to retry.                                                                                                                                                |
| **No grant management**      | Can't view/revoke data access grants from CLI.                                                                                                                                                                                    |
| **No per-scope sync status** | Can't tell which scopes synced vs which didn't.                                                                                                                                                                                   |

**Auth architecture (from personal-server-ts):**

- **Web3Signed**: `Authorization: Web3Signed {base64url_payload}.{signature}` —
  EIP-191 signed, includes audience/method/uri/bodyHash/expiry. Used for
  read endpoints. The CLI would need a private key to sign requests.
- **Dev token**: `Authorization: Bearer {token}` — 32-byte random hex,
  generated per session, emitted to DataConnect UI. Bypasses Web3Signed.
  Ephemeral, not persisted.
- **Ingest endpoint**: Currently **no auth** on POST `/v1/data/{scope}`.
  This needs to change before public URLs are standard.

**What needs to happen (staged):**

1. **Config persistence** — `vana server set-url <url>` that writes to
   `~/.dataconnect/personal-server-url` or similar. Fall back to env var,
   then port scan.
2. **Auth integration** — decide whether CLI uses Web3Signed (needs
   private key management) or dev tokens (needs discovery from
   DataConnect). For cloud-hosted, likely Web3Signed.
3. **Tunnel URL discovery** — read from FRP config at
   `~/.dataconnect/personal-server/tunnel/frpc.toml`, or query the
   running server for its public URL.
4. **Server command group** — `vana server status`, `vana server sync`,
   `vana server url` as the management interface.
5. **Transcripts and demos** — Personal Server state should appear in
   `vana status`, `vana doctor`, and eventually its own demo GIFs.

**This is a Brainstorm → Tim + Claude pipeline.** The deployment mode
spectrum (local → tunneled → cloud) and auth model need product decisions
before implementation.

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

---

## Done

- [x] ~~Purple box around GIFs~~ — removed MarginFill from all VHS tapes
- [x] ~~GIF CI automation~~ — CI renders GIFs and attaches to canary release;
      all markdown now uses release URLs
