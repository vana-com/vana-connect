# `vana connect` Flow Design

_March 17, 2026_

Deep design document for transforming `vana connect <source>` into a
best-in-class CLI experience. Informed by:

- CLI-BEAUTY-IMPLEMENTATION-PLAN.md (temporal design > static styling)
- CLI-UX-SIMULATION.md (approved success shapes)
- CLI-ONBOARDING-COPY.md (tone and trust principles)
- CLI-UX-QUALITY-BAR.md (beauty = clarity, restraint, confidence, pacing)
- Donella Meadows' leverage points framework
- Prior art from Vercel, gh, Railway, Stripe, Elm, Cargo, pnpm

## The leverage point

The CLI's beauty problem is at leverage point #5 (system rules): the
emitter architecture forces all output through uniform primitives
(`section`, `detail`, `keyValue`). This produces the same visual shape
regardless of whether the moment calls for anticipation, vulnerability,
progress, or celebration.

The transformation: the connect flow's renderer should be
**phase-aware**, not **line-aware**. Each phase has its own temporal
behavior — some are instantaneous, some are long waits, some require
user action. The rendering should reflect that.

## Full path tree

```
vana connect [source]
│
├─ No source specified
│  └─ Guided picker → user selects → continue with source
│
├─ Source not in registry
│  └─ Error: "{source} is not available."
│     Next: "vana sources" to see what's available
│
├─ Source found
│  │
│  ├─ Phase 1: Runtime check (<100ms if installed)
│  │  ├─ Installed → silent, continue
│  │  ├─ Missing + interactive
│  │  │  ├─ User confirms → install flow (10-60s)
│  │  │  │  ├─ Install succeeds → continue
│  │  │  │  └─ Install fails → error + "vana setup"
│  │  │  └─ User declines → clean exit
│  │  ├─ Missing + --yes → auto-install
│  │  └─ Missing + --no-input → fail exit
│  │
│  ├─ Phase 2: Connector fetch (<1s if cached)
│  │  ├─ Cached + valid → silent, continue
│  │  ├─ Needs download → download (1-5s)
│  │  │  ├─ Download succeeds → continue
│  │  │  ├─ Checksum mismatch → error
│  │  │  └─ Network error → error
│  │  └─ Not available → error: connector unavailable
│  │
│  ├─ Phase 3: Pre-connection validation
│  │  ├─ Interactive auth → continue to prompts
│  │  ├─ Browser auth + display available → continue to browser
│  │  ├─ Browser auth + no display → error: needs display
│  │  └─ Existing session found → try reuse (skip auth)
│  │
│  ├─ Phase 4: Authentication (0s if session reuse, 5-30s if manual)
│  │  ├─ Session reuse succeeds → continue silently
│  │  ├─ Session expired → prompt for re-auth
│  │  ├─ First time → prompt for credentials
│  │  │  ├─ User enters credentials → continue
│  │  │  ├─ 2FA required → prompt for code
│  │  │  │  ├─ Code accepted → continue
│  │  │  │  └─ Code rejected → error
│  │  │  └─ User cancels → clean exit
│  │  ├─ Browser auth → browser opens
│  │  │  ├─ User completes in browser → continue
│  │  │  ├─ User doesn't complete → timeout
│  │  │  └─ Browser can't open → error
│  │  └─ --no-input + needs input → fail exit with needs_input
│  │
│  ├─ Phase 5: Collection (5-60s)
│  │  ├─ All scopes collected → continue
│  │  ├─ Partial collection → continue with warning
│  │  ├─ Site changed / extraction fails → error
│  │  ├─ Timeout → error
│  │  └─ Runtime crash → error
│  │
│  ├─ Phase 6: Ingest (0-5s)
│  │  ├─ PS available + all scopes synced → full success
│  │  ├─ PS available + partial sync → qualified success
│  │  ├─ PS available + all fail → local success + sync warning
│  │  ├─ PS not available → local success
│  │  └─ PS not configured → local success
│  │
│  └─ Phase 7: Summary
│     ├─ Full success → trophy moment
│     ├─ Local success → success + PS guidance
│     ├─ Partial → qualified success + retry guidance
│     └─ Failure → error + recovery guidance
```

