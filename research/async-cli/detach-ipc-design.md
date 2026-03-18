# --detach + requestInput Design

## The problem

`vana connect chatgpt --detach` spawns a background process. The
connector may need credentials (first time or expired session).
The background process has no stdin. Who answers?

## Scenarios

### 1. First-time connect (no saved session)

The connector will definitely need credentials. Detaching is pointless
because the process will immediately pause waiting for auth.

**What Plaid does:** You must complete Link (interactive auth) before
any background data access works. There is no "detach the first auth."

**Design:** Refuse to detach if no session exists. Tell the caller
(human or agent) to authenticate first.

### 2. Returning connect (saved session valid)

The connector uses the saved browser cookies. No auth needed.
Collection runs to completion in the background.

**Design:** This is the happy path. `--detach` works perfectly.

### 3. Returning connect (saved session expired)

The connector starts, tries the saved session, it fails.
Now what?

**Option A: --detach implies --ipc**
The connector writes a pending-input file and waits (up to 30 min).
Problem: who polls for the file?

- Human: unlikely to check within 30 minutes
- Agent: possible if it's watching, but the agent may not be running
- Result: likely timeout, wasted 30 minutes

**Option B: --detach fails fast on auth**
The connector hits auth failure, writes `needs_reauth` to state,
exits with non-zero. No waiting.
Problem: the user wanted background collection, got nothing.
But: `vana status` shows the failure. Next interactive `vana connect`
re-authenticates. Then `--detach` works again.

**Option C: --detach + --ipc + notification**
Like Option A but also writes a notification file. `vana status`
shows "ChatGPT needs re-login (background collection paused)."
Problem: still waits 30 minutes for nothing most of the time.

**Option D: --detach fails fast + notifies**
Like Option B but also emits a desktop notification or terminal bell
on the original terminal (if still open).

## What Plaid actually does

When a background fetch hits auth failure:

1. The fetch fails
2. Item status changes to LOGIN_REQUIRED
3. Plaid sends a webhook to the developer
4. The developer shows a prompt to the user to re-authenticate
5. User goes through Link update mode (abbreviated, not full re-setup)
6. Background fetches resume

Key insight: **Plaid does NOT wait for re-auth during the failed fetch.**
It fails, records the state, notifies, and moves on. The re-auth
happens separately, triggered by the user, at their convenience.

## Design decision

**Option B is correct.** It matches Plaid's pattern exactly:

1. `--detach` spawns background process
2. Connector tries saved session
3. If auth fails: set `connectionHealth: 'needs_reauth'`, exit
4. `vana status` shows it prominently
5. User runs `vana connect chatgpt` to re-auth (interactive)
6. Next `--detach` works again

No IPC in detach mode. No 30-minute wait. Fail fast, record state,
let the user re-auth at their convenience.

`--ipc` remains available for agents that ARE actively watching
(like Claude Code's background task flow).

## Implementation

`--detach` should:

1. Check if source has been previously connected (has state entry)
   - If not: refuse. "Run `vana connect chatgpt` first."
2. Spawn child with `--json --quiet --no-input`
   - NOT `--ipc`. If auth is needed, fail fast.
3. Child runs, either succeeds or fails on auth
4. On success: update state to healthy
5. On auth failure: update state to needs_reauth
6. `vana status` surfaces the result either way

This means `--detach` is for RE-COLLECTION with existing sessions,
not for first-time auth. Which is the correct mental model:
detach = "do the thing I already set up, in the background."
