# `vana-connect` CLI UX Simulation

_As of March 12, 2026_

## Purpose

This is a lightweight internal simulation pass for the `vana connect` CLI.

It exists to pressure-test:

- the first-run flow
- the trust model
- the human vs agent mode split
- the distinction between local collection and Personal Server ingest

This is not a polished prototype. It is a fast decision tool before locking the v1 spec.

## What we are testing

The main questions are:

- does the canonical first command feel right?
- does setup inline cleanly?
- does success feel meaningful?
- is local-only vs ingested unmistakable?
- does `--json` mode feel agent-safe?

## Transcript 1: First-time human run, happy path with Personal Server available

Command:

```bash
vana connect steam
```

Output:

```text
Vana Connect needs a local browser runtime before it can connect Steam.

This will install:
- the connector runner
- a Chromium browser engine
- local runtime files under ~/.dataconnect/

Your credentials stay on this machine. Nothing is sent anywhere except Steam itself.

Continue? [Y/n] y

Installing runner...
Installing browser engine...
Preparing local runtime...
Runtime ready.

Finding a connector for Steam...
Connector ready.

Found an existing Steam session. Trying that first...

Connecting to Steam...
Collecting your data...

Personal Server detected. Syncing your Steam data...

Connected Steam.
Collected your Steam data and synced it to your Personal Server.

Next: run `vana connect status` to inspect your current connection state.
```

Assessment:

- strong start
- install copy feels clear
- outcome is meaningful
- likely good enough for MVP

Main risk:

- “Found an existing Steam session” should only appear when true

## Transcript 2: First-time human run, no Personal Server available

Command:

```bash
vana connect steam
```

Output:

```text
Finding a connector for Steam...
Connector ready.

Connecting to Steam...
Collecting your data...

No Personal Server is available right now, so your Steam data was saved locally.

Connected Steam.
Collected your Steam data and saved it locally.

Next: run `vana connect status` to inspect your current connection state.
Local result: ~/.dataconnect/last-result.json
```

Assessment:

- the distinction between local and ingested is clear
- still feels like success, which is important

Main risk:

- if this happens too often, users may feel they only got a partial product

Implication:

- if Personal Server availability is part of the intended default experience, the CLI should probably attempt to detect and message it very early

## Transcript 3: Human run requiring credentials

Command:

```bash
vana connect steam
```

Output:

```text
Finding a connector for Steam...
Connector ready.

To connect Steam, Vana Connect will open a local browser session on this machine.
Your credentials stay local.

Steam needs your login details to continue.
Enter the requested fields below.

Email or username: alice@example.com
Password: ********

Collecting your data...

Connected Steam.
Collected your Steam data and saved it locally.
```

Assessment:

- good enough for MVP
- trust copy is doing useful work

Main risk:

- if the connector actually uses a file-based continuation path under the hood, the interactive experience needs to hide that complexity unless it fails

## Transcript 4: Human run with 2FA

Command:

```bash
vana connect steam
```

Output:

```text
Finding a connector for Steam...
Connector ready.

To connect Steam, Vana Connect will open a local browser session on this machine.
Your credentials stay local.

Steam needs your login details to continue.
Enter the requested fields below.

Email or username: alice@example.com
Password: ********

Steam asked for a verification code.
Enter the current code to continue.

Verification code: 123456

Collecting your data...

Connected Steam.
Collected your Steam data and saved it locally.
```

Assessment:

- simple and legible

Main risk:

- time-sensitive codes mean the actual implementation must not introduce lag between prompt and submission

## Transcript 5: Agent run in JSON mode, success with local-only result

Command:

```bash
vana connect steam --json --no-input
```

Output:

```json
{"type":"setup-check","runtime":"installed"}
{"type":"connector-resolved","source":"steam","connectorPath":"/home/user/.dataconnect/connectors/valve/steam-playwright.js"}
{"type":"run-started","source":"steam"}
{"type":"collection-complete","source":"steam","resultPath":"/home/user/.dataconnect/last-result.json"}
{"type":"ingest-skipped","reason":"personal_server_unavailable"}
{"type":"outcome","status":"connected_local_only","source":"steam","resultPath":"/home/user/.dataconnect/last-result.json"}
```

Assessment:

- this is the right general shape
- concise and deterministic

Main risk:

- event names and field names must be stabilized in the spec, not invented per command

## Transcript 6: Agent run in JSON mode, input required

Command:

```bash
vana connect steam --json --no-input
```

Output:

```json
{"type":"setup-check","runtime":"installed"}
{"type":"connector-resolved","source":"steam","connectorPath":"/home/user/.dataconnect/connectors/valve/steam-playwright.js"}
{"type":"needs-input","source":"steam","fields":["username","password"],"message":"Steam needs credentials"}
{"type":"outcome","status":"needs_input","source":"steam"}
```

Assessment:

- good for agents
- avoids hanging

Main risk:

- if the underlying runtime produces richer field schemas, the CLI should preserve them in machine mode rather than collapsing too much

## Transcript 7: Status command

Command:

```bash
vana connect status
```

Output:

```text
Vana Connect status

Runtime: installed
Personal Server: available

Steam: connected, synced
GitHub: connected, local only
Spotify: not connected
```

Assessment:

- compact and useful
- enough for MVP if backed by real state

Main risk:

- status can easily become misleading if state is inferred too loosely

Implication:

- the implementation should prefer conservative status language over pretending certainty

## Transcript 8: Setup failure

Command:

```bash
vana connect steam
```

Output:

```text
Vana Connect could not finish installing the local runtime.
Check your network connection and try `vana connect setup` again.
```

Assessment:

- clean fallback
- preserves `setup` as repair path

Main risk:

- if the real failure is more specific, the CLI should include a short cause line when available

## Decisions after simulation

The simulation supports these decisions:

- `vana connect <source>` is the right canonical first command
- inline setup is better than forcing `setup` first
- the product must distinguish:
  - connected and ingested
  - connected local only
- `--json --no-input` is enough for the core agent mode in MVP
- `status` is essential for trust and recovery

## Small adjustments suggested by the simulation

### 1. Make Personal Server state visible early

The user should not be surprised at the end to learn that their data is only local.

The CLI should likely detect target availability during connect and be ready to message it clearly.

### 2. Stabilize machine event names in the v1 spec

The JSON transcripts feel right, but the exact event contract needs to be locked.

### 3. Keep human output extremely compact

Anything more verbose than these transcripts will likely reduce the sense of polish.

## Conclusion

The current design direction survives a lightweight transcript test.

It is now reasonable to write the v1 spec with confidence, focusing on:

- command behavior
- event contract
- outcome states
- state inspection rules