## Emotional journey map

Each moment in the flow has an emotional quality that the rendering
should serve.

| Moment                 | User feeling         | Design goal                                | Duration         |
| ---------------------- | -------------------- | ------------------------------------------ | ---------------- |
| Types command          | Expectation          | Acknowledge immediately                    | 0ms              |
| Runtime check          | Mild anxiety         | Invisible if fast, calm if slow            | <100ms or 10-60s |
| Connector fetch        | Mild anxiety         | Invisible if cached, brief if downloading  | <1s or 1-5s      |
| Trust decision (setup) | Vulnerability        | Explain clearly, respect the decision      | User-paced       |
| Auth prompt            | Vulnerability        | Minimal, precise, local-first framing      | User-paced       |
| 2FA prompt             | Time pressure        | Fast, no lag between prompt and submission | User-paced       |
| Collection start       | Anticipation         | Show something is happening                | 0s               |
| Collection progress    | Patience/relief      | Show meaningful progress, not chatter      | 5-60s            |
| Collection complete    | Satisfaction         | Clear transition from "working" to "done"  | 0s               |
| Sync                   | Background           | Mention only if noteworthy                 | 0-5s             |
| Success                | Pride/accomplishment | Outcome-shaped, not task-shaped            | 0s               |
| What now               | Agency               | One clear next action                      | 0s               |

### The critical insight: duration determines rendering

- **<100ms**: Don't show anything. No spinner, no text. Just continue.
- **100ms-1s**: Brief inline text, no spinner. "Connector ready."
- **1-10s**: Spinner. One line, updating in place.
- **10s+**: Spinner with progress detail. Show what's happening.
- **User-paced**: Prompt. No spinner. Wait calmly.

This means most phases should be INVISIBLE in the happy path.
Runtime check? Invisible (<100ms). Connector fetch? Invisible (cached).
Session reuse? Invisible. The only visible phases are:

1. Collection progress (the long wait)
2. Success summary (the payoff)

Everything else should be silent unless it takes time or needs attention.

## Prior art for each moment

### The long wait (collection progress)

**Vercel deploy**: Shows build steps appearing one at a time. Each step
is a line that appears, works briefly, then gets a checkmark. The active
step has a spinner. Completed steps stay visible but dimmed.

**Cargo build**: Shows crate names as they compile. Fast crates flash
by. Slow crates show a progress indicator. The pacing feels productive
because real work is visible.

**pnpm install**: Resolution bar fills, then packages appear as they
download. The visual density communicates "a lot is happening."

**What we should do**: Show scope names as they complete. Not a spinner
with changing text — actual lines appearing as data arrives:

```
  Profile          ✓
  Repositories     ✓  8 found
  Starred          ✓
```

Each line appears when that scope starts, gets a spinner, then resolves
to a checkmark with a count. This is the phase list from version 1 of
the design, but ONLY for the collection phase (not runtime, not
connector fetch — those are invisible).

### The payoff (success summary)

**Vercel deploy**: `✅ Production: https://my-app.vercel.app` — one
line with the thing you wanted (the URL). Then `Inspect:` link.

**gh pr create**: `https://github.com/org/repo/pull/123` — just the
URL. The thing you wanted.

**Railway deploy**: `Deployed to https://...` — the result.

Pattern: **the success line contains the ONE THING the user wanted**.
For Vercel, it's the URL. For gh, it's the PR link. For vana connect,
it's: "your data is connected and accessible."

**What we should do** (per the UX simulation):

```
Connected GitHub.
Collected your GitHub data and synced it to your Personal Server.
```

Two lines. The outcome. Not a data table, not a file path, not a list
of scopes. If the user wants details, `vana data show github`.

### The trust moment (setup/auth)

**macOS permission dialogs**: Explain what will happen, what stays
private, let the user decide. No pressure. The CLI-ONBOARDING-COPY.md
already has this right:

```
This will install:
- the connector runner
- a Chromium browser engine
- local runtime files under ~/.dataconnect/

Your credentials stay on this machine.
Continue? [Y/n]
```

**ssh-keygen**: Simple prompt, no preamble. "Enter passphrase:"
No explanation of what a passphrase is or why you need one.

