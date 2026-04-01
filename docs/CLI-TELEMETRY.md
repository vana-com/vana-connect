# CLI Telemetry

The `vana` CLI sends small anonymous operational telemetry by default to improve
connector reliability, auth flows, runtime setup, and command performance.
Collected user data stays local in `~/.vana/` unless you explicitly sync it to
your Personal Server.

## What is collected

Remote telemetry is limited to operational events such as:

- command family and subcommand
- source or connector id
- success or failure outcome
- duration and scope counts
- CLI version, install method, OS, architecture, and CI status
- normalized error class

Telemetry is anonymous by install. The CLI generates a local random install id
and does not attach telemetry to your Vana account by default.

## What is not collected

The CLI does not send:

- passwords, tokens, cookies, or device codes
- raw command arguments
- file paths or Personal Server URLs
- collected dataset contents
- prompt input, prompt output, screenshots, or connector result payloads

## Controls

```bash
vana telemetry status
vana telemetry enable
vana telemetry disable
```

Environment variables:

```bash
VANA_TELEMETRY_DISABLED=1
VANA_TELEMETRY_DEBUG=1
```

`VANA_TELEMETRY_DEBUG=1` prints the exact JSON envelope to `stderr` and skips
uploading it.

## Delivery model

Telemetry batches are first written to `~/.vana/telemetry/outbox/` and then sent
best-effort to `https://telemetry.opendatalabs.com/v1/cli/events`. Telemetry
failures never fail the user command.
