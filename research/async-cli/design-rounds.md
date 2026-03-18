# Async CLI Design: Three Rounds

## Research Summary (68 findings)

**Sync vs async default:** 9/11 CLIs block by default. `--detach` is the standard opt-out flag. Vercel uses `--no-wait`. Docker uses `-d`. AWS is the exception (async-by-default with `wait` subcommands).

**Long-running ops:** Vercel, Railway, Fly all stream progress during sync mode. Heroku's ctrl+c detaches without canceling (server-side continues). Docker has 5 progress output modes (auto/plain/tty/quiet/rawjson).

**Notifications:** Terminal bell is universal fallback. macOS: terminal-notifier. Linux: notify-send. ntfy.sh for push. `gh run watch --exit-status` exits on completion for scripting. No CLI was found that does Slack/email by default.

**Scheduled tasks:** Three tiers: crontab generation (Whenever), daemon process (PM2), cloud service (Vercel Cron, GH Actions). K8s CronJobs have the richest model. The simplest CLI pattern is generating crontab entries.

**Process lifecycle:** PM2's God Daemon over Unix sockets is the gold standard for Node.js. PID files are fragile (stale PIDs, recycling). Socket-based liveness checks are more robust. Turborepo embeds a daemon that spawns on-demand.

---

## Round 1: Brainstorm

What are ALL the ways `vana` could handle async/background/scheduled operations?

1. **Status quo + longer timeout.** Don't change anything. The connect flow blocks. Users wait 1-10 minutes. Simple.

2. **`--detach` flag.** `vana connect github --detach` starts collection, prints a session ID, returns immediately. `vana connect --status` or `vana status` shows progress. Terminal bell on completion.

3. **Daemon mode.** `vana daemon start` runs a persistent background process (like PM2/Turborepo). Handles scheduled collections, notifications, IPC for credentials. `vana daemon stop` shuts it down.

4. **Crontab generation.** `vana schedule github --every 24h` writes a crontab entry that runs `vana collect github` daily. No daemon, pure OS cron. Like Whenever gem.

5. **OS service.** `vana service install` creates a launchd plist (macOS) or systemd unit (Linux) that runs vana as a service. Like Homebrew services.

6. **Cloud-managed schedule.** Schedule runs on the Personal Server side. The CLI just configures it. Like Vercel Cron / GitHub Actions.

7. **Agent-managed schedule.** The agent (Claude Code) runs `vana collect` on a schedule using its own mechanisms (hooks, loops). No CLI scheduling needed.

8. **Fire-and-forget with webhook.** `vana connect github --notify webhook:https://...` starts collection and POSTs to a URL on completion.

## Round 1: Design

Given the research, the right approach for v1:

**Block by default, offer `--detach`.** This matches 9/11 best-in-class CLIs. The connect flow already blocks. Add `--detach` that:

- Forks the collection into a background process
- Prints a session ID
- Returns immediately
- Writes progress to `~/.vana/sessions/{id}.json`
- Terminal bell when done (if terminal is still open)

**`vana connect --status [id]`** shows progress of detached sessions.

**For scheduling: crontab generation (v1), daemon (v2).**

- v1: `vana schedule add github --every 24h` generates a crontab entry
- v2: `vana daemon` for richer scheduling, notifications, IPC

## Round 1: Plan

Phase 1: `--detach` flag

- Fork child process with `child_process.fork()`
- Write session state to `~/.vana/sessions/{id}.json`
- Print session ID on detach
- `vana status` shows active sessions
- Terminal bell via `\a` on completion

Phase 2: `vana schedule`

- `vana schedule add <source> --every <interval>`
- Generates crontab entry: `0 */24 * * * vana collect <source> --quiet`
- `vana schedule list` shows scheduled tasks
- `vana schedule remove <source>`

Phase 3: Notifications

- Terminal bell by default (already done)
- `--notify` flag: `vana connect github --notify bell` (default), `--notify desktop`, `--notify none`
- Desktop notifications via node-notifier (lazy import)

## Round 1: Critical Assessment

**What's wrong with this design:**

1. **`child_process.fork()` in a SEA binary is problematic.** The vana CLI is packaged as a single executable. Forking creates a new Node.js process that needs the same binary. `process.execPath` might not point to the right thing in all packaging scenarios.

2. **Session state files add complexity.** Now we have `~/.vana/sessions/`, `~/.vana/results/`, `~/.vana/logs/`, state file, config. The data home is getting crowded.

3. **Crontab generation is fragile.** Users who don't understand cron will struggle. `crontab -e` can destroy entries. No Windows support.

4. **The daemon approach (v2) might be needed sooner.** If the agent wants to run `vana next` on a schedule, it needs something more than cron. PM2-style daemon with IPC is the right long-term answer.

5. **`--detach` UX for agents is unclear.** If an agent detaches a connect, how does it know when it's done? Polling `vana connect --status`? That's the same polling problem as IPC.

