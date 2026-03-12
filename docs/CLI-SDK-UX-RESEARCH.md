# CLI and SDK UX Research for `vana-connect`

_As of March 12, 2026_

## Goal

This note captures current reference points for designing a strong `vana-connect` CLI around an SDK. The question is not "what can we wrap from `scripts/`?" but "what shape should a best-in-class connector CLI take in 2026?"

There is no objective industry ranking for "greatest UX of all time," but a small set of tools are repeatedly treated as gold standards for developer experience. The most useful references for `vana-connect` cluster into three groups:

- General-purpose developer CLIs
- SDK/API design leaders
- Agentic / interactive terminal tools

## Shortlist

### Best CLI references

#### 1. GitHub CLI (`gh`)

Why it matters:

- Clear command grammar
- Good balance between interactive use and scripting
- Consistent flags and help output
- Strong machine-readable output via `--json`
- Extensible without becoming confusing

What to learn:

- Top-level nouns and verbs are easy to predict
- Commands work both interactively and non-interactively
- The CLI never feels trapped in one mode

Sources:

- https://cli.github.com/manual/
- https://cli.github.com/manual/gh_pr_status
- https://docs.github.com/en/github-cli/github-cli/using-github-cli-extensions

#### 2. `uv`

Why it matters:

- Probably the clearest recent benchmark for fast, low-friction CLI design
- Single-binary feel
- Extremely good defaults
- Minimal conceptual overhead
- Strong "just run the thing" ergonomics

What to learn:

- Speed is UX
- Reduce ceremony
- Prefer commands users can guess before reading docs
- Compress common workflows into short, memorable commands

Sources:

- https://docs.astral.sh/uv/
- https://docs.astral.sh/uv/guides/tools/
- https://docs.astral.sh/uv/concepts/tools/

#### 3. Vercel CLI

Why it matters:

- Excellent onboarding flow
- Strong local-to-cloud workflow
- Good project linking model
- Very polished auth, env, deploy, and logs UX

What to learn:

- Make first run feel guided
- Model explicit project/account linkage
- Make it obvious what context the user is operating in

Sources:

- https://vercel.com/docs/cli
- https://vercel.com/docs/cli/link
- https://vercel.com/docs/projects/deploy-from-cli

#### 4. Fly CLI (`flyctl`)

Why it matters:

- Strong app lifecycle UX
- Good examples of scaffolding, provisioning, deploy, inspect, and operate loops

What to learn:

- Provide a coherent workflow end-to-end, not just isolated commands
- Treat diagnostics as a first-class feature

Sources:

- https://fly.io/docs/flyctl/
- https://fly.io/docs/flyctl/launch/
- https://fly.io/docs/launch/deploy/

#### 5. Supabase CLI

Why it matters:

- Good bridge between local development and hosted state
- Strong `init`, `start`, `link`, migration, and project context patterns

What to learn:

- Make local workflows explicit
- Make remote state linkage inspectable and reversible

Sources:

- https://supabase.com/docs/guides/cli/getting-started
- https://supabase.com/docs/reference/cli/supabase-init

#### 6. Doppler CLI

Why it matters:

- Not flashy, but very polished in a sensitive category: secrets and environment configuration

What to learn:

- Secret handling UX should feel deliberate, safe, and unsurprising
- Local environment commands should be trustworthy and inspectable

Sources:

- https://docs.doppler.com/docs/cli
- https://docs.doppler.com/docs/install-cli

## Best SDK / API DX references

#### 1. Stripe

Why it matters:

- Still the canonical API DX reference
- Great docs, examples, and SDK consistency
- Excellent operational ergonomics: test mode, request IDs, idempotency, webhook tooling

What to learn:

- Design the SDK first, not the CLI first
- Make failures diagnosable
- Build for both quickstarts and production reliability
- Support great local testing loops

Sources:

- https://docs.stripe.com/api
- https://docs.stripe.com/sdks/server-side
- https://docs.stripe.com/stripe-cli/use-cli

#### 2. viem

Why it matters:

- One of the strongest modern crypto SDK references
- Strong type safety
- Clean composable primitives
- Good separation between transport, client, action, and utility layers

What to learn:

