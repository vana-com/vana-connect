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

### Spinner stacking in connect flow

Multiple paused spinner lines appear stacked line-by-line during
`vana connect`. Looks like a log dump, not a polished progress experience.

**What to do:** Compare the current connect transcript against
CLI-UX-QUALITY-BAR.md and best-in-class patterns (Vercel deploy, Railway up,
`gh run watch`). Rewrite the progress output so only the active step animates
and completed steps collapse to a single check line.

**Ref:** CLI-UX-QUALITY-BAR.md, CLI-TRANSCRIPTS.md (connect sections)

### Clarify "needs attention" / "legacy" / "manual step" labeling

These labels in `vana status` and `vana sources` are confusing. "Legacy"
effectively means the connector doesn't call `requestInput`, so it behaves
like forced `--no-input`. "Manual step" means the connector calls
`showBrowser`/`promptUser` — which only works in a headed environment.

**What to do:** Replace jargon with user-facing labels. Candidates:

- "legacy" → "browser-only" or "manual login"
- "manual step" → "opens a browser window" or "requires desktop"
- "needs attention" → "action needed" or "incomplete"

Update `vana status`, `vana sources`, and `vana logs` output + tests.

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

### `vana data show` schema assumptions

`vana data show github` produces human-readable lines like "Latest repos:
vana-connect, data-connectors". Where does this come from?

**Questions:**

- Is the summary logic generic (walks any JSON) or does it hardcode field
  names like `repositories[].name`?
- What happens when a connector returns data in a shape the CLI doesn't
  expect?
- Do connector schemas define enough metadata for the CLI to produce
  summaries mechanically?
- List every place the CLI assumes specific field names or data shapes.

**Status:** Research agent running. Update this section with findings.

### Color palette verification

Does the CLI use the official Vana brand colors from `~/code/vana-app`?

**Questions:**

- What colors does the CLI actually use (hex values, chalk calls)?
- What does the vana-app CSS define as the brand palette?
- Do they match? Where are the mismatches?
- Does the VHS "Catppuccin Mocha" theme reasonably represent the brand?

**Status:** Research agent running. Update this section with findings.

### `--no-input` vs input-up-front

Can an agent pre-supply answers to connector `requestInput` calls?

**Questions:**

- What does `--no-input` actually do in the code path?
- Is there a mechanism for passing credentials as env vars, flags, or config?
- How do `requestInput`, `showBrowser`, and `promptUser` behave with
  `--no-input`?
- What's the actual code difference between "legacy" and "interactive" auth?
- What's the gap between "skip all prompts" and "provide answers ahead of
  time"?

**Status:** Research agent running. Update this section with findings.

### Personal server integration

What would it take to add minimal Personal Server functionality to the CLI?

**Questions:**

- What is a Personal Server and how does DataConnect desktop use it?
  (Check ~/code/data-connect)
- Does the CLI already report personal server state in `status`/`doctor`?
- What's the gap between `connected_local_only` and `connected_and_synced`?
- What would "minimal functionality" look like? (check if running, sync
  status, trigger sync)

**Status:** Research agent running. Update this section with findings.

---

## Brainstorm

Open-ended design questions with multiple plausible approaches. Need creative
exploration before converging.

### "Steam not available" — what happens next?

The current experience is a dead end: "Steam is not available yet." The
connector creation agent skill already exists
(`data-connectors/skills/vana-connect/CREATE.md`) but the CLI doesn't
surface it.

**Possible paths:**

- Suggest "Ask your coding agent to build one" with a one-liner
- Auto-detect if Claude Code / another agent is available and offer to
  launch connector creation
- Offer to submit a request (GitHub issue? form?) with platform URL and
  desired data
- Write a file that an agent can pick up later
- Give the user a 1-liner to paste in another terminal, then resume
- Some combination — detect agent → offer build; no agent → offer request

**Key constraints:**

- User may or may not have a coding agent installed
- Agent may need interactive approval from the user
- Don't lose the user's progress in the current terminal
- The SKILL.md + CREATE.md already define the full connector creation flow

**Tim's input needed on:** Which paths to prioritize. How much magic vs
explicit user action.

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

### Source selection UX

Should `vana sources` allow selecting multiple sources to connect in one
flow? Or is the current "one source at a time" model right?

**Context:** `vana connect` already has a guided picker. The question is
whether the picker should support multi-select, and whether `vana connect`
with no args should offer to connect everything available.

**What Tim needs to decide:** Is multi-source connection a real user need
right now, or premature? Does it complicate the mental model?

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
