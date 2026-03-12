# `vana-connect` CLI Onboarding Copy

_As of March 12, 2026_

## Purpose

This document captures the intended onboarding copy for the first version of the `vana connect` CLI.

It is not final marketing copy. It is product copy for:

- first-run trust
- install prompts
- auth prompts
- success summaries
- failure messages

The goal is to make the first experience feel:

- clear
- fast
- trustworthy
- local-first
- technically serious

## Tone

The CLI should sound:

- calm
- precise
- concise

It should not sound:

- cute
- overly corporate
- vague
- overly verbose

## First-run principles

Before the CLI installs or writes anything significant, it should explain:

- what is missing
- what it will install or create
- where it will store it
- that credentials stay local

After success, it should explain:

- what data was collected
- whether it was ingested to the Personal Server
- what the next useful action is

## Canonical first-run example

Command:

```bash
vana connect steam
```

### If runtime is missing

Suggested copy:

```text
Vana Connect needs a local browser runtime before it can connect Steam.

This will install:
- the connector runner
- a Chromium browser engine
- local runtime files under ~/.dataconnect/

Your credentials stay on this machine. Nothing is sent anywhere except the platform you’re connecting to.

Continue? [Y/n]
```

### If `--yes` is present

Suggested copy:

```text
Installing local runtime for Vana Connect...
```

## Install progress copy

Suggested copy:

```text
Installing runner...
Installing browser engine...
Preparing local runtime...
Runtime ready.
```

This should stay short. It should not dump raw dependency noise unless the install fails or verbose mode is requested.

## Connector fetch copy

### Human mode

Suggested copy:

```text
Finding a connector for Steam...
Connector ready.
```

### If connector is not found

Suggested copy:

```text
No connector is available for Steam yet.
```

Optional next step later:

```text
You can create one with Vana Connect tooling, but that is not part of the default connect flow.
```

For MVP, avoid dragging the user into connector creation unless that is the explicit task.

## Session reuse copy

### If a saved session may exist

Suggested copy:

```text
Found an existing Steam session. Trying that first...
```

### If re-auth is needed

Suggested copy:

```text
Your saved Steam session needs to be refreshed.
```

This should feel like a normal repair path, not a mysterious failure.

## Auth prompt copy

### Base trust message

Suggested copy:

```text
To connect Steam, Vana Connect will open a local browser session on this machine.
Your credentials stay local.
```

### Credentials request

Suggested copy:

```text
Steam needs your login details to continue.
Enter the requested fields below.
```

### Two-factor request

Suggested copy:

```text
Steam asked for a verification code.
Enter the current code to continue.
```

### If non-interactive mode blocks prompting

Suggested copy:

```text
Steam needs additional input, but prompting is disabled in --no-input mode.
Run again without --no-input, or provide the required inputs explicitly.
```

## Collection progress copy

Human mode should communicate phases, not raw events.

Suggested copy:

```text
Connecting to Steam...
Collecting your data...
Still working...
```

If counts are known:

```text
Collecting your data...
Fetched 124 items so far...
```

Avoid fake precision. Only show counts when they are meaningful.

## Personal Server copy

The CLI should speak in terms of the user’s Personal Server, not internal app architecture.

### If Personal Server is available

Suggested copy:

```text
Personal Server detected. Syncing your Steam data...
```

### If Personal Server is unavailable

Suggested copy:

```text
No Personal Server is available right now, so your Steam data was saved locally.
```

### If ingest fails

Suggested copy:

```text
Your Steam data was collected, but syncing to your Personal Server did not complete.
The local result was saved successfully.
```

This distinction is critical. The CLI should never blur local success and ingest success.

## Success copy

### Best-case success

Suggested copy:

```text
Connected Steam.
Collected your Steam data and synced it to your Personal Server.
```

### Local-only success

Suggested copy:

```text
Connected Steam.
Collected your Steam data and saved it locally.
```

### Supporting detail

After the summary, provide one concise supporting line:

```text
Next: run `vana connect status` to inspect your current connection state.
```

Optional supporting detail:

```text
Local result: ~/.dataconnect/last-result.json
```

Artifact paths should be supporting information, not the main success story.

## Status copy

Example shape for `vana connect status`:

```text
Vana Connect status

Runtime: installed
Personal Server: available

Steam: connected, synced
GitHub: connected, local only
Spotify: not connected
```

If detail is needed, `--json` should carry the richer structure.

## Failure copy

### Install failed

Suggested copy:

```text
Vana Connect could not finish installing the local runtime.
Check your network connection and try `vana connect setup` again.
```

### Login failed

Suggested copy:

```text
Steam login did not complete.
Check your credentials and try again.
```

### Connector unavailable

Suggested copy:

```text
Vana Connect does not have a Steam connector available right now.
```

### Site changed / extraction failed

Suggested copy:

```text
Steam connected, but Vana Connect could not collect the expected data.
The site may have changed since this connector was last updated.
```

### Personal Server unavailable

Suggested copy:

```text
Your data was collected, but no Personal Server is currently available for sync.
```

Each failure should ideally include one clear next step, not a wall of debugging detail.

## Machine-mode guidance

In `--json` mode, the CLI should not emit this human copy as prose.

Instead, it should emit structured events and outcomes corresponding to:

- setup started / completed / failed
- connector resolved / not found
- needs input
- collection started / progressed / completed
- ingest started / completed / failed
- final outcome

The human copy in this document exists so the default mode feels excellent. Machine mode should express the same lifecycle structurally.

## Help copy principles

Help output should stay compact.

Example shape:

```text
vana connect <source>   Connect one data source
vana connect list       List supported sources
vana connect status     Show local and Personal Server status
vana connect setup      Install or repair local runtime
```

Then flags:

```text
--json       Output machine-readable JSON
--no-input   Fail instead of prompting for input
--yes        Approve safe setup prompts automatically
```

## Copy rules to preserve

- never lead with file paths
- never imply cloud upload when only local save happened
- never imply Personal Server sync when ingest failed or was skipped
- never make credentials handling sound vague
- never over-explain common success paths

## Conclusion

If the command model is the skeleton, this copy is the voice.

For MVP, the copy should make three things feel true immediately:

- this is safe
- this is working
- I know what happened
