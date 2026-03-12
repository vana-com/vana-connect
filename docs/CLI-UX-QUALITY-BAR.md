# `vana-connect` CLI UX Quality Bar

_As of March 12, 2026_

## Purpose

This document defines what “beautiful” should mean for the `vana connect` CLI.

The goal is to make beauty actionable. For this product, beauty should not mean decoration or terminal spectacle. It should mean:

- clarity
- restraint
- confidence
- strong pacing
- high signal-to-noise

## Core principle

A beautiful CLI feels:

- obvious to start
- calm while running
- precise when it fails
- satisfying when it succeeds

The best beauty benchmark is not “does this look flashy?”

It is:

**“Does this feel inevitable, polished, and lighter than it should?”**

## What beauty means here

### 1. Command beauty

Commands should feel guessable.

Good:

- `vana connect steam`
- `vana connect status`
- `vana connect list`

Bad:

- commands shaped around internal scripts
- commands that require reading docs before first use

### 2. Output beauty

Output should have:

- clean hierarchy
- short line lengths
- obvious state transitions
- minimal clutter

The user should be able to scan and understand:

- what is happening
- whether it succeeded
- what to do next

### 3. Copy beauty

Copy should be:

- concise
- technically serious
- specific

It should avoid:

- filler
- hype
- vague reassurance
- “friendly” noise

### 4. Progress beauty

Progress should feel smooth, not chatty.

Good progress:

- meaningful step changes
- occasional counts when they matter
- calm updates during long operations

Bad progress:

- constant noisy logging
- fake precision
- overwhelming dependency output

### 5. Success beauty

A successful run should feel like an outcome, not a file write.

Good:

- “Connected Steam. Collected your Steam data and synced it to your Personal Server.”

Bad:

- “Saved result to ~/.dataconnect/last-result.json”

Artifact paths are supporting detail, not the story.

### 6. Failure beauty

A failure should feel understandable and recoverable.

Good failure:

- one-sentence problem statement
- one useful next step
- enough specificity to trust the message

Bad failure:

- wall of raw subprocess output
- vague “something went wrong”
- making the user infer whether retry is safe

### 7. Machine beauty

`--json` mode should also feel beautiful.

For machine mode, beauty means:

- stable event names
- stable field names
- no clutter
- no decorative output
- strong predictability

This matters because coding agents are users too.

## What beauty does not require

Not required:

- heavy ANSI art
- custom TUI chrome
- animations
- excessive color
- terminal gimmicks

These can easily reduce polish rather than increase it.

## Implementation filters

Every command and output path should be evaluated against these questions:

- Is this the shortest obvious command?
- Can a user scan this in two seconds?
- Is any line here doing unnecessary work?
- Does the success message describe an outcome rather than an artifact?
- Does this message preserve trust?
- Would this still feel clean on the 100th use?

## Beauty standards for v1

For v1, the CLI should meet these standards:

- first run feels obvious
- install prompts are crisp
- progress is calm
- success is outcome-shaped
- local-only vs ingested is elegant and unmistakable
- status is compact and useful
- `--json` mode is clean and deterministic

## Conclusion

For `vana connect`, beauty is a valid requirement.

It should be understood as:

- taste
- compression
- confidence
- legibility

Not terminal theatrics.