- Keep the SDK modular and typed
- Expose small composable primitives, not only giant convenience methods
- Let advanced users build their own workflows from lower-level pieces

Source:

- https://viem.sh/docs/getting-started

#### 3. Bun

Why it matters:

- A useful study in reducing conceptual surface area and compressing common tasks into sharp commands

What to learn:

- Short commands matter
- Clear defaults matter more than large option surfaces

Sources:

- https://bun.sh/docs
- https://bun.sh/docs/pm/bunx

## Agentic / interactive CLI references

#### Claude Code and Codex

These are important references, but this category is still too young and fast-moving to treat as settled "all-time" CLI design.

Why they still matter:

- They show how a terminal tool can combine REPL, agent, SDK, and automation surface
- They make state, streaming output, and intervention loops central to the experience

What to learn:

- Interactive mode should feel alive and stateful
- Non-interactive mode still needs to exist for automation
- Tool output must remain legible under streaming conditions

Sources:

- https://docs.anthropic.com/en/docs/claude-code/cli-reference
- https://docs.anthropic.com/s/claude-code-sdk
- https://platform.openai.com/docs/guides/code-generation
- https://platform.openai.com/docs/docs-mcp

## Practical ranking for `vana-connect`

If the goal is to design a best-in-class connector CLI + SDK, the most relevant references are:

- `gh` for command architecture
- `uv` for speed, defaults, and low-friction execution
- Vercel for onboarding and project/account context
- Stripe for SDK-first design and operational ergonomics
- viem for typed composable SDK structure
- Supabase and Doppler for environment, context, and local/remote workflow patterns

## Core lessons to carry into `vana-connect`

### 1. Build the SDK first

The CLI should be a thin, excellent interface over a stable SDK. This is the Stripe / viem lesson.

The SDK should likely own:

- connector discovery
- registry access
- auth/session management
- execution lifecycle
- progress events
- result validation
- machine-readable errors

The CLI should own:

- command grammar
- interactive prompts
- formatting
- shell ergonomics
- user guidance

### 2. Support both human mode and automation mode

The best modern CLIs do not force a choice between "pretty" and "scriptable." They support both.

For `vana-connect`, that likely means:

- human-friendly default output
- `--json` or line-delimited JSON for automation
- explicit exit codes
- predictable stderr/stdout behavior

### 3. Treat onboarding as a product surface

The first-run path matters disproportionately.

Good references here are Vercel, Supabase, and Doppler:

- authenticate cleanly
- detect missing prerequisites
- explain local state
- avoid surprising writes
- make recovery obvious

### 4. Favor a small number of excellent commands

`uv` is the strongest reminder here. Fewer commands, better defaults, less ceremony.

Bad direction:

- turning every script into a top-level command

Better direction:

- identify the core user journeys
- design commands around those journeys
- keep lower-level escape hatches for advanced users

### 5. Make diagnostics first-class

Connector tooling lives in a failure-heavy environment:

- auth breaks
- websites change
- sessions expire
- anti-bot systems interfere
- schemas drift

The CLI should therefore make it easy to inspect:

- current session state
- connector metadata
- last run status
- validation failures
- captured logs and artifacts

### 6. Interactive UX should be optional, not mandatory

Agentic CLIs are useful references, but `vana-connect` should not default to a TUI unless the workflow genuinely benefits from it.

The baseline should probably remain:

- standard subcommands
- clear progress output
- prompts only when needed

Then optionally add:

- richer interactive mode
- watch mode
- guided setup / doctor flows

## Provisional conclusion

If we want `vana-connect` to feel elite rather than enterprise-heavy, the strongest design blend is:

- Stripe for system design and reliability
- viem for SDK shape
- `gh` for command language
- `uv` for speed and simplicity
- Vercel / Supabase for onboarding and context management

This suggests that `vana-connect` should be:

- SDK-first
- scriptable by default
- interactive when useful
- fast to first success
- explicit about local state, auth, and artifacts
- designed around a few great workflows rather than a mirror of internal scripts

## Notes on confidence

This document is an informed synthesis, not a formal benchmark study. The ranking is partly based on current official docs and partly on broad developer reputation and observable product behavior as of March 12, 2026.