The right approach depends on whether it's the user's first time or
a re-run. First time: explain. Re-run: just prompt.

### Failure recovery

**Elm compiler**: The gold standard. Errors explain WHAT went wrong,
WHY it's wrong, and HOW to fix it. Each error is a mini-tutorial.

**Rust/Cargo**: Similar — errors include the fix inline.

**gh**: "To authenticate, run: gh auth login" — one sentence, one
command.

**What we should do**: Every failure ends with exactly ONE command
the user can run to move forward. Not three suggestions. Not "check
the docs." One command.

### Cancellation

**ctrl+c in any best-in-class CLI**: Clean exit. No stack trace. No
partial state corruption. Brief message: "Cancelled." or nothing.

**What we should do**: If user cancels during collection, say:
"Cancelled. No data was saved." If they cancel during auth: "Cancelled."
One word.

## The design

### Principle: invisible unless noteworthy

Most phases should produce NO output in the happy path. The user types
`vana connect github` and sees:

```
Connecting GitHub...
```

One line. A spinner. That's it until something noteworthy happens.

If the runtime needs setup (noteworthy — requires user decision):
the spinner stops, the setup prompt appears. After setup, the spinner
resumes.

If credentials are needed (noteworthy — requires user action):
the spinner stops, the prompt appears. After auth, the spinner resumes.

If collection is progressing (noteworthy — takes time):
scope lines appear below the spinner as they complete:

```
Connecting GitHub...
  ✓ Profile
  ✓ Repositories — 8 found
  ● Starred
```

When everything completes, the spinner line resolves and the success
summary appears:

```
✓ Connected GitHub.
  Collected your GitHub data and synced it to your Personal Server.

  Next: vana data show github
```

### The full happy path (session reuse, PS available)

```
$ vana connect github
Connecting GitHub...
  ✓ Profile
  ✓ Repositories — 8 found
  ✓ Starred — 0 found

✓ Connected GitHub.
  Collected your GitHub data and synced it to your Personal Server.

  Next: vana data show github
```

Total visible output: 8 lines. The phase progression IS the collection
progress. The success IS the outcome.

### First-time with setup

```
$ vana connect github

Vana Connect needs a local browser runtime.

This will install:
  • Connector runner
  • Chromium browser engine
  • Local files under ~/.dataconnect/

Your credentials stay on this machine.

Continue? [Y/n] y

Installing runtime...
✓ Runtime ready.

Connecting GitHub...
  ✓ Profile
  ✓ Repositories — 8 found
  ✓ Starred — 0 found

✓ Connected GitHub.
  Collected your GitHub data and synced it to your Personal Server.

  Next: vana data show github
```

Setup is a separate visual block. Once done, the connect flow
continues as normal.

### With credential prompt

```
$ vana connect github
Connecting GitHub...

GitHub needs your login.

Username: alice
Password: ********

Connecting GitHub...
  ✓ Profile
  ✓ Repositories — 12 found
  ✓ Starred — 3 found

✓ Connected GitHub.
  Collected your GitHub data and saved it locally.

  Next: vana data show github
```

The spinner pauses for the prompt, then resumes. The prompt is minimal
— no trust copy mid-flow (that belongs in first-time setup, not
re-auth).

### With 2FA

```
$ vana connect github
Connecting GitHub...

Verification code: 123456

Connecting GitHub...
  ✓ Profile
  ✓ Repositories — 12 found
  ✓ Starred — 3 found

✓ Connected GitHub.
  Collected your GitHub data and saved it locally.

  Next: vana data show github
```

One line prompt. No preamble.

### Local-only success (no PS)

```
✓ Connected GitHub.
  Collected your GitHub data and saved it locally.
  Start your Personal Server to sync: vana server set-url <url>

  Next: vana data show github
```

### Partial sync

```
✓ Connected GitHub.
  Collected your GitHub data. 2/3 scopes synced, 1 failed.
  Retry: vana server sync

  Next: vana data show github
```

### Source not available

```
$ vana connect steam

Steam is not available. See what's ready: vana sources
```

Two lines. One fact. One action.

### Collection failure

```
$ vana connect github
Connecting GitHub...
  ✓ Profile
  ✗ Repositories — GitHub returned an unexpected page.

  The connector may need updating.
  Log: vana logs github
```

