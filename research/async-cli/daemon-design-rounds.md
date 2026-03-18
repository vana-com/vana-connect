# Daemon/Detach Design: Three Rounds

Informed by 105 findings across auth expiry patterns (Plaid, Stripe, MX,
Google, Salesforce, Strava), daemon architectures (PM2, Turborepo, Docker,
Homebrew services), and CLI async patterns (Vercel, Railway, Fly, Docker,
GitHub, AWS).

---

## Round 1: Brainstorm

### The problem statement

`vana connect chatgpt` takes 30 minutes. Users can't wait at their
terminal. Sessions/cookies expire unpredictably. Scheduled re-collection
needs to handle auth failures gracefully when the user isn't available.

### What the research says

**Auth expiry:** Plaid uses a three-tier health model: HEALTHY,
DEGRADED (will expire soon), ERROR (expired/revoked). They send
advance warning webhooks (PENDING_DISCONNECTION) 7 days before
UK consent expiry. Re-auth uses an abbreviated flow (not full
re-setup). Google revokes tokens after 6 months of inactivity.
Strava rotates refresh tokens on every use (6-hour access tokens).

**Daemon architecture:** PM2's God Daemon over dual Unix sockets
(RPC + pub/sub) is the gold standard for Node.js. Turborepo spawns
a daemon on-demand that degrades gracefully if it crashes. Both use
PID files + socket liveness checks. PM2 generates OS-specific init
scripts for auto-start on boot.

**CLI async patterns:** Block by default, `--detach` for opt-out.
When detached, print a session ID. Server-side operations survive
terminal close (Heroku, Vercel, Railway). Client-side ones don't
(Stripe listen).

### Design options

1. **`--detach` only (no daemon)**
   `vana connect github --detach` forks a child process, returns immediately.
   `vana status` shows running connections. Terminal bell on complete.
   No scheduling. No auth health tracking.

2. **Embedded daemon (PM2-lite)**
   `vana daemon start` spawns a background process that manages scheduled
   collections, auth health, and notifications. Communicates via Unix
   socket. `vana daemon stop` shuts it down. `vana status` queries the
   daemon.

3. **OS service registration**
   `vana service install` creates a launchd plist (macOS) or systemd unit
   (Linux). The CLI itself is the service binary. OS handles lifecycle.
   Like Homebrew services.

4. **Hybrid: detach for one-off, daemon for scheduled**
   `--detach` for ad-hoc background connects. `vana daemon` for ongoing
   scheduled collection with auth health tracking.

### Round 1 Design

Option 4 (hybrid) is the right answer. The research shows two distinct
use cases:

**One-off background:** "I want to connect ChatGPT but not wait 30
minutes." → `--detach`

**Ongoing scheduled:** "Keep my data fresh daily, handle auth failures."
→ `vana daemon`

### Connection health model (from Plaid research)

Each source has a connection health status:

```
healthy      → last collection succeeded, session valid
degraded     → session may be expiring soon (heuristic)
needs_reauth → collection failed due to auth, user must re-login
error        → collection failed for non-auth reason
disconnected → user has not connected this source
```

The daemon tracks this per source and acts on it:

- `healthy`: collect on schedule
- `degraded`: collect but warn user
- `needs_reauth`: pause collection, notify user
- `error`: retry with backoff, notify after N failures

### Notification model (from research)

Plaid uses webhooks to developers. For a CLI, the equivalent is:

- Terminal bell (`\a`) — if terminal is open
- Desktop notification (node-notifier) — if at computer
- ntfy.sh push — if away from computer
- File-based status — always (queryable via `vana status`)

Default: terminal bell + status file. User can configure push.

### Round 1 Plan

Phase 1: `--detach` flag

- `child_process.fork()` with detached: true, stdio: 'ignore'
- Write session to `~/.vana/sessions/{source}-{timestamp}.json`
- Print session ID on detach
- `vana status` shows active sessions
- Bell on complete

Phase 2: Connection health model

- Add `connectionHealth` to source state: healthy/degraded/needs_reauth/error
- Update health after each collection attempt
- `vana status` shows health per source

Phase 3: `vana daemon`

- Forked background process, PID file at `~/.vana/daemon.pid`
- Unix socket at `~/.vana/daemon.sock` for CLI queries
- Schedule: configurable per source in `~/.vana/config.json`
- On auth failure: set needs_reauth, notify, pause source
- On success: set healthy, update lastCollectedAt

Phase 4: Notifications

- Terminal bell (default, free)
- Desktop notification via node-notifier (opt-in)
- ntfy.sh push (opt-in, configurable)

### Round 1 Critical Assessment

**What's right:**

- Hybrid matches real use cases
- Connection health model mirrors Plaid's proven pattern
- Notification tiers cover different user states (at desk, away, on phone)

