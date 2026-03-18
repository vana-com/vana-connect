---
name: next-prompt
description: >
  Generate and execute the next agent prompt from connected personal data.
  Use when: the user says "what should I work on", "vana next", "what's next",
  or when the agent has no pending task. Also triggers after completing a task
  when autopilot is enabled.
---

# Next Prompt

Generate the next task from connected personal data and user-defined guidance.

## Config

Read `~/.vana/next-prompt.md` for the user's guidance. If it doesn't exist, create it:

```markdown
# Next Prompt

## Priorities

- (edit this list to steer your agent)

## Standing instructions

- Prefer small, completable tasks

## Notify me when

- Something needs my decision
- You're about to take an irreversible action
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

### 4. Reason and generate

Based on the connected data and guidance, generate 1-3 prioritized suggestions. Each suggestion should be:

- Specific enough to execute without further clarification
- Aligned with the user's stated priorities
- Informed by what the data shows (recent activity, pending items, time-sensitive things)

Present them:

```
Based on your data and priorities:

1. [Most important action with reasoning]
2. [Second action]
3. [Third action]

Pick one, or say "go" and I'll start on #1.
```

### 5. Execute or wait

If the user picks one or says "go", execute it as your next task.

If `~/.vana/next-prompt.md` says not to notify for this type of task, skip the prompt and execute directly.

## What to look for in each source

**GitHub:** Recent commits (what was worked on), open issues, PRs awaiting review, dependency alerts, repos with recent activity vs. stale repos.

**ChatGPT:** Recent conversation topics (what the user is thinking about), saved memories (stated preferences and goals), repeated questions (knowledge gaps or recurring concerns).

**LinkedIn:** Unread messages (especially from contacts matching "anchor customer" or similar priority labels), profile views, job-relevant activity.

**Spotify:** Listening patterns can indicate work state (focus music = deep work, podcasts = learning, silence = meetings or away).

**Shop/Uber:** Time-sensitive receipts, returns windows, upcoming trips.

## Rules

1. Never fabricate data. Only reference what's actually in the result files.
2. Respect the notify/don't-notify preferences in the config.
3. If no data is connected, list the unconnected sources and tell the user to connect them in their own terminal. Do NOT run `vana connect` yourself — that is a separate skill (`connect-data`) and most sources require a headed browser you cannot access.
4. Work with whatever data IS available. Do not block on missing sources.
5. Weight time-sensitive items higher (messages aging toward an SLA, expiring deadlines).
6. Don't repeat suggestions the user has already dismissed.
