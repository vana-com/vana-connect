---
name: next-prompt
description: >
  Generate and execute the next agent prompt from connected personal data.
  Use when: the user says "what should I work on", "vana next", "what's next",
  or when the agent has no pending task. Also triggers after completing a task
  when autopilot is enabled.
---

# Next Prompt

Pick the single most valuable thing the user should know or have done, based on their connected data and stated focus, and do it.

## Config

Read `~/.vana/next-prompt.md` for the user's guidance. This file is the user's standing directive — like a system prompt that steers what you focus on and how you behave. It is **not** a task list or backlog. Do not write tasks, action items, or deliverables into it.

If the file doesn't exist, create it with the default template below and tell the user to edit it — but don't block on that. Work with whatever you have.

```markdown
# Next Prompt

## Focus

What I care about right now. Use this as context for deciding what's worth my attention — not as a checklist.

## Permissions

Do without asking:

- Research and analysis
- Writing summaries, memos, or drafts to local files
- Code exploration and reading

Ask first:

- Sending messages or emails to anyone
- Creating PRs, issues, or public posts
- Anything involving money, credentials, or shared infrastructure
- Deleting data or force-pushing

## Standing instructions

- (your preferences for how the agent works)
```

## Flow

### 1. Gather context and check freshness

```bash
vana status --json
```

This tells you what sources are connected, their sync state, and `lastCollectedAt` timestamps.

Check freshness: if any source's `lastCollectedAt` is more than 24 hours old, suggest recollection before generating prompts:

- For one source: `vana collect <source>`
- For all stale sources: `vana collect` (re-collects all connected sources)

Only suggest recollection, don't block on it. Work with whatever data is available.

### 2. Read connected data

For each connected source, read the result file:

```bash
ls ~/.vana/results/
```

Read each JSON file. Look for timestamped data from the last 24 hours. Common timestamp fields:

- `created_at`, `updated_at`, `timestamp`, `date`
- `create_time` (ChatGPT conversations)
- `startedAt`, `endedAt` (Oura, activity data)

If timestamps aren't available, treat all data as current.

### 3. Read guidance

```bash
cat ~/.vana/next-prompt.md
```

### 4. Decide and act

Pick **one** action. The best action is:

- **Time-sensitive over evergreen.** A message aging toward an SLA beats a code cleanup.
- **Aligned with the user's stated focus** in the guidance file.
- **Informed by what the data actually shows**, not what you assume.
- **Specific and completable** in one agent turn.

Classify the action's risk:

| Risk level      | Examples                                                     | What to do                                                                 |
| --------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Safe**        | Research, analysis, local file drafts, code reading          | Just do it. Tell the user what you did when done.                          |
| **Visible**     | Sending messages, creating PRs, posting publicly             | Describe exactly what you'd do in one sentence, then wait for a thumbs up. |
| **Destructive** | Deleting data, force-pushing, closing issues, spending money | Explain the action and consequences, then wait for explicit approval.      |

The user's `Permissions` section overrides these defaults.

**Do not present a numbered list of options.** Pick the best one. If you're wrong, the user will redirect you. That's faster than making them choose every time.

## What to look for in each source

**GitHub:** Recent commits (what was worked on), open issues, PRs awaiting review, dependency alerts, repos with recent activity vs. stale repos.

**ChatGPT:** Recent conversation topics (what the user is thinking about), saved memories (stated preferences and goals), repeated questions (knowledge gaps or recurring concerns).

**LinkedIn:** Unread messages (especially from contacts matching focus areas), profile views, job-relevant activity.

**Spotify:** Listening patterns can indicate work state (focus music = deep work, podcasts = learning, silence = meetings or away).

**YouTube:** Recent watch history and subscriptions signal what the user is learning about or interested in.

**Shop/Uber:** Time-sensitive receipts, returns windows, upcoming trips.

## Rules

1. Never fabricate data. Only reference what's actually in the result files.
2. Respect `Permissions` from the guidance file.
3. If no data is connected, say so and suggest connecting sources. Do NOT run `vana connect` yourself — that is a separate skill (`connect-data`) and most sources require a headed browser you cannot access.
4. Work with whatever data IS available. Do not block on missing sources.
5. One action at a time. Do it well. Move on.
6. Don't repeat suggestions the user has already dismissed.
