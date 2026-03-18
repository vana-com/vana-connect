# CLI Design Skill

_March 17, 2026_

How to design and implement user-facing CLI surfaces for `vana`.

Use this document when: building new commands, modifying existing
output, evaluating CLI quality, or making design decisions about
the terminal experience.

## Thesis

**The CLI's identity is the moment when personal data becomes visible
and owned.**

Everything else serves that moment. Test every design decision:
does it serve the data moment? If yes, keep. If no, cut.

## Leverage points (Donella Meadows)

When improving the CLI, work at the highest leverage point possible.
Lower-numbered points create more change with less effort.

| #   | Leverage point   | CLI example                                 | Effect         |
| --- | ---------------- | ------------------------------------------- | -------------- |
| 12  | Parameters       | Label text, padding widths                  | Almost none    |
| 11  | Buffer sizes     | Line counts, truncation limits              | Minimal        |
| 6   | Information flow | What the user sees and when                 | High           |
| 5   | Rules            | The renderer/emitter architecture           | High           |
| 3   | Goals            | "Display information" vs "build confidence" | Transformative |
| 2   | Paradigm         | "Text printer" vs "temporal experience"     | Foundational   |

If you're tweaking label text, you're at #12. Stop and ask whether
the information should exist at all (#6) or whether the rendering
model needs to change (#5).

## Design process

### 1. Map the path tree

Before designing output, enumerate EVERY branch — not just the happy
path. Each branch needs its own rendering. The hardest branches define
the quality.

### 2. Map the emotional journey

For each moment in the flow, identify:

- What the user is feeling (anxiety, anticipation, pride)
- What the user needs to know (nothing, one fact, a decision)
- How long the moment lasts (<100ms, seconds, user-paced)

Duration determines rendering:

- **<100ms**: Show nothing. Don't acknowledge what the user can't perceive.
- **100ms–1s**: Brief text, no spinner.
- **1–10s**: Spinner on the active line.
- **10s+**: Spinner with meaningful progress detail.
- **User-paced**: Prompt. No spinner. Wait calmly.

### 3. Design from the goal down

Start with: what should the user feel at the end?
Then: what's the minimum information to produce that feeling?
Then: what's the minimum rendering to present that information?

Do NOT start with: what data do we have? How should we format it?

### 4. Test against three criteria

Every design must pass:

1. **Thesis test**: Does it serve "data becomes visible and owned"?
2. **Quality bar test**: Clarity, restraint, confidence, pacing,
   signal-to-noise. (See CLI-UX-QUALITY-BAR.md)
3. **Prior art test**: Compare to gh, Vercel, Stripe, Railway, Cargo.
   Are we at least as good? Is our unique element (the scope manifest)
   preserved?

## Visual identity

### Symbols

- `✓` — completed (Vana green)
- `✗` — failed (red)
- Spinner on active line (accent blue, minimal frame set)
- No other symbols in output. No arrows, diamonds, boxes, or bullets
  outside of help text.

### Color (5 decisions, no more)

- `✓` in Vana green (#00D50B)
- `✗` in Vana red (#E7000B)
- Active spinner in Vana blue (#4141FC)
- Supporting detail (counts, paths, labels) in muted gray
- Everything else in default terminal color

### Typography

- Bold for two things only: the title ("Connect GitHub") and the
  success line ("Connected GitHub."). Nothing else.
- Muted for supporting detail (counts, paths, "Next:" label).
- Default weight for everything else.
- This creates a visual arc: bold intention → regular work → bold
  resolution.

### Spacing

- One blank line between the title and the first content line.
- No blank lines between scope manifest lines.
- One blank line before the success line (the pause before resolution).
- One blank line before "Next:" (separation of outcome from guidance).
- Blank lines are design elements, not defaults. Every blank line
  must justify its existence.

## Copy principles

### Tone

- Calm, precise, concise.
- Periods, not exclamation marks. Confidence is quiet.
- Technically serious — outcomes, not mechanisms.

### Rules

- Never say "using Playwright browser automation" or any
  implementation detail.
- Never lead with file paths. Paths are supporting detail.
- Never show more than one "Next:" suggestion (context-dependent).
- Never hedge ("may need updating"). Either check or don't mention.
- Never explain what the user already knows on re-run.
  First time: explain. Second time: just do it.

### Success messages

The approved shape (from CLI-UX-SIMULATION.md):

```
Connected {Source}.
Collected your {Source} data and synced it to your Personal Server.
```

Or local-only:

```
Connected {Source}.
Collected your {Source} data and saved it locally.
```

Two lines. Outcome-shaped, not artifact-shaped.

### Failure messages

Every failure has three parts:

1. What happened (one line)
2. Why (one line, only if actionable)
3. One recovery command

No "check the docs." No multiple suggestions. One command.

### Cancellation

One word: `Cancelled.`

## The scope manifest (our signature)

The scope manifest is the CLI's unique visual element:

```
  ✓ Profile
  ✓ Repositories — 8 found
  ✓ Starred
```

Design rules for the manifest:

- Lines appear as scopes complete (honest pacing).
- Active scope has a spinner.
- Completed scope has `✓` in green.
- Failed scope has `✗` in red.
- Counts follow the scope name with `—` separator when available.
- Always show the manifest, even for fast collections. The lines
  are a data inventory, not a progress indicator.

## Prompt design

Use `@clack/prompts` components for interactive inputs (text,
password, select, confirm). They're genuinely better than readline
for masking, validation, and visual quality.

Frame prompts in our visual language, not clack's:

- No vertical bars (`│`) wrapping the flow
- No diamond symbols (`◆`, `◇`)
- Prompts appear inline, minimal, like `ssh`:

```
  Username: alice
  Password: ▪▪▪▪▪▪▪▪
```

For first-time setup (runtime install), explanation is warranted.
For re-auth, just prompt.

## Terminal bell

Emit `\a` on completion of long-running operations (connect, collect).
Users with notification-aware terminals get a system notification.
Zero visual cost.

## Degradation

When capabilities are limited:

- No TTY: no spinner, no color. Plain line-by-line output.
- No color (`NO_COLOR`, `TERM=dumb`): symbols still work, just
  uncolored.
- CI: same as no TTY.
- `--json`: no visual output at all. Structured events only.

The CLI must be readable in all modes. Beauty degrades; function
doesn't.

## Anti-patterns

Things that feel productive but don't improve beauty:

- **Tweaking label text** — leverage point #12. Almost no effect.
- **Adding more information** — violates restraint. Ask: does the
  user need this HERE, NOW?
- **Borrowing another CLI's visual identity** — clack bars, Vercel
  triangles. Build our own.
- **Decorating the success moment** — the data IS the decoration.
  Don't add chrome to the scope manifest.
- **Multiple "Next:" suggestions** — forces the user to choose.
  Choose for them based on journey position.
- **Trust copy on re-runs** — "Your credentials stay local" is
  important the first time. On the 5th connect, it's noise.

## Reference documents

- [CLI-UX-QUALITY-BAR.md](CLI-UX-QUALITY-BAR.md) — beauty standards
- [CLI-AUDIENCE-CONTRACT.md](CLI-AUDIENCE-CONTRACT.md) — human + agent
- [CLI-UX-SIMULATION.md](CLI-UX-SIMULATION.md) — approved output shapes
- [CLI-ONBOARDING-COPY.md](CLI-ONBOARDING-COPY.md) — tone and trust
- [CLI-BEAUTY-IMPLEMENTATION-PLAN.md](CLI-BEAUTY-IMPLEMENTATION-PLAN.md) — execution plan
- [CLI-CONNECT-FLOW-DESIGN.md](CLI-CONNECT-FLOW-DESIGN.md) — connect flow path tree
- [CLI-BEAUTY-AUDIT.md](CLI-BEAUTY-AUDIT.md) — three-axis audit findings

## Prior art

| CLI             | What to learn from it                                 |
| --------------- | ----------------------------------------------------- |
| Vercel          | Pacing. Deploy feels calm and inevitable.             |
| gh (GitHub CLI) | Restraint. Shows exactly what you need.               |
| Cargo (Rust)    | Honest timing. Fast things flash, slow things linger. |
| Elm compiler    | Failure beauty. Errors teach, not blame.              |
| ssh             | Prompt minimalism. `Password:` and nothing else.      |
| Stripe CLI      | Factual tone. States facts, not feelings.             |
