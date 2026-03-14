# VHS demos

This directory holds deterministic terminal demo assets for the `vana` CLI.

The goal is to make the README a reliable progress surface for the team without
depending on live credentials or live connector runs.

## Fixture model

The demo tapes should use:

- a temp or fixture `HOME`
- `VANA_DATA_CONNECTORS_DIR` pointing at the local `data-connectors` repo
- seeded `~/.dataconnect/` state and result files

Prepare the fixture home with:

```bash
pnpm demo:vhs:fixtures
```

That creates:

- `docs/vhs/fixtures/demo-home/.dataconnect/vana-connect-state.json`
- fake installed connector files
- a fake downloaded Chromium path so `vana status` reads as installed
- sample collected result files for `vana data ...`

## Planned first tapes

- `status-and-sources.tape`
- `data-inspection.tape`
- `connect-guided.tape`

## Rendering

The preferred renderer is `vhs` from Charm.

One command path:

```bash
pnpm demo:vhs
```

That command:

- reseeds the fixture home
- renders all checked-in `.tape` files
- writes SVG assets next to the tapes

It will use a local `vhs` binary if present, or Docker if available.
By default the scripts look for a sibling `../data-connectors` checkout, but
you can override that with `VANA_DATA_CONNECTORS_DIR=/path/to/data-connectors`.

CI also renders the tapes on Linux in the `demo-preview` job and uploads the
resulting SVGs and transcripts as a workflow artifact so the branch always has a
current review surface.

Typical usage once `vhs` is available locally:

```bash
HOME="$PWD/docs/vhs/fixtures/demo-home" \
VANA_DATA_CONNECTORS_DIR="/home/tnunamak/code/data-connectors" \
vhs docs/vhs/status-and-sources.tape
```

Generated SVG assets should be committed once they are stable enough for the
README.