The phase list shows WHERE it failed. The error explains WHY. The log
command shows HOW to debug.

### Needs input in --no-input mode

```
$ vana connect github --no-input

GitHub needs credentials. Run without --no-input to authenticate.
```

One line. The user knows exactly what to do.

### Legacy auth, no display

```
$ vana connect shop

Shop requires a browser window, but no display is available.
Run this command in a desktop terminal.
```

Two lines. One fact. One action.

### User cancels (ctrl+c or prompt cancel)

```
Cancelled.
```

One word.

## Implementation requirements

### New: Phase-aware renderer for connect flow

A `ConnectRenderer` that manages the temporal experience:

```typescript
interface ConnectRenderer {
  // Start the main spinner
  start(message: string): void;

  // Pause spinner, show a prompt block, resume after
  pauseForPrompt(): void;
  resumeAfterPrompt(): void;

  // Show a scope line (appears below spinner)
  scopeStarted(scope: string): void;
  scopeCompleted(scope: string, detail?: string): void;
  scopeFailed(scope: string, error: string): void;

  // Resolve the spinner to success/failure
  succeed(message: string): void;
  fail(message: string): void;

  // Add post-success lines
  detail(message: string): void;
}
```

This is NOT a general-purpose renderer. It's specific to the connect
flow's temporal needs. Other commands continue using the existing
emitter.

### Technical approach

Use `ora` (already a dependency) for the spinner. Use raw ANSI cursor
control (`\x1b[{n}A` to move up, `\x1b[2K` to clear line) to manage
scope lines below the spinner. On non-TTY, fall back to simple
line-by-line output (no cursor control, no spinner).

No new dependencies needed. The cursor control is ~10 lines of code.

### What doesn't change

- `--json` mode: unchanged, emits structured events
- `--quiet` mode: unchanged, suppresses visual output
- `--no-input` mode: unchanged, fails on input
- The event model: unchanged, all phases still emit events
- The state model: unchanged, state updates happen as before
- Other commands: unchanged, use existing emitter

## Sticking points to resolve during implementation

1. **Spinner + scope lines interaction**: When scope lines appear
   below the spinner, the spinner needs to know how many lines are
   below it to manage cursor position. This requires the renderer to
   track line count.

2. **Prompt interruption**: When a prompt appears mid-flow, the
   spinner must stop, the prompt must render cleanly, and the spinner
   must resume after. `ora.stop()` → prompt → `ora.start()` handles
   this, but the scope lines need to be re-rendered after the prompt.

3. **Terminal resize**: If the terminal is resized during rendering,
   the cursor positions may be wrong. Accept this limitation for v1.

4. **Non-TTY degradation**: On CI/pipe, disable cursor control
   entirely. Use simple line output: "Connecting GitHub...",
   "✓ Profile", "✓ Repositories — 8 found", etc.

5. **Long scope names**: If a scope name is very long, it could wrap
   and break cursor calculations. Truncate scope names to terminal
   width.

## Acceptance criteria

1. Happy path (session reuse, PS available) produces ≤8 lines of output
2. First-time setup feels like a separate, clear decision
3. Auth prompts interrupt the flow cleanly, then flow resumes
4. Collection shows per-scope progress as lines appearing
5. Success is outcome-shaped: what was collected, where it went
6. Every failure ends with exactly one recovery command
7. Cancellation produces one word: "Cancelled."
8. `--json` output is unchanged
9. Non-TTY output is readable without cursor control
10. The flow feels calm, not chatty

## Prior art summary

| Moment         | Reference CLI     | What they do                           |
| -------------- | ----------------- | -------------------------------------- |
| The long wait  | Vercel deploy     | Phase lines with spinners → checkmarks |
| The payoff     | gh pr create      | One line with the thing you wanted     |
| Trust decision | macOS permissions | Clear, respectful, no pressure         |
| Auth prompt    | ssh-keygen        | Minimal, no preamble                   |
| Failure        | Elm compiler      | Explains what, why, and how to fix     |
| Cancellation   | Any good CLI      | Clean exit, no garbage                 |
| Overall pacing | Vercel deploy     | Calm, confident, not chatty            |
