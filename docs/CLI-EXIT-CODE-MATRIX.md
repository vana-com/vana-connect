# CLI Exit Code Matrix

This document defines the current `vana` exit-code contract.

The guiding rule is simple:

- `0` means the requested command completed successfully
- `1` means the requested command did not complete successfully, including
  guided/recoverable cases like missing source input, setup required, or manual
  action still needed

The CLI does **not** currently use a large family of bespoke nonzero exit
codes. The machine-readable distinction comes from:

- the JSON payload for command surfaces like `status`, `sources`, `data`, and
  errors
- streamed `outcome` / runtime events for connect flows

## Top-level Commands

| Command               | Success                | Non-success |
| --------------------- | ---------------------- | ----------- |
| `vana`                | `0` when help is shown | n/a         |
| `vana --help`         | `0`                    | n/a         |
| `vana --version`      | `0`                    | n/a         |
| `vana version`        | `0`                    | n/a         |
| `vana version --json` | `0`                    | n/a         |
| `vana status`         | `0`                    | n/a         |
| `vana status --json`  | `0`                    | n/a         |
| `vana doctor`         | `0`                    | n/a         |
| `vana doctor --json`  | `0`                    | n/a         |
| `vana sources`        | `0`                    | n/a         |
| `vana sources --json` | `0`                    | n/a         |

## Connect

| Command / Outcome                                      | Exit code | Notes                                                  |
| ------------------------------------------------------ | --------- | ------------------------------------------------------ |
| `vana connect <source>` success                        | `0`       | Includes local-only and synced success                 |
| `vana connect` guided picker success                   | `0`       | When a source is selected and the connect run succeeds |
| `vana connect --json` without source                   | `1`       | Returns `source_required` JSON                         |
| `vana connect` without source in non-interactive shell | `1`       | Prints guidance                                        |
| Guided picker cancelled                                | `1`       | No connection was made                                 |
| Setup required / setup declined                        | `1`       | Recoverable via `vana setup` or rerun                  |
| `needs_input` in `--no-input` mode                     | `1`       | Recoverable by rerunning without `--no-input`          |
| `legacy_auth` / manual browser step still required     | `1`       | Recoverable by rerunning interactively                 |
| Connector unavailable                                  | `1`       | Recoverable if/when the connector becomes available    |
| Runtime/internal failure                               | `1`       | Inspect logs / doctor output                           |

## Data

| Command / Outcome                         | Exit code | Notes                                           |
| ----------------------------------------- | --------- | ----------------------------------------------- |
| `vana data`                               | `0`       | Shows help                                      |
| `vana data list`                          | `0`       | Even when no data exists yet                    |
| `vana data list --json`                   | `0`       | Returns an empty list when nothing is collected |
| `vana data show <source>` success         | `0`       | Prints summary and next steps                   |
| `vana data show <source> --json` success  | `0`       | Returns structured dataset payload              |
| `vana data show <source>` missing dataset | `1`       | Recoverable via `vana connect <source>`         |
| `vana data path <source>` success         | `0`       | Human mode prints the path only                 |
| `vana data path <source>` missing dataset | `1`       | Recoverable via `vana connect <source>`         |

## Logs

| Command / Outcome                   | Exit code | Notes                                     |
| ----------------------------------- | --------- | ----------------------------------------- |
| `vana logs`                         | `0`       | Even when there are no stored logs yet    |
| `vana logs --json`                  | `0`       | Returns an empty log list when none exist |
| `vana logs <source>` success        | `0`       | Human mode prints the path only           |
| `vana logs <source> --json` success | `0`       | Returns structured log metadata           |
| `vana logs <source>` missing log    | `1`       | Recoverable by running the source again   |

## Setup

| Command / Outcome          | Exit code | Notes                                      |
| -------------------------- | --------- | ------------------------------------------ |
| `vana setup` success       | `0`       | Includes the already-installed case        |
| `vana setup --yes` success | `0`       | Includes runtime install completion        |
| `vana setup` failure       | `1`       | Runtime could not be installed or repaired |

## Design Notes

- Help surfaces return `0` because they are a successful user outcome.
- Guided/recoverable states still return `1` when the requested action did not
  actually complete.
- If the CLI later needs richer nonzero codes, it should add them
  intentionally, document them here, and keep the JSON/event contract aligned.