**What's wrong:**

1. **The daemon is complex.** Unix sockets, PID files, process forking,
   OS service registration. That's a lot of infrastructure for a CLI
   that currently has zero background processes.
2. **`child_process.fork()` in SEA binaries is fragile.** We know this
   from Round 1 of the previous design session.
3. **node-notifier is 12MB.** Heavy dependency for optional feature.
4. **The health model requires heuristics for "degraded."** Browser
   cookies don't have expiry dates exposed to us. We can only detect
   failure after it happens, not predict it.
5. **Schedule configuration adds a new config surface.** Now we have
   `~/.vana/config.json`, `~/.vana/next-prompt.md`, and state file.

---

## Round 2: Brainstorm (informed by Round 1 assessment)

Let me reconsider. What if the daemon is simpler than PM2?

The Turborepo pattern: daemon spawns on-demand, does specific work,
dies when idle. No permanent background process. No systemd integration.

What if `vana daemon` is just:

- `vana daemon start` forks a process that runs scheduled collections
- It writes to a log file and updates state
- `vana status` reads the state file (no socket needed)
- `vana daemon stop` kills via PID file
- If it dies, it dies. Next `vana connect` or `vana collect` spawns
  it again if needed

No Unix socket. No IPC. Just a forked process that runs collection
tasks and writes results to files. The CLI reads those files.

### Connection health (simplified)

Drop "degraded" — we can't predict expiry. Just track:

```
healthy      → last collection succeeded
needs_reauth → last collection failed due to auth
error        → last collection failed (non-auth)
stale        → no collection in configured interval
```

These are all detectable from actual collection results. No heuristics.

### Round 2 Design

**`--detach` for one-off background:**

```bash
$ vana connect chatgpt --detach
  Connecting ChatGPT in the background.
  Check progress: vana status

$ vana status
  Vana Connect

    Runtime          installed
    Personal Server  http://localhost:8080
    Sources          1 connected, 1 collecting

    ChatGPT          collecting (12m elapsed)
    GitHub           healthy (collected 2h ago)

  Next: `vana data show github`
```

When complete:

```
$ vana status
  ...
    ChatGPT          healthy (collected just now)
    GitHub           healthy (collected 2h ago)
```

**`vana daemon` for scheduled:**

```bash
$ vana daemon start
  Daemon started. Collections will run on schedule.
  Check: vana daemon status

$ vana daemon status
  Daemon running (PID 12345, uptime 2h)

    GitHub     every 24h   next: 8h    healthy
    ChatGPT    every 24h   next: 12h   healthy

$ vana daemon stop
  Daemon stopped.
```

**Auth failure handling:**

When a scheduled collection hits auth failure:

1. Source status → `needs_reauth`
2. Write to `~/.vana/notifications.json` (append-only log)
3. Next `vana status` shows it prominently
4. `vana connect <source>` re-authenticates

```
$ vana status
  ...
    ChatGPT    needs re-login (session expired 6h ago)

  Next: `vana connect chatgpt`
```

No push notifications in v1. The status command is the notification
surface. The next-prompt skill checks status and alerts the agent.

### Round 2 Plan

Phase 1: `--detach`

- `child_process.spawn()` with `detached: true`, `stdio: ['ignore', logFd, logFd]`
- Use `process.execPath` + `process.argv[1]` for binary path
- Write `~/.vana/sessions/{source}.json` with PID, start time, status
- `unref()` the child so parent can exit
- `vana status` reads session files, checks if PID is alive

Phase 2: Connection health

- Add to state: `connectionHealth: 'healthy' | 'needs_reauth' | 'error' | 'stale'`
- `runConnect`/`runCollect`: on auth failure → needs_reauth, on success → healthy
- `vana status`: show health prominently, surface re-auth needs

Phase 3: `vana daemon start/stop/status`

- `start`: fork process, write PID to `~/.vana/daemon.pid`
- Daemon loop: read schedule from state, run `vana collect <source> --quiet`
  for due sources, sleep until next
- `stop`: read PID, send SIGTERM
- `status`: read PID, check alive, show schedule and health
- Schedule stored in state file: `sources.github.schedule: "24h"`

Phase 4: `vana schedule` commands

- `vana schedule github every 24h` — set schedule
- `vana schedule list` — show schedules
- `vana schedule remove github` — remove

### Round 2 Critical Assessment

**What's right:**

- Much simpler than Round 1. No Unix sockets, no IPC, no node-notifier.
- Connection health is based on actual results, not heuristics.
- Status command is the notification surface. No new dependencies.
- The daemon is a dumb loop. Easy to implement, easy to debug.
- Agent integration: the next-prompt skill reads status, surfaces issues.

