# CLI Open Issues

Tracked issues, polish items, and upstream dependencies for the CLI.

## Upstream (data-connectors repo)

- [ ] **Shorten connector descriptions.** Current: "Exports your X using
      Playwright browser automation." Proposed: "Exports your X via Playwright."
      or similar. Needs to change in the data-connectors `registry.json` first,
      then demo fixtures here will follow automatically.

## Polish (this repo)

- [ ] **Spinner stacking in connect flow.** Multiple paused spinner lines appear
      stacked line-by-line during `vana connect`. Compare against best-in-class
      CLI progress patterns (Vercel, Railway).
- [ ] **Verify color palette.** Confirm CLI output uses the proper Vana palette
      from `~/code/vana-app` CSS.
- [ ] **Clarify "needs attention" / "legacy" / "manual step" mental model.**
      These states are confusing in headed vs headless contexts. "Legacy"
      effectively means the connector doesn't call `requestInput`, which behaves
      like `--no-input` was forced.

## Design questions

- [ ] **`vana data show` schema assumptions.** How does "Latest repos:
      vana-connect, data-connectors" get produced? Is it brittle path matching
      or mechanical? Where do we assume things about data shapes we shouldn't?
- [ ] **`--no-input` vs input-up-front.** Can agents pass credentials in
      advance? How should connectors support pre-supplied input?
- [ ] **Source selection UX.** Should `vana sources` allow selecting multiple
      sources to connect in one flow?
- [ ] **"Steam not available" experience.** What's the lowest-friction path?
      Agent-built connector, GitHub issue submission, request form?
- [ ] **Personal server integration.** Minimal CLI functionality for users
      already running DataConnect desktop with a personal server.

## Scope expansion (document only, don't build yet)

- [ ] **Agent demo GIFs/transcripts.** Show a coding agent using the CLI.
- [ ] **Bundled skills / agent doc installation.** `vana` installs a SKILL.md
      into the user's agent directory.
- [ ] **GIF CI automation.** Currently CI renders GIFs as artifacts but doesn't
      commit them back. Consider auto-committing or a bot PR.
