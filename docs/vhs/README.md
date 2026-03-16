# VHS demos

This directory holds deterministic terminal demo assets for the `vana` CLI.

The goal is to make the README a reliable progress surface for the team without
depending on live credentials or live connector runs.

The visible commands in these tapes should match what a real user would type.
Fixture seeding, `HOME`, and any other harness setup should stay hidden in the
rendering scripts.

## Fixture model

The demo tapes should use:

- a temp or fixture `HOME`
- `VANA_DATA_CONNECTORS_DIR` pointing at a deterministic fixture connector repo
- seeded `~/.dataconnect/` state and result files

Prepare the fixture home with:

```bash
pnpm demo:vhs:fixtures
```

That creates:

- `docs/vhs/fixtures/demo-home/.dataconnect/vana-connect-state.json`
- fake installed connector files
- `docs/vhs/fixtures/demo-data-connectors/` with deterministic demo connectors
- a fake downloaded Chromium path so `vana status` reads as installed
- sample collected result files for `vana data ...`

## Current tapes

- `status-and-sources.tape`
- `data-inspection.tape`
- `connect-success.tape`

The public `connect-success` tape should end on user value, not only progress
output. In practice that means a successful `vana connect github` run followed
by `vana data show github`.

## Rendering

The preferred renderer is `vhs` from Charm.

One command path:

```bash
pnpm demo:vhs
```

That command:

- reseeds the fixture home
- renders all checked-in `.tape` files
- writes GIF assets next to the tapes

It will use a local `vhs` binary if present, or Docker if available.
By default the scripts prefer the deterministic fixture connector repo generated
under `docs/vhs/fixtures/demo-data-connectors/`, but you can override that with
`VANA_DATA_CONNECTORS_DIR=/path/to/data-connectors`.

CI also renders the tapes on Linux in the `demo-preview` job and uploads the
resulting GIFs and transcripts as a workflow artifact so the branch always has a
current review surface.

Typical usage once `vhs` is available locally:

```bash
HOME="$PWD/docs/vhs/fixtures/demo-home" \
VANA_DATA_CONNECTORS_DIR="/path/to/data-connectors" \
vhs docs/vhs/status-and-sources.tape
```

Generated GIF assets should be committed once they are stable enough for the
README.