---

## Round 2: Brainstorm (informed by Round 1 assessment)

The fork/cron approach is too infrastructure-heavy for v1. What's the MINIMUM that solves the real problem?

Real problems:

- Users wait 1-10 minutes during connect (annoying but functional)
- Agents can't run connect in the foreground (IPC solves this)
- No way to re-collect on a schedule (users must remember to run commands)

What if v1 is just:

1. **Block by default** (already works)
2. **Terminal bell on completion** (already done)
3. **`vana collect --all`** re-collects all connected sources sequentially
4. **The agent handles scheduling** via the next-prompt skill ("your GitHub data is 3 days old, recollect?")

No `--detach`, no daemon, no cron. The agent IS the scheduler.

## Round 2: Design

**The minimal design:**

`vana connect` blocks by default (no change). For agents using `--ipc`, the process runs in the background naturally (agent backgrounds it).

`vana collect --all` re-collects all connected sources. The agent can run this periodically.

`vana status --json` already shows `lastCollectedAt` per source. The next-prompt skill can check freshness and suggest recollection.

No new infrastructure. The scheduling intelligence lives in the skill, not the CLI.

**One addition: `--notify desktop`** for human users who run long connects.

## Round 2: Plan

Phase 1: `vana collect --all` (if not already implemented)

- Iterate connected sources, run collect for each
- Show per-source progress
- Skip sources that need interactive auth (can't prompt mid-batch)

Phase 2: Desktop notifications

- `--notify desktop` flag on connect and collect
- Lazy-import node-notifier
- Default: terminal bell only (already done)

Phase 3: Freshness in next-prompt skill

- Skill checks `lastCollectedAt` for each source
- If >24h old: "Your GitHub data is 3 days old. Recollect with `vana collect github`"
- Agent can run the collect autonomously for interactive sources via IPC

## Round 2: Critical Assessment

**What's right:**

- Minimal complexity. No new infrastructure.
- The agent-as-scheduler is actually elegant. The skill already exists.
- `collect --all` is a natural command users expect.

**What's wrong:**

1. **No solution for human users who want background connect.** They still wait 5 minutes watching a terminal. Every reference CLI offers detach for this.
2. **Desktop notifications require a new dependency.** node-notifier is 12MB. Heavy for a CLI that prides itself on zero runtime deps.
3. **Agent-as-scheduler requires the agent to be running.** If Claude Code isn't open, nothing collects. Not a background service.

**The honest assessment:** The minimal design is probably right for RIGHT NOW. The connect flow is 1-10 minutes — not hours. Users can wait. Agents handle it via IPC. Scheduling via the skill works when the agent is running. When users demand background operation, that's the signal to build `--detach`.

---

## Round 3: Brainstorm (final)

What if the answer is even simpler? Looking at the research again:

- Heroku: `git push` blocks. No async. Nobody complains.
- Stripe: `stripe listen` blocks. No async. Works fine.
- Vercel: blocks by default. `--no-wait` exists but rarely used.

The common thread: **if the operation takes <5 minutes, blocking is fine.** Async is for operations that take 10+ minutes or run indefinitely.

Our connect flow: 1-5 minutes typically. That's blocking territory.

The ONLY change needed: make the blocking experience BETTER.

- The heartbeat bloom spinner already shows progress
- Scope lines appear as data arrives
- Terminal bell on completion
- The experience IS designed

For agents: IPC mode handles it (already built).
For scheduling: the skill handles it (already built).

## Round 3: Design

**No new async infrastructure for v1.**

Instead, improve what we have:

1. **`vana collect --all`** — batch re-collection for convenience
2. **Freshness awareness in next-prompt skill** — "your data is stale, recollect?"
3. **Document the decision** — blocking is intentional, not missing

Add to open issues for v2:

- `--detach` when users report connect taking >10 minutes
- `vana daemon` when scheduling demand emerges from real usage

## Round 3: Plan

Implement:

1. Verify `vana collect --all` works (may already exist via `runCollectAll`)
2. Add freshness check to next-prompt skill
3. Document the async decision in CLI-OPEN-ISSUES.md

## Round 3: Critical Assessment

**Is this lazy or wise?**

Wise. The research shows that blocking is the default for best-in-class CLIs when operations take <5 minutes. Adding async infrastructure for a <5 minute operation is over-engineering. The connect flow already has the best possible blocking UX (heartbeat spinner, scope manifest, terminal bell). IPC handles the agent case. The skill handles scheduling.

**When would this become wrong?** When:

- A connector regularly takes >10 minutes (large ChatGPT histories)
- Users request background operation explicitly
- The agent scheduling pattern proves unreliable

Those are signals to build `--detach`, not predictions to engineer for now.

**Final answer: implement `collect --all` + freshness in skill. File `--detach` for v2.**