**What's wrong:**

1. **No push notifications.** If the user doesn't run `vana status` for
   a week, they won't know ChatGPT needs re-auth. The agent covers
   this IF the agent is running, but the user may not use an agent.
2. **PID file approach is fragile.** Research showed socket-based liveness
   is more robust. But sockets add complexity.
3. **The daemon is a single point of failure.** If it crashes and no one
   runs `vana status`, scheduled collections stop silently.
4. **Schedule in state file mixes concerns.** State file is for collection
   results, not configuration.

---

## Round 3: Brainstorm (final)

What if the daemon and --detach are the SAME thing?

`vana connect chatgpt --detach` spawns a background process for that
one collection. Done. No permanent daemon.

`vana collect --schedule 24h` adds a crontab entry (or launchd plist)
that runs `vana collect --all --quiet` daily. OS handles scheduling.
No custom daemon.

`vana status` reads state files. Shows health. Shows what's scheduled
(by reading crontab or launchd).

This is the Whenever gem pattern from the research. The OS is the
daemon. The CLI just configures it and reads results.

### Round 3 Design

**`--detach` for background connects:**

```bash
$ vana connect chatgpt --detach
  Connecting ChatGPT in the background.
  Check progress: vana status
```

Implementation: `child_process.spawn()` with detached + unref.
Writes progress to `~/.vana/sessions/{source}.json`.

**`vana schedule` for recurring collection:**

```bash
$ vana schedule add --every 24h
  Added daily collection schedule.
  Runs: vana collect --all --quiet
  Managed by: launchd (macOS) / cron (Linux)

$ vana schedule list
  Daily collection          every 24h    next: 14h
  Managed by: ~/Library/LaunchAgents/com.vana.collect.plist

$ vana schedule remove
  Removed daily collection schedule.
```

macOS: generates a launchd plist with `StartInterval: 86400`.
Linux: adds a crontab entry.
No custom daemon process. The OS runs `vana collect --all --quiet`.

**Connection health in `vana status`:**

```
$ vana status
  Vana Connect

    Runtime          installed
    Personal Server  http://localhost:8080

    GitHub           healthy     collected 2h ago
    ChatGPT          needs login collected 3d ago
    LinkedIn         healthy     collected 1d ago

  Next: `vana connect chatgpt`
```

When a source needs re-auth, `vana status` shows it. The scheduled
collection writes `needs_reauth` to state on auth failure and skips
that source on subsequent runs until re-authenticated.

### Round 3 Plan

Phase 1: `--detach` flag on connect and collect

- Spawn detached child process
- Write session progress to `~/.vana/sessions/{source}.json`
- Status reads session files + checks PID liveness
- Bell on complete (if terminal still open)

Phase 2: Connection health

- `connectionHealth` field in source state
- Set on every collection: healthy, needs_reauth, error
- `vana status` shows health per source
- `vana status --json` includes health for agent consumption

Phase 3: `vana schedule add/list/remove`

- macOS: generate launchd plist at ~/Library/LaunchAgents/com.vana.collect.plist
- Linux: add crontab entry via `crontab -l | ... | crontab -`
- Both run: `vana collect --all --quiet`
- `schedule list` reads from launchd/crontab
- `schedule remove` deletes plist/crontab entry

Phase 4: Status as notification surface

- `vana status` prominently shows sources needing re-auth
- next-prompt skill checks health and alerts
- No push notification dependencies in v1

### Round 3 Critical Assessment

**Is this the right design?**

Yes. It follows the research closely:

- `--detach` matches Docker/Vercel/Railway patterns (block by default, opt-out)
- OS-level scheduling matches Whenever/Homebrew services (let the OS handle lifecycle)
- Connection health matches Plaid's model (simplified to observable states)
- No custom daemon (the OS IS the daemon)
- No push notifications (status command + agent skill is the notification layer)

**Risks:**

1. **launchd/crontab generation is platform-specific.** Need to handle macOS,
   Linux, and "neither" (Windows, unusual systems) gracefully.
2. **`child_process.spawn()` with detached in SEA binaries** — needs testing.
   The binary path detection must work for installed CLI, dev checkout, and
   pnpm dlx.
3. **Crontab manipulation can fail** — permission issues, no crontab installed,
   user has existing entries.

**Mitigations:**

1. Detect platform, generate appropriate config, fail gracefully with
   manual instructions if neither launchd nor crontab is available.
2. Use `process.execPath` for SEA, detect `pnpm dlx` and warn that
   scheduling requires an installed CLI.
3. Use `crontab -l | grep -v vana | cat - new_entry | crontab -` pattern
   to preserve existing entries.

**Final answer: implement --detach + connection health + vana schedule
using OS-native scheduling. No custom daemon.**
