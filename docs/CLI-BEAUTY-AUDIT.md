# CLI Beauty Audit

_March 17, 2026_

Three-axis design audit comparing every vana CLI surface against
best-in-class CLIs (GitHub CLI, Vercel, Railway, Stripe).

## What was fixed (this commit)

| Fix                                   | Before                                          | After                                |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------ |
| Implementation detail in descriptions | "...using Playwright browser automation"        | Stripped from all displays           |
| Redundant "Flow:" lines               | "Flow: prompts in this terminal..."             | Removed (badge already says it)      |
| "Tip:" prefix                         | "Tip: Run `vana server set-url`..."             | "Save with `vana server set-url`..." |
| Excessive next steps                  | 5-6 bullet points per command                   | Max 3, most relevant only            |
| Session message                       | "Saved session available for faster reconnects" | "Session cached."                    |
| Blank line before first section       | 3 blank lines after title                       | 1 blank line                         |
| Key-value label width                 | 17 characters (wide gaps)                       | 14 characters (tighter)              |
| Help text organization                | Flat command list                               | Task-oriented groups                 |
| Bare `vana server`                    | Status only                                     | Status + subcommand hints            |

Net result: -46 lines of output across the CLI.

## What needs Tim's input

### 1. `status` vs `doctor` consolidation

The audit found significant overlap. Recommendation: make `status` a
3-5 line health check ("Is my system ready?"), move diagnostics to
`doctor` ("What's wrong?"). Currently both try to be comprehensive.

### 2. `[legacy]` relabeling

"Legacy" sounds broken when it really means "browser-required auth."
Options under consideration:

- `[browser auth]` — describes what happens
- `[manual login]` — describes user action
- Remove the label entirely and explain in description

### 3. Default `vana` behavior

Currently shows `--help`. Audit suggests: show a guided onboarding
message when no sources are connected, or show status.

### 4. Connector descriptions upstream

Descriptions like "Exports your X using Playwright browser automation"
come from `data-connectors/registry.json`. We strip "using Playwright"
at display time, but fixing upstream would be cleaner.

### 5. `vana data show` hardcoded schema

`summarizeResultData()` has hardcoded field names (`profile.username`,
`repositories`, etc.) that don't scale to new connectors. Needs
architectural decision: use connector metadata scopes, JSON schema
introspection, or generic object walking.

## Audit methodology

Three parallel agents evaluated the CLI along independent axes:

1. **Copy quality** — tone, outcome language, specificity, density
2. **Visual structure** — spacing, color semantics, hierarchy, symbols
3. **Progressive disclosure** — first run, empty states, detail-on-demand

Each agent compared our transcripts against GitHub CLI, Vercel CLI,
Railway CLI, and Stripe CLI, producing line-level findings with
specific rewrites.

## Remaining polish items (no Tim input needed)

- Connect flow transcript pacing audit (spinner stacking)
- `vana sources` should distinguish "why" between auth modes
- Success output should feel more celebratory (outcome-first structure)
- `vana data show` next steps should not suggest circular navigation
