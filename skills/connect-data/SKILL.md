---
name: connect-data
description: >
  Connect personal data from any web platform using browser automation.
  Use when: (1) user wants to connect a data source like ChatGPT, Instagram,
  Spotify, or any platform, (2) user says "connect my [platform]",
  (3) user wants to generate or update their profile from connected data.
  Also triggers on: "create a connector for [platform]".
---

# Connect

Connect personal data from web platforms using the `vana` CLI and local browser automation.

## Setup

Prefer an installed `vana` CLI on `PATH`:

```bash
command -v vana
```

If that succeeds, use:

```bash
vana
```

If `vana` is unavailable, install the current published canary. Prefer:

macOS with Homebrew:

```bash
brew install vana-com/tap/vana
```

macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/vana-com/vana-connect/feat/connect-cli-v1/install/install.sh | sh -s -- --version canary-feat-connect-cli-v1
```

Only if the installed CLI path is unavailable or blocked, fall back to:

```bash
npx -y @opendatalabs/connect@canary
```

If the user is explicitly testing local changes, fall back to:

```bash
node /home/tnunamak/code/vana-connect/dist/cli/bin.js
```

If neither path is available, follow `SETUP.md` in this folder.

Before connecting a source, check runtime state with:

```bash
vana status --json
```

If the user needs install, path, or upgrade diagnostics, use:

```bash
vana doctor
```

If the user needs recent setup, fetch, or run logs, use:

```bash
vana logs
vana logs <platform>
```

If the runtime is missing, tell the user: "I need to do a one-time setup first. This downloads a browser engine and some dependencies into `~/.vana/` and usually takes about a minute." Then run:

```bash
vana setup --yes
```

## Flow

### 1. Explore available sources

```bash
vana sources --json
```

This is the source of truth for what the CLI can currently connect. Prefer it over inspecting repo files manually.

If the requested platform is present, use the CLI flow below.

**If no connector exists for the platform,** tell the user you'll build one — this involves researching the platform's data APIs, writing the extraction code, and testing it. Let them know it'll take a bit and they're welcome to do something else while you work. Then read `CREATE.md` and follow it.

### 2. Check the source's auth mode

Each source has an `authMode` in `vana sources --json`:

- `interactive` — prompts for credentials in the terminal. **You can handle this directly.**
- `legacy` — opens a headed browser window. **You cannot do this. Tell the user to run it in their own terminal.**
- `automated` — no auth needed. Fully autonomous.

### 3. Connect with the CLI

**For `interactive` or `automated` sources:** Use IPC mode with `run_in_background`.

IMPORTANT: You MUST use `run_in_background: true` for the connect command. The process will block while waiting for credentials. If you run it in the foreground, your bash call will hang and you won't be able to respond to prompts.

Step 1: Start the connect in the background.

```bash
vana connect <platform> --json --ipc 2>&1
```

Use `run_in_background: true` for this command.

Step 2: Immediately read the background task output. Look for a `needs-input` JSON line containing `pendingInputPath` and `responseInputPath`. If you see `connected` instead, the saved session worked and you're done.

Step 3: If credentials are needed, read the pending input file to see what fields are required:

```bash
cat <pendingInputPath from the needs-input event>
```

Step 4: Ask the user for the required credentials.

Step 5: Write the response file (use the exact `responseInputPath` from the event):

```bash
echo '{"username":"value","password":"value"}' > <responseInputPath>
```

Step 6: Check the background task output again. The connector may prompt again (e.g. for 2FA). If so, repeat steps 3-5 with the new pending input file. If the task completes, you're done.

Note: The connector polls for up to 5 minutes per prompt. If the user takes longer, it will time out and you'll need to rerun.

**For `legacy` (browser) sources:** You cannot connect these. Tell the user:

> Run `vana connect <platform>` in your terminal. It will open a browser for you to log in. Say "done" when finished.

**For a quick status check without connecting:** Use the `--json --no-input` probe. This checks if a saved session works without prompting:

```bash
vana connect <platform> --json --no-input
```

Outcomes: `needs_input`, `legacy_auth`, `connected_local_only`, or `connected_and_ingested`.

If the user specifically wants to inspect current state before rerunning, use:

```bash
vana status
```

### 3. Handle outcomes

The CLI emits structured JSON events in `--json` mode.

Key outcomes:

- `needs_input`
  The connector needs a live login or another manual step. Explain that you'll rerun interactively.
- `legacy_auth`
  The connector still depends on `showBrowser` / `promptUser`. Explain that this source still needs a headed/manual session path and may not work in fully headless batch mode yet.
- `connected_local_only`
  Data was collected locally but no Personal Server target was available.
- `connected_and_ingested`
  Data was collected and synced to the Personal Server.

If setup, fetch, or run output is truncated, use:

```bash
vana logs
vana logs <platform>
```

Prefer that over manually hunting through `~/.vana/logs/` or rerunning blindly.

After a successful connect, prefer the CLI data surfaces over raw file inspection when possible:

```bash
vana data list
vana data show <platform>
vana data path <platform>
vana logs <platform>
```

### 4. Validate, present results, and offer to contribute

If you built or modified a connector, immediately run validation — before presenting results to the user:

```bash
node scripts/validate.cjs <company>/<name>-playwright.js --check-result ~/.vana/last-result.json
```

Fix any issues the validator reports. The validator checks debug code, login method diversity, schema descriptions, data cleanliness, and more — it is the quality gate. Iterate until validation passes.

Then read the result file and summarize for the user in human terms (see "Communicating with the user" below).

If you built a new connector (not one from the registry), ask the user:

> "Want to share this connector so others can connect their [Platform] data too? Contributing means the community helps maintain it when [Platform] changes their site."

If yes, run `node scripts/validate.cjs <company>/<name>-playwright.js --contribute`. If no, move on.

### 5. Suggest what to do with the data

After the contribution question is resolved (or if using an existing connector), suggest use cases from `RECIPES.md`: user profile generation, personal knowledge base, data backup, cross-platform synthesis, activity analytics.

## Communicating with the user

The user can't see what you're doing behind the scenes. Keep them informed at key moments:

1. **Before asking for credentials**, explain the approach and reassure on privacy:
   - "I'll connect to [Platform] using a local browser on your machine. Your credentials stay local — nothing is sent to any server except [Platform] itself."
   - If using an API key: "This uses [Platform]'s API key. You can find it at [location]. The key stays on your machine."

2. **During long operations** (building a connector, collecting paginated data), give brief progress updates. Don't go silent for more than ~30 seconds.

3. **After collection**, summarize results in human terms — not file paths:
   - Good: "Connected! I collected 249 issues, 63 projects, 9 teams, and your profile from Linear."
   - Bad: "Data saved to ~/.vana/last-result.json"
   - Prefer the CLI outcome plus the result file. Build the summary from `exportSummary` and the scoped keys.

4. **On failure**, explain what went wrong and what the user can do:
   - Auth failed → "Login didn't work. Can you double-check your credentials?"
   - Platform API changed → "The connector couldn't find the expected data. The platform may have changed their site."

## Rules

1. **Ask before saving** -- no writes to user profile without approval
2. **Never log credentials** -- no echo, print, or output of secrets
3. **One platform at a time**
4. **Check session first** -- try without credentials if a browser profile exists
5. **Read connectors before running them**
6. **Use the CLI as the primary interface** -- only drop to raw scripts when debugging or updating connector internals

## CLI fallback order

Use this order when choosing the CLI entrypoint:

1. installed `vana`
2. official installer path for the current canary
3. `npx -y @opendatalabs/connect@canary`
4. `node /home/tnunamak/code/vana-connect/dist/cli/bin.js` only for local development or debugging
