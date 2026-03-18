import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import { confirm, input, password, select } from "@inquirer/prompts";
import { Command, CommanderError } from "commander";

// Vana-branded theme for inquirer prompts — matches brand palette
const VANA_BLUE = "\x1b[38;2;65;65;252m";
const VANA_MUTED = "\x1b[38;2;112;112;112m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const BOLD_RESET = "\x1b[22m";
const vanaPromptTheme = {
  theme: {
    prefix: { idle: `${VANA_BLUE}?${RESET}`, done: `${VANA_BLUE}✓${RESET}` },
    style: {
      answer: (text: string) => `${BOLD}${text}${BOLD_RESET}`,
      message: (text: string, status: "idle" | "done" | "loading") =>
        status === "done" ? `${VANA_MUTED}${text}${RESET}` : text,
      highlight: (text: string) => `${VANA_BLUE}${text}${RESET}`,
      help: (text: string) => `${VANA_MUTED}${text}${RESET}`,
      error: (text: string) => `\x1b[38;2;231;0;11m${text}${RESET}`,
    },
  },
};

import {
  createConnectRenderer,
  createHumanRenderer,
  formatDisplayPath,
  formatRelativeTime,
} from "./render/index.js";
import type { ConnectRenderer } from "./render/connect-renderer.js";
import {
  CliOutcomeStatus,
  getBrowserProfilesDir,
  getConnectorCacheDir,
  getSourceResultPath,
  readCliState,
  readCliConfig,
  updateCliConfig,
  updateSourceState,
} from "../core/index.js";
import type {
  CliChannel,
  CliEvent,
  CliInstallMethod,
  CliOutcome,
  CliStatus,
  SourceStatus,
} from "../core/cli-types.js";
import type { AvailableSource } from "../connectors/registry.js";
import {
  fetchConnectorToCache,
  listAvailableSources,
  readCachedConnectorMetadata,
} from "../connectors/registry.js";
import {
  detectPersonalServerTarget,
  ingestResult,
} from "../personal-server/index.js";
import {
  findDataConnectorsDir,
  ManagedPlaywrightRuntime,
} from "../runtime/index.js";
import {
  listAvailableSkills,
  installSkill,
  readInstalledSkills,
} from "../skills/index.js";
import {
  queryStatus,
  querySources,
  queryDataList,
  queryDataShow,
  queryDoctor,
} from "./queries.js";

interface GlobalOptions {
  json?: boolean;
  noInput?: boolean;
  yes?: boolean;
  quiet?: boolean;
}

interface SourceLabelMap {
  [source: string]: string;
}

interface SourceMetadataMap {
  [source: string]: {
    name: string;
    company?: string;
    description?: string;
    authMode?: "automated" | "interactive" | "legacy";
  };
}

function cleanDescription(desc: string): string {
  return desc
    .replace(/ using Playwright browser automation\.?/i, ".")
    .replace(/^Exports\b\s*(your\s+)?/i, "Your ");
}

interface Emitter {
  event(event: CliEvent | CliOutcome): void;
  info(message: string): void;
  blank(): void;
  title(message: string): void;
  success(message: string): void;
  section(message: string): void;
  keyValue(label: string, value: string, tone?: RenderTone): void;
  detail(message: string): void;
  next(command: string): void;
  bullet(message: string): void;
  sourceTitle(
    name: string,
    badges?: Array<{ text: string; tone?: RenderTone }>,
  ): void;
  badge(text: string, tone?: RenderTone): string;
  code(text: string): string;
}

type RenderTone = "accent" | "success" | "warning" | "error" | "muted" | "info";
const require = createRequire(import.meta.url);

type SourceStatusDetail =
  | {
      kind: "text";
      message: string;
    }
  | {
      kind: "row";
      label: string;
      value: string;
      tone?: RenderTone;
    };

export async function runCli(argv = process.argv): Promise<number> {
  const normalizedArgv = normalizeArgv(argv);
  if (normalizedArgv.length <= 2) {
    normalizedArgv.push("--help");
  }
  const parsedOptions = extractGlobalOptions(normalizedArgv);
  const cliVersion = getCliVersion();
  const program = new Command();
  program
    .name("vana")
    .description("Connect sources, collect data, and inspect it locally.")
    .version(cliVersion, "-v, --version", "Print CLI version")
    .showSuggestionAfterError(true)
    .addHelpText(
      "after",
      `
Quick start:
  vana connect           Connect a source and collect data
  vana sources           Browse available sources
  vana status            Check system health

Data:
  vana data list         List collected datasets
  vana data show <src>   Inspect a dataset

Server:
  vana server            Personal Server status and management

Agent:
  vana mcp               Start MCP server (for Claude Code, Cursor, etc.)
  vana skill list         List available agent skills
  vana skill install      Install a skill for your agent

More:
  vana doctor            Detailed diagnostics
  vana logs [source]     View run logs
  vana setup             Install or repair runtime
`,
    );
  program.exitOverride();

  program
    .command("version")
    .description("Print CLI version")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      if (parsedOptions.json) {
        process.stdout.write(
          `${JSON.stringify({
            cliVersion,
            channel: getCliChannel(cliVersion),
            installMethod: getCliInstallMethod(),
          })}\n`,
        );
        process.exitCode = 0;
        return;
      }

      process.stdout.write(
        `${cliVersion} (${getCliChannel(cliVersion)}, ${formatInstallMethodLabel(getCliInstallMethod()).toLowerCase()})\n`,
      );
      process.exitCode = 0;
    });

  const connectCommand = program
    .command("connect [source]")
    .description("Connect a source and collect data")
    .option("--json", "Output machine-readable JSON")
    .option("--no-input", "Fail instead of prompting for input")
    .option("--yes", "Approve safe setup prompts automatically")
    .option("--quiet", "Reduce non-essential output")
    .action(async (source?: string) => {
      process.exitCode = source
        ? await runConnect(source, parsedOptions)
        : await runConnectEntry(parsedOptions);
    });
  connectCommand.addHelpText(
    "after",
    `
Examples:
  vana connect
  vana connect github
  vana connect github --json --no-input
`,
  );

  const sourcesCommand = program
    .command("sources [source]")
    .description("List supported sources, or show detail for one source")
    .option("--json", "Output machine-readable JSON")
    .action(async (source?: string) => {
      process.exitCode = source
        ? await runSourceDetail(source, parsedOptions)
        : await runList(parsedOptions);
    });
  sourcesCommand.addHelpText(
    "after",
    `
Examples:
  vana sources
  vana sources github
  vana sources --json | jq '.sources'
`,
  );

  const collectCommand = program
    .command("collect [source]")
    .description("Re-collect data from a previously connected source")
    .option("--json", "Output machine-readable JSON")
    .option("--no-input", "Fail instead of prompting for input")
    .option("--yes", "Approve safe setup prompts automatically")
    .option("--quiet", "Reduce non-essential output")
    .action(async (source?: string) => {
      process.exitCode = source
        ? await runCollect(source, parsedOptions)
        : await runCollectAll(parsedOptions);
    });
  collectCommand.addHelpText(
    "after",
    `
Examples:
  vana collect github
  vana collect
  vana collect --json
`,
  );

  const statusCommand = program
    .command("status")
    .description("Show runtime and Personal Server status")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      process.exitCode = await runStatus(parsedOptions);
    });
  statusCommand.addHelpText(
    "after",
    `
Examples:
  vana status
  vana status --json | jq
`,
  );

  const doctorCommand = program
    .command("doctor")
    .description("Inspect local CLI, runtime, and install health")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      process.exitCode = await runDoctor(parsedOptions);
    });
  doctorCommand.addHelpText(
    "after",
    `
Examples:
  vana doctor
  vana doctor --json | jq
`,
  );

  const setupCommand = program
    .command("setup")
    .description("Install or repair the local runtime")
    .option("--json", "Output machine-readable JSON")
    .option("--yes", "Approve safe setup prompts automatically")
    .action(async () => {
      process.exitCode = await runSetup(parsedOptions);
    });
  setupCommand.addHelpText(
    "after",
    `
Examples:
  vana setup
  vana setup --yes
`,
  );

  const data = program
    .command("data")
    .description("Inspect collected datasets, paths, and summaries");
  data.addHelpText(
    "after",
    `
Examples:
  vana data list
  vana data show github
  vana data path github --json
`,
  );
  data.action(() => {
    data.outputHelp();
    process.exitCode = 0;
  });

  const dataListCommand = data
    .command("list")
    .description("List locally available collected datasets")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      process.exitCode = await runDataList(parsedOptions);
    });
  dataListCommand.addHelpText(
    "after",
    `
Examples:
  vana data list
  vana data list --json | jq '.datasets'
`,
  );

  const dataShowCommand = data
    .command("show <source>")
    .description("Show a collected dataset")
    .option("--json", "Output machine-readable JSON")
    .action(async (source: string) => {
      process.exitCode = await runDataShow(source, parsedOptions);
    });
  dataShowCommand.addHelpText(
    "after",
    `
Examples:
  vana data show github
  vana data show github --json | jq '.summary'
`,
  );

  const dataPathCommand = data
    .command("path <source>")
    .description("Print the local path for a collected dataset")
    .option("--json", "Output machine-readable JSON")
    .action(async (source: string) => {
      process.exitCode = await runDataPath(source, parsedOptions);
    });
  dataPathCommand.addHelpText(
    "after",
    `
Examples:
  vana data path github
  vana data path github --json | jq -r '.path'
`,
  );

  const logsCommand = program
    .command("logs [source]")
    .description("Inspect stored connector run logs")
    .option("--json", "Output machine-readable JSON")
    .action(async (source?: string) => {
      process.exitCode = await runLogs(source, parsedOptions);
    });
  logsCommand.addHelpText(
    "after",
    `
Examples:
  vana logs
  vana logs github
  vana logs github --json | jq
`,
  );

  const server = program
    .command("server")
    .description("Manage Personal Server connection")
    .option("--json", "Output machine-readable JSON");
  server.addHelpText(
    "after",
    `
Examples:
  vana server
  vana server set-url http://localhost:8080
  vana server set-url https://ps-abc123.server.vana.org
  vana server clear-url
`,
  );
  server.action(async () => {
    process.exitCode = await runServerStatus(parsedOptions);
  });

  server
    .command("status")
    .description("Show Personal Server status")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      process.exitCode = await runServerStatus(parsedOptions);
    });

  server
    .command("set-url <url>")
    .description("Save a Personal Server URL")
    .option("--json", "Output machine-readable JSON")
    .action(async (url: string) => {
      process.exitCode = await runServerSetUrl(url, parsedOptions);
    });

  server
    .command("clear-url")
    .description("Remove the saved Personal Server URL")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      process.exitCode = await runServerClearUrl(parsedOptions);
    });

  server
    .command("sync")
    .description("Sync all local-only datasets to your Personal Server")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      process.exitCode = await runServerSync(parsedOptions);
    });

  server
    .command("data [scope]")
    .description("List scopes stored in your Personal Server")
    .option("--json", "Output machine-readable JSON")
    .action(async (scope?: string) => {
      process.exitCode = await runServerData(scope, parsedOptions);
    });

  program
    .command("mcp")
    .description("Start MCP server for agent integration")
    .action(async () => {
      const { startMcpServer } = await import("./mcp-server.js");
      await startMcpServer();
    });

  const skill = program.command("skill").description("Manage agent skills");
  skill.addHelpText(
    "after",
    `
Examples:
  vana skill list
  vana skill install connect-data
  vana skill show connect-data
`,
  );
  skill.action(() => {
    skill.outputHelp();
    process.exitCode = 0;
  });

  skill
    .command("list")
    .description("List available agent skills")
    .option("--json", "Output as JSON")
    .action(async () => {
      process.exitCode = await runSkillList(parsedOptions);
    });

  skill
    .command("install <name>")
    .description("Install a skill for your agent")
    .action(async (name: string) => {
      process.exitCode = await runSkillInstall(name, parsedOptions);
    });

  skill
    .command("show <name>")
    .description("Show skill details")
    .action(async (name: string) => {
      process.exitCode = await runSkillShow(name, parsedOptions);
    });

  try {
    await program.parseAsync(normalizedArgv);
  } catch (error) {
    if (error instanceof CommanderError) {
      if (
        error.code === "commander.help" ||
        error.code === "commander.helpDisplayed" ||
        error.code === "commander.version"
      ) {
        process.exitCode = error.exitCode;
        return Number(process.exitCode ?? 0);
      }
      // Commander already printed to stderr; just set exit code.
      process.exitCode = error.exitCode;
      return Number(process.exitCode ?? 1);
    }
    throw error;
  }
  return Number(process.exitCode ?? 0);
}

async function runConnect(
  rawSource: string,
  options: GlobalOptions,
): Promise<number> {
  const source = rawSource.toLowerCase();
  const runtime = new ManagedPlaywrightRuntime();
  const emit = createEmitter(options);
  const renderer: ConnectRenderer | null =
    !options.json && !options.quiet ? createConnectRenderer() : null;
  const registrySources = await loadRegistrySources();
  const sourceLabels = createSourceLabelMap(registrySources);
  const displayName = displaySource(source, sourceLabels);
  let setupLogPath: string | undefined;
  let fetchLogPath: string | undefined;
  let runLogPath: string | undefined;
  let terminalExitCode: number | null = null;

  try {
    // Title
    renderer?.title(displayName);

    const target = await detectPersonalServerTarget();

    // --- Phase 1: Runtime check (silent if installed) ---
    if (runtime.state !== "installed") {
      if (options.noInput) {
        emit.event({
          type: "outcome",
          status: CliOutcomeStatus.SETUP_REQUIRED,
          source,
        });
        renderer?.fail(
          `${displayName} needs a local browser runtime. Run without --no-input to install.`,
        );
        return 1;
      }

      if (!options.yes) {
        renderer?.cleanup();
        process.stderr.write("\n");
        process.stderr.write("Vana Connect needs a local browser runtime.\n\n");
        process.stderr.write("This will install:\n");
        process.stderr.write("  \u2022 Connector runner\n");
        process.stderr.write("  \u2022 Chromium browser engine\n");
        process.stderr.write("  \u2022 Local files under ~/.dataconnect/\n\n");
        process.stderr.write("Your credentials stay on this machine.\n\n");

        const shouldContinue = await confirm({
          message: "Continue?",
          default: true,
          ...vanaPromptTheme,
        });
        if (!shouldContinue) {
          renderer?.fail("Cancelled.");
          emit.event({
            type: "outcome",
            status: CliOutcomeStatus.SETUP_REQUIRED,
            source,
            reason: "setup_declined",
          });
          return 1;
        }
        process.stderr.write("\n");
      }

      const installResult = await runtime.ensureInstalled(Boolean(options.yes));
      setupLogPath = installResult.logPath;
      emit.event({
        type: "setup-complete",
        runtime: installResult.runtime,
        logPath: installResult.logPath,
      });
      renderer?.scopeDone("Runtime ready");
    } else {
      emit.event({
        type: "setup-check",
        runtime: runtime.state,
      });
    }

    // --- Phase 2: Connector fetch (silent if cached/fast) ---
    let fetched: Awaited<
      ReturnType<ManagedPlaywrightRuntime["fetchConnector"]>
    >;
    try {
      fetched = await runtime.fetchConnector(source);
    } catch (firstError) {
      const firstMessage =
        firstError instanceof Error ? firstError.message : "";
      const isChecksumError =
        firstMessage.toLowerCase().includes("checksum") ||
        firstMessage.toLowerCase().includes("mismatch");

      // Auto-retry on stale cache: clear cached connector and re-fetch
      // from remote (skip local data-connectors dir which may be stale).
      if (isChecksumError) {
        try {
          const cacheDir = getConnectorCacheDir();
          const sourceCacheDir = path.join(cacheDir, source);
          await fsp.rm(sourceCacheDir, { recursive: true, force: true });
          const resolution = await fetchConnectorToCache(
            source,
            cacheDir,
            undefined, // force remote fetch, skip local data-connectors
          );
          fetched = {
            connectorPath: resolution.connectorPath,
            logPath: "",
            version: resolution.version,
          };
        } catch (retryError) {
          const retryMessage =
            retryError instanceof Error
              ? retryError.message
              : `Could not fetch ${displayName} connector.`;
          const message = formatHumanSourceMessage(
            retryMessage,
            source,
            displayName,
          );
          await updateSourceState(source, {
            connectorInstalled: false,
            lastRunAt: new Date().toISOString(),
            lastRunOutcome: CliOutcomeStatus.CONNECTOR_UNAVAILABLE,
            dataState: "none",
            lastError: message,
            lastResultPath: null,
            lastLogPath: getErrorLogPath(retryError),
          });
          renderer?.fail(`${displayName} connector could not be verified.`);
          renderer?.detail(
            `Try again later, or report: https://github.com/vana-com/data-connectors/issues`,
          );
          emit.event({
            type: "outcome",
            status: CliOutcomeStatus.CONNECTOR_UNAVAILABLE,
            source,
            reason: message,
          });
          return 1;
        }
      } else {
        const message = formatHumanSourceMessage(
          firstMessage ||
            `No connector is available for ${displayName} right now.`,
          source,
          displayName,
        );
        await updateSourceState(source, {
          connectorInstalled: false,
          lastRunAt: new Date().toISOString(),
          lastRunOutcome: CliOutcomeStatus.CONNECTOR_UNAVAILABLE,
          dataState: "none",
          lastError: message,
          lastResultPath: null,
          lastLogPath: getErrorLogPath(firstError),
        });
        renderer?.fail(`${displayName} is not available.`);
        renderer?.detail(`See what’s ready: vana sources`);
        emit.event({
          type: "outcome",
          status: CliOutcomeStatus.CONNECTOR_UNAVAILABLE,
          source,
          reason: message,
        });
        return 1;
      }
    }
    fetchLogPath = fetched.logPath;
    const sourceDetails = registrySources.find((item) => item.id === source);
    const resolution = {
      source,
      connectorPath: fetched.connectorPath,
    } as const;
    emit.event({
      type: "connector-resolved",
      source: resolution.source,
      connectorPath: resolution.connectorPath,
      logPath: fetched.logPath,
    });

    // --- Phase 3: Pre-connection validation (silent) ---
    const profilePath = path.join(
      getBrowserProfilesDir(),
      `${path.basename(resolution.connectorPath, path.extname(resolution.connectorPath))}`,
    );

    if (
      sourceDetails?.authMode === "legacy" &&
      !options.noInput &&
      process.platform === "linux" &&
      !process.env.DISPLAY &&
      !process.env.WAYLAND_DISPLAY
    ) {
      const message =
        "This source needs a manual browser step, but no local display server is available.";
      await updateSourceState(resolution.source, {
        connectorInstalled: true,
        sessionPresent: fs.existsSync(profilePath),
        lastRunAt: new Date().toISOString(),
        lastRunOutcome: CliOutcomeStatus.LEGACY_AUTH,
        dataState: "none",
        lastError: message,
        lastResultPath: null,
        lastLogPath: fetchLogPath ?? null,
      });
      renderer?.fail(
        `${displayName} requires a browser window, but no display is available.`,
      );
      renderer?.detail("Run this command in a desktop terminal.");
      emit.event({
        type: "outcome",
        status: CliOutcomeStatus.LEGACY_AUTH,
        source: resolution.source,
        reason: "display_server_unavailable",
      });
      return 1;
    }

    await updateSourceState(resolution.source, {
      connectorInstalled: true,
      sessionPresent: fs.existsSync(profilePath),
      lastError: null,
      lastLogPath: fetchLogPath ?? null,
    });

    // --- Phase 4-5: Authentication + Collection ---
    let finalStatus: CliOutcome["status"] =
      CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR;
    let finalDataState: SourceStatus["dataState"] = "none";
    let ingestFailureMessage: string | null = null;
    let resultPath = getSourceResultPath(source);
    let collectedResult = false;
    let ingestScopeResults:
      | Array<{
          scope: string;
          status: "stored" | "failed";
          syncedAt?: string;
          error?: string;
        }>
      | undefined;

    for await (const event of runtime.runConnector({
      connectorPath: resolution.connectorPath,
      source: resolution.source,
      noInput: options.noInput,
      onNeedInput: async (needInput) => {
        renderer?.pauseForPrompt();

        // Show connector’s prompt message
        if (renderer) {
          const promptMessage =
            needInput.message ?? `${displayName} needs your login.`;
          process.stderr.write(`\n${promptMessage}\n\n`);
        }

        const values: Record<string, string> = {};
        try {
          for (const field of needInput.fields) {
            const isPasswordField = field.toLowerCase().includes("password");
            if (isPasswordField) {
              values[field] = await password({
                message: humanizeField(field),
                ...vanaPromptTheme,
              });
            } else {
              values[field] = await input({
                message: humanizeField(field),
                ...vanaPromptTheme,
              });
            }
          }
        } catch (error) {
          if (isPromptCancelled(error)) {
            throw new Error("__vana_prompt_cancelled__");
          }
          throw error;
        }
        if (renderer) {
          process.stderr.write("\n");
        }
        renderer?.resumeAfterPrompt();
        return values;
      },
    })) {
      emit.event(event);
      if (event.logPath) {
        runLogPath = event.logPath;
      }

      if (terminalExitCode !== null) {
        continue;
      }

      if (event.type === "needs-input") {
        await updateSourceState(resolution.source, {
          lastRunAt: new Date().toISOString(),
          lastRunOutcome: CliOutcomeStatus.NEEDS_INPUT,
          lastError: event.message ?? "Input required.",
          lastLogPath: event.logPath,
        });
        emit.event({
          type: "outcome",
          status: CliOutcomeStatus.NEEDS_INPUT,
          source: resolution.source,
        });
        renderer?.fail(
          `${displayName} needs credentials. Run without --no-input to authenticate.`,
        );
        terminalExitCode = 1;
        continue;
      }

      if (event.type === "progress-update") {
        // Drive the renderer with scope information from the event
        const scopeName = extractScopeName(event);
        if (scopeName && renderer) {
          const isComplete =
            typeof event.message === "string" &&
            /^complete\b/i.test(event.message.trim());
          if (isComplete) {
            const detail = formatScopeDetail(event);
            renderer.scopeDone(scopeName, detail);
          } else {
            renderer.scopeActive(scopeName);
          }
        }
        continue;
      }

      if (event.type === "status-update") {
        // Status updates are silent in the new design
        continue;
      }

      if (event.type === "runtime-error") {
        await updateSourceState(resolution.source, {
          lastRunAt: new Date().toISOString(),
          lastRunOutcome: CliOutcomeStatus.RUNTIME_ERROR,
          lastError: event.message ?? "Connector run failed.",
          lastLogPath: event.logPath,
        });
        renderer?.fail(`Problem connecting ${displayName}.`);
        renderer?.detail(event.message ?? "Connector run failed.");
        renderer?.detail(`Retry: vana connect ${source}`);
        emit.event({
          type: "outcome",
          status: CliOutcomeStatus.RUNTIME_ERROR,
          source: resolution.source,
        });
        terminalExitCode = 1;
        continue;
      }

      if (event.type === "headed-required") {
        // Silent — the browser opens automatically
        continue;
      }

      if (event.type === "legacy-auth") {
        await updateSourceState(resolution.source, {
          lastRunAt: new Date().toISOString(),
          lastRunOutcome: CliOutcomeStatus.LEGACY_AUTH,
          lastError: event.message ?? "Legacy authentication is required.",
          dataState: "none",
          lastResultPath: null,
          lastLogPath: event.logPath,
        });
        renderer?.fail(`Manual step required for ${displayName}.`);
        renderer?.detail(
          `Complete the browser step locally, then rerun vana connect ${source}.`,
        );
        emit.event({
          type: "outcome",
          status: CliOutcomeStatus.LEGACY_AUTH,
          source: resolution.source,
        });
        terminalExitCode = 1;
        continue;
      }

      if (event.type === "collection-complete" && event.resultPath) {
        collectedResult = true;
        // Copy result to per-source path so multiple sources can coexist
        const sourceResultPath = getSourceResultPath(source);
        try {
          await fsp.mkdir(path.dirname(sourceResultPath), { recursive: true });
          await fsp.copyFile(event.resultPath, sourceResultPath);
          resultPath = sourceResultPath;
        } catch {
          resultPath = event.resultPath; // fall back to original path
        }
        const ingestEvents = await ingestResult(
          resolution.source,
          resultPath,
          target,
        );
        for (const ingestEvent of ingestEvents) {
          emit.event(ingestEvent);
        }

        const scopeResults = ingestEvents.find(
          (e) =>
            e.type === "ingest-complete" ||
            e.type === "ingest-partial" ||
            e.type === "ingest-failed",
        )?.scopeResults;

        const ingestCompleted = ingestEvents.some(
          (ingestEvent) => ingestEvent.type === "ingest-complete",
        );
        const ingestPartial = ingestEvents.some(
          (ingestEvent) => ingestEvent.type === "ingest-partial",
        );
        const ingestFailedEvent = ingestEvents.find(
          (ingestEvent) => ingestEvent.type === "ingest-failed",
        );
        if (ingestCompleted) {
          finalStatus = CliOutcomeStatus.CONNECTED_AND_INGESTED;
          finalDataState = "ingested_personal_server";
        } else if (ingestPartial) {
          finalStatus = CliOutcomeStatus.CONNECTED_AND_INGESTED;
          finalDataState = "ingested_personal_server";
        } else if (ingestFailedEvent?.type === "ingest-failed") {
          finalStatus = CliOutcomeStatus.INGEST_FAILED;
          finalDataState = "ingest_failed";
          ingestFailureMessage =
            ingestFailedEvent.message ?? "Personal Server sync failed.";
        } else {
          finalStatus = CliOutcomeStatus.CONNECTED_LOCAL_ONLY;
          finalDataState = "collected_local";
        }

        // Store per-scope results in state
        ingestScopeResults = scopeResults?.map((r) => ({
          scope: r.scope,
          status: r.status,
          syncedAt:
            r.status === "stored" ? new Date().toISOString() : undefined,
          error: r.error,
        }));
      }
    }

    if (terminalExitCode !== null) {
      return terminalExitCode;
    }

    if (!collectedResult) {
      await updateSourceState(resolution.source, {
        connectorInstalled: true,
        sessionPresent: fs.existsSync(profilePath),
        lastRunAt: new Date().toISOString(),
        lastRunOutcome: CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR,
        dataState: "none",
        lastError: "Connector run ended without a result.",
        lastResultPath: null,
        lastLogPath: runLogPath ?? fetchLogPath ?? null,
      });
      renderer?.fail(`Problem connecting ${displayName}.`);
      renderer?.detail("Connector run ended without a result.");
      emit.event({
        type: "outcome",
        status: CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR,
        source: resolution.source,
        reason: "Connector run ended without a result.",
      });
      return 1;
    }

    await updateSourceState(resolution.source, {
      connectorInstalled: true,
      connectorVersion: fetched.version,
      exportFrequency: fetched.exportFrequency,
      sessionPresent: true,
      lastRunAt: new Date().toISOString(),
      lastCollectedAt: new Date().toISOString(),
      lastRunOutcome: finalStatus,
      dataState: finalDataState,
      lastError: ingestFailureMessage,
      lastResultPath: resultPath,
      lastLogPath: runLogPath ?? fetchLogPath ?? setupLogPath ?? null,
      ingestScopes: ingestScopeResults,
    });

    // Build scope-aware success summary
    const storedCount =
      ingestScopeResults?.filter((r) => r.status === "stored").length ?? 0;
    const failedCount =
      ingestScopeResults?.filter((r) => r.status === "failed").length ?? 0;
    const totalScopes = ingestScopeResults?.length ?? 0;

    let successSummary: string;
    if (
      finalStatus === CliOutcomeStatus.CONNECTED_AND_INGESTED &&
      totalScopes > 0
    ) {
      if (failedCount === 0) {
        successSummary = `Collected your ${displayName} data and synced it to your Personal Server.`;
      } else {
        successSummary = `Collected your ${displayName} data. ${storedCount}/${totalScopes} scopes synced, ${failedCount} failed.`;
      }
    } else if (finalStatus === CliOutcomeStatus.CONNECTED_AND_INGESTED) {
      successSummary = `Collected your ${displayName} data and synced it to your Personal Server.`;
    } else {
      successSummary = `Collected your ${displayName} data and saved it locally.`;
    }

    // --- Phase 7: Success summary ---
    renderer?.success(`Connected ${displayName}.`);
    renderer?.detail(successSummary);

    // Partial sync guidance
    if (failedCount > 0 && storedCount > 0) {
      renderer?.detail(`Retry: vana server sync`);
    }

    // Journey-aware next step
    const state = await readCliState();
    const connectedSourceCount = Object.values(state.sources ?? {}).filter(
      (s) => hasCollectedData((s as SourceStatus)?.dataState),
    ).length;

    renderer?.detail("");
    if (connectedSourceCount > 1) {
      renderer?.next("vana sources");
    } else {
      renderer?.next(`vana data show ${source}`);
    }

    renderer?.bell();

    // Emit for --json consumers (unchanged)
    emit.event({
      type: "outcome",
      status: finalStatus,
      source: resolution.source,
      resultPath,
    });
    return 0;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "__vana_prompt_cancelled__"
    ) {
      await updateSourceState(source, {
        lastRunAt: new Date().toISOString(),
        lastRunOutcome: CliOutcomeStatus.NEEDS_INPUT,
        lastError: "Cancelled before input was completed.",
        lastLogPath: runLogPath ?? null,
      });
      renderer?.fail("Cancelled.");
      emit.event({
        type: "outcome",
        status: CliOutcomeStatus.NEEDS_INPUT,
        source,
        reason: "prompt_cancelled",
      });
      return 1;
    }
    const message =
      error instanceof Error ? error.message : "Unexpected error.";
    renderer?.fail(`Problem connecting ${displayName}.`);
    renderer?.detail(message);
    renderer?.detail(`Retry: vana connect ${source}`);
    emit.event({
      type: "outcome",
      status: CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR,
      source,
      reason: message,
    });
    return 1;
  } finally {
    renderer?.cleanup();
  }
}

async function runConnectEntry(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);
  const sources = await loadRegistrySources();
  const state = await readCliState();
  const sourceMetadata = createSourceMetadataMap(sources);
  const statuses = await gatherSourceStatuses(state.sources, sourceMetadata);
  const statusMap = new Map(statuses.map((source) => [source.source, source]));
  const enrichedSources = sources.map((source) => {
    const status = statusMap.get(source.id);
    return {
      ...source,
      dataState: status?.dataState,
      lastRunOutcome: status?.lastRunOutcome ?? null,
      sessionPresent: status?.sessionPresent ?? false,
    };
  });
  const suggestedSource =
    enrichedSources.find(
      (source) =>
        source.authMode !== "legacy" && !hasCollectedData(source.dataState),
    ) ??
    enrichedSources.find((source) => source.authMode !== "legacy") ??
    enrichedSources[0];
  const missingSourceMessage =
    formatMissingConnectSourceMessage(suggestedSource);

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        error: "source_required",
        message: missingSourceMessage,
        suggestedSource: suggestedSource
          ? {
              id: suggestedSource.id,
              name: suggestedSource.name,
              authMode: suggestedSource.authMode,
            }
          : null,
      })}\n`,
    );
    return 1;
  }

  if (options.noInput) {
    emit.info(missingSourceMessage);
    return 1;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emit.info(missingSourceMessage);
    return 1;
  }

  if (enrichedSources.length === 0) {
    emit.info("No sources are available right now.");
    emit.info("Run `vana sources` to verify the local connector registry.");
    return 1;
  }

  // Build inquirer-compatible choices from enriched sources
  const choices = enrichedSources.map((item) => {
    const connected = hasCollectedData(item.dataState);
    const hint = connected
      ? "connected"
      : item.authMode === "legacy"
        ? "browser login"
        : undefined;
    return {
      value: item.id,
      name: item.name,
      description: hint,
    };
  });

  try {
    const source = await select({
      message: "Choose a source to connect.",
      choices,
      default: suggestedSource?.id,
      ...vanaPromptTheme,
    });

    return runConnect(source as string, options);
  } catch (error) {
    if (isPromptCancelled(error)) {
      emit.info("Cancelled.");
      return 1;
    }
    throw error;
  }
}

async function runList(options: GlobalOptions): Promise<number> {
  const result = await querySources();
  const { sources: enrichedSources, recommendedSource } = result;

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  }

  const emit = createEmitter(options);
  emit.title("Available sources");
  emit.blank();

  if (enrichedSources.length === 0) {
    emit.info("No sources are available right now.");
  } else {
    const connectedSources = enrichedSources.filter((source) =>
      hasCollectedData(source.dataState),
    );
    const unconnectedSources = enrichedSources.filter(
      (source) => !hasCollectedData(source.dataState),
    );

    // Connected sources are always shown expanded
    if (connectedSources.length > 0) {
      emit.section("Connected");
      for (const source of connectedSources) {
        const badges: Array<{ text: string; tone?: RenderTone }> = [];
        if (source.dataState === "ingested_personal_server") {
          badges.push({ text: "synced", tone: "success" });
        } else if (source.dataState === "ingest_failed") {
          badges.push({ text: "sync failed", tone: "warning" });
        } else {
          badges.push({ text: "local", tone: "muted" });
        }
        emit.sourceTitle(source.name, badges);
        emit.detail(
          `Inspect with ${emit.code(`vana data show ${source.id}`)}.`,
        );
      }
      emit.blank();
      emit.section("Available");
    }

    // Show the first 3 unconnected sources with descriptions
    const expanded = unconnectedSources.slice(0, 3);
    const collapsed = unconnectedSources.slice(3);

    for (const source of expanded) {
      const badges: Array<{ text: string; tone?: RenderTone }> = [];
      if (
        recommendedSource?.id === source.id &&
        recommendedSource.authMode !== "legacy"
      ) {
        badges.push({ text: "recommended", tone: "accent" });
      }
      emit.sourceTitle(source.name, badges);
      if (source.description) {
        emit.detail(cleanDescription(source.description));
      }
    }

    if (collapsed.length > 0) {
      emit.blank();
      emit.detail(collapsed.map((s) => s.name).join(" \u00B7 "));
    }

    if (recommendedSource) {
      emit.blank();
      emit.next(`vana connect ${recommendedSource.id}`);
    }
  }
  return 0;
}

async function runStatus(options: GlobalOptions): Promise<number> {
  const { status, nextSteps } = await queryStatus();

  if (options.json) {
    const compactJson = {
      runtime: status.runtime,
      personalServer: status.personalServer,
      personalServerUrl: status.personalServerUrl,
      sources: {
        connected: status.summary?.connectedCount ?? 0,
        needsAttention: status.summary?.needsAttentionCount ?? 0,
      },
      next: nextSteps[0] ?? null,
    };
    process.stdout.write(`${JSON.stringify(compactJson)}\n`);
    return 0;
  }

  const emit = createEmitter(options);
  emit.title("Vana Connect");
  emit.blank();
  emit.keyValue("Runtime", status.runtime, toneForRuntime(status.runtime));
  if (status.personalServer === "available") {
    emit.keyValue(
      "Personal Server",
      status.personalServerUrl ?? "connected",
      "success",
    );
  } else {
    emit.keyValue("Personal Server", "not connected", "warning");
  }
  const connectedCount = status.summary?.connectedCount ?? 0;
  const attentionCount = status.summary?.needsAttentionCount ?? 0;
  const sourceParts = [
    connectedCount > 0 ? `${connectedCount} connected` : "none connected",
    ...(connectedCount > 0 && attentionCount > 0
      ? [`${attentionCount} need${attentionCount === 1 ? "s" : ""} attention`]
      : []),
  ];
  emit.keyValue(
    "Sources",
    sourceParts.join(", "),
    attentionCount > 0 && connectedCount > 0
      ? "warning"
      : connectedCount > 0
        ? "success"
        : "muted",
  );
  if (nextSteps.length > 0) {
    emit.blank();
    const command = extractCommand(nextSteps[0]);
    if (command) {
      emit.next(command);
    } else {
      emit.detail(`Next: ${nextSteps[0]}`);
    }
  }
  return 0;
}

async function runDoctor(options: GlobalOptions): Promise<number> {
  const payload = await queryDoctor();

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return 0;
  }

  const sourceLabels = createSourceLabelMap(await loadRegistrySources());
  const { recentSources } = payload;
  const attentionSources = recentSources.filter(
    (source) => rankSourceStatus(source) <= 4,
  );

  const emit = createEmitter(options);
  emit.title("Vana Connect doctor");
  emit.section("Summary");
  emit.keyValue("CLI", payload.cliVersion, "muted");
  emit.keyValue("Channel", payload.channel, "muted");
  emit.keyValue(
    "Install",
    formatInstallMethodLabel(payload.installMethod),
    "muted",
  );
  emit.keyValue("Runtime", payload.runtime, toneForRuntime(payload.runtime));
  emit.keyValue(
    "Personal Server",
    payload.personalServer,
    payload.personalServer === "available" ? "success" : "warning",
  );
  emit.keyValue(
    "Tracked sources",
    String(payload.summary.trackedSourceCount),
    "muted",
  );
  emit.keyValue(
    "Attention",
    String(payload.summary.attentionCount),
    payload.summary.attentionCount > 0 ? "warning" : "muted",
  );
  emit.keyValue(
    "Connected",
    String(payload.summary.connectedCount),
    payload.summary.connectedCount > 0 ? "success" : "muted",
  );
  emit.blank();
  emit.section("Checks");
  for (const check of payload.checks) {
    const tone: RenderTone =
      check.status === "ok"
        ? "success"
        : check.status === "warn"
          ? "warning"
          : "error";
    emit.keyValue(check.label, check.detail, tone);
  }
  if (recentSources.length > 0) {
    emit.blank();
    emit.section(
      attentionSources.length > 0
        ? "Needs attention"
        : "Recent source activity",
    );
    for (const source of attentionSources.length > 0
      ? attentionSources
      : recentSources) {
      const status = getSourceStatusPresentation(source);
      const badges: Array<{ text: string; tone?: RenderTone }> = [];
      badges.push({ text: status.label, tone: status.tone });
      emit.sourceTitle(displaySource(source.source, sourceLabels), badges);
      const details = formatSourceStatusDetails(source);
      for (const detail of details) {
        if (detail.kind === "row") {
          emit.keyValue(detail.label, detail.value, detail.tone ?? "muted");
        } else {
          emit.detail(humanizeIssue(detail.message));
        }
      }
    }
  }
  emit.blank();
  emit.section("Paths");
  emit.keyValue(
    "Executable",
    formatDisplayPath(payload.paths.executable),
    "muted",
  );
  if (payload.paths.appRoot) {
    emit.keyValue(
      "App root",
      formatDisplayPath(payload.paths.appRoot),
      "muted",
    );
  }
  emit.keyValue(
    "Data home",
    formatDisplayPath(payload.paths.dataHome),
    "muted",
  );
  emit.keyValue(
    "State file",
    formatDisplayPath(payload.paths.stateFile),
    "muted",
  );
  emit.keyValue(
    "Connector cache",
    formatDisplayPath(payload.paths.connectorCache),
    "muted",
  );
  emit.keyValue(
    "Browser profiles",
    formatDisplayPath(payload.paths.browserProfiles),
    "muted",
  );
  emit.keyValue("Logs", formatDisplayPath(payload.paths.logs), "muted");
  emit.blank();
  emit.section("Lifecycle");
  emit.keyValue("Upgrade", payload.lifecycle.upgrade, "muted");
  emit.keyValue("Uninstall", payload.lifecycle.uninstall, "muted");
  if (payload.nextSteps.length > 0) {
    emit.blank();
    const command = extractCommand(payload.nextSteps[0]);
    if (command) {
      emit.next(command);
    } else {
      emit.detail(`Next: ${payload.nextSteps[0]}`);
    }
  }

  return 0;
}

async function runServerStatus(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);
  const target = await detectPersonalServerTarget();
  const state = await readCliState();

  // Count scopes from state
  let totalScopeCount = 0;
  for (const stored of Object.values(state.sources)) {
    if (stored?.ingestScopes) {
      totalScopeCount += stored.ingestScopes.filter(
        (s) => s.status === "stored",
      ).length;
    }
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        state: target.state,
        url: target.url,
        source: target.source,
        health: target.health,
        scopeCount: totalScopeCount,
      })}\n`,
    );
    return 0;
  }

  emit.title("Personal Server");
  emit.blank();

  if (target.url) {
    const urlSuffix =
      target.source === "scan"
        ? "(auto-detected)"
        : target.source === "config"
          ? "(saved)"
          : target.source === "env"
            ? "(from VANA_PERSONAL_SERVER_URL)"
            : `(${target.source ?? "unknown"})`;
    emit.keyValue("URL", `${target.url} ${urlSuffix}`, "muted");
  }

  const stateLabel = target.state === "available" ? "healthy" : "Not connected";
  emit.keyValue(
    "Status",
    stateLabel,
    target.state === "available" ? "success" : "warning",
  );

  if (target.health) {
    emit.keyValue("Version", target.health.version, "muted");
  }

  if (totalScopeCount > 0) {
    emit.keyValue("Scopes", `${totalScopeCount} stored`, "muted");
  }

  if (target.source && !target.url) {
    const sourceLabel: Record<string, string> = {
      config: "Saved config",
      env: "VANA_PERSONAL_SERVER_URL",
      scan: "Localhost scan",
    };
    emit.keyValue(
      "Resolved via",
      sourceLabel[target.source] ?? target.source,
      "muted",
    );
  }

  if (target.health) {
    emit.keyValue("Uptime", formatUptime(target.health.uptime), "muted");
    if (target.health.owner) {
      emit.keyValue("Owner", target.health.owner, "muted");
    }
  }

  if (target.source === "scan" && target.url) {
    emit.blank();
    emit.detail(`Save with ${emit.code(`vana server set-url ${target.url}`)}.`);
  }

  if (target.state !== "available") {
    emit.blank();
    emit.next("vana server set-url <url>");
  }

  emit.blank();
  emit.detail(
    `More: ${emit.code("vana server sync")} | ${emit.code("vana server data")} | ${emit.code("vana server --help")}`,
  );

  return 0;
}

async function runServerSetUrl(
  url: string,
  options: GlobalOptions,
): Promise<number> {
  const emit = createEmitter(options);

  try {
    new URL(url);
  } catch {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, error: "Invalid URL" })}\n`,
      );
    } else {
      emit.info(`Invalid URL: ${url}`);
    }
    return 1;
  }

  await updateCliConfig({ personalServerUrl: url });

  const target = await detectPersonalServerTarget();

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        url,
        reachable: target.state === "available",
        health: target.health,
      })}\n`,
    );
    return 0;
  }

  emit.info(`Saved Personal Server URL: ${url}`);
  if (target.state === "available") {
    emit.info(
      `Server is reachable (${target.health?.version ?? "unknown version"}).`,
    );
  } else {
    emit.info("Server is not reachable yet. It will be used when available.");
  }

  return 0;
}

async function runServerClearUrl(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);
  const config = await readCliConfig();

  if (!config.personalServerUrl) {
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ ok: true, cleared: false })}\n`);
    } else {
      const target = await detectPersonalServerTarget();
      if (target.source === "scan" && target.url) {
        emit.info(
          "No saved URL to clear. Current connection is auto-detected on localhost.",
        );
        emit.info(
          `Run ${emit.code("vana server set-url <url>")} to save a specific URL.`,
        );
      } else {
        emit.info("No saved Personal Server URL to clear.");
      }
    }
    return 0;
  }

  await updateCliConfig({ personalServerUrl: undefined });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, cleared: true })}\n`);
  } else {
    emit.info("Cleared saved Personal Server URL.");
  }

  return 0;
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

async function runSetup(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);
  const runtime = new ManagedPlaywrightRuntime();
  const registrySources = await loadRegistrySources();
  const suggestedSource =
    registrySources.find((source) => source.authMode !== "legacy") ??
    registrySources[0];

  emit.title("Vana Connect setup");
  emit.section("Runtime");

  if (runtime.state === "installed") {
    emit.info("The local runtime is already installed.");
    if (runtime.runtimePath) {
      emit.keyValue("Browser", formatDisplayPath(runtime.runtimePath), "muted");
    }
    emit.blank();
    if (suggestedSource) {
      emit.next(`vana connect ${suggestedSource.id}`);
    } else {
      emit.next("vana connect");
    }
    emit.event({ type: "setup-check", runtime: runtime.state });
    return 0;
  }

  try {
    const result = await runtime.ensureInstalled(Boolean(options.yes));
    emit.success("Runtime ready.");
    if (result.logPath) {
      emit.detail(`Setup log: ${formatDisplayPath(result.logPath)}`);
    }
    emit.blank();
    if (suggestedSource) {
      emit.next(`vana connect ${suggestedSource.id}`);
    } else {
      emit.next("vana connect");
    }
    emit.event({
      type: "setup-complete",
      runtime: result.runtime,
      logPath: result.logPath,
    });
    return 0;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Vana Connect could not finish installing the local runtime.";
    emit.info(message);
    emit.event({
      type: "outcome",
      status: CliOutcomeStatus.RUNTIME_ERROR,
      reason: message,
    });
    return 1;
  }
}

async function runDataList(options: GlobalOptions): Promise<number> {
  const result = await queryDataList();

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  }

  const { datasets: datasetRecords } = result;
  const registrySources = await loadRegistrySources();
  const emit = createEmitter(options);
  if (datasetRecords.length === 0) {
    const suggestedSource =
      registrySources.find((source) => source.authMode !== "legacy") ??
      registrySources[0];
    emit.title("Collected data");
    emit.blank();
    emit.info("  No datasets yet.");
    emit.blank();
    if (suggestedSource) {
      emit.next(`vana connect ${suggestedSource.id}`);
    } else {
      emit.next("vana connect");
    }
    return 0;
  }

  emit.title(
    datasetRecords.length > 0
      ? `Collected data (${datasetRecords.length})`
      : "Collected data",
  );
  emit.blank();
  emit.info(
    joinOverviewParts([
      formatCountLabel("dataset", datasetRecords.length),
      formatCountLabel(
        "local only",
        datasetRecords.filter(
          (dataset) => dataset.dataState !== "ingested_personal_server",
        ).length,
      ),
      formatCountLabel(
        "synced",
        datasetRecords.filter(
          (dataset) => dataset.dataState === "ingested_personal_server",
        ).length,
      ),
      datasetRecords.some((dataset) => dataset.dataState === "ingest_failed")
        ? formatCountLabel(
            "sync failed",
            datasetRecords.filter(
              (dataset) => dataset.dataState === "ingest_failed",
            ).length,
          )
        : "",
    ]),
  );
  emit.blank();
  datasetRecords.forEach((dataset, index) => {
    if (index > 0) {
      emit.blank();
    }
    const badges =
      dataset.dataState === "ingested_personal_server"
        ? [{ text: "synced", tone: "success" as const }]
        : dataset.dataState === "ingest_failed"
          ? [{ text: "sync failed", tone: "warning" as const }]
          : [{ text: "local", tone: "muted" as const }];
    emit.sourceTitle(dataset.name ?? displaySource(dataset.source), badges);
    if (dataset.summary) {
      for (const line of dataset.summary.lines) {
        emit.detail(line);
      }
    }
    if (dataset.dataState === "ingested_personal_server") {
      emit.keyValue("State", "Synced to Personal Server", "success");
    } else if (dataset.dataState === "ingest_failed") {
      emit.keyValue("State", "Saved locally, sync failed", "warning");
    } else {
      emit.keyValue("State", "Saved locally", "muted");
    }
    if (dataset.lastRunAt) {
      emit.keyValue("Updated", formatTimestamp(dataset.lastRunAt), "muted");
    }
    if (dataset.path) {
      emit.keyValue("Path", formatDisplayPath(dataset.path), "muted");
    }
  });
  emit.blank();
  if (datasetRecords.length > 0) {
    emit.next(`vana data show ${datasetRecords[0].source}`);
  }
  return 0;
}

async function runDataShow(
  source: string,
  options: GlobalOptions,
): Promise<number> {
  const result = await queryDataShow(source);

  if (!result.ok) {
    if (result.error === "dataset_not_found") {
      if (options.json) {
        process.stdout.write(
          `${JSON.stringify({
            error: result.error,
            source: result.source,
            message: result.message,
            nextSteps: result.nextSteps,
          })}\n`,
        );
      } else {
        const emit = createEmitter(options);
        emit.info(result.message);
        emit.blank();
        emit.next(`vana connect ${source}`);
      }
      return 1;
    }
    // dataset_read_failed
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ error: result.error, source: result.source, path: result.path, message: result.message })}\n`,
      );
    } else {
      createEmitter(options).info(result.message);
    }
    return 1;
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        source: result.source,
        name: result.name,
        path: result.path,
        summary: result.summary,
        lastRunAt: result.lastRunAt,
        dataState: result.dataState,
        nextSteps: result.nextSteps,
        data: result.data,
      })}\n`,
    );
    return 0;
  }

  const emit = createEmitter(options);
  const state = await readCliState();
  const record = state.sources[source];
  emit.title(`${result.name} data`);
  emit.blank();
  if (result.summary) {
    for (const line of result.summary.lines) {
      emit.detail(line);
    }
    emit.blank();
  }
  emit.keyValue("Path", formatDisplayPath(result.path), "muted");
  if (record?.lastRunAt) {
    emit.keyValue("Updated", formatTimestamp(record.lastRunAt), "muted");
  }
  if (record?.dataState === "ingested_personal_server") {
    emit.keyValue("State", "Synced to Personal Server", "success");
  } else if (record?.dataState === "ingest_failed") {
    emit.keyValue("State", "Saved locally, sync failed", "warning");
  } else {
    emit.keyValue("State", "Saved locally", "muted");
  }
  emit.blank();
  if (result.datasetCount > 1) {
    emit.next("vana data list");
  } else {
    emit.next(`vana connect ${source}`);
  }
  return 0;
}

async function runDataPath(
  source: string,
  options: GlobalOptions,
): Promise<number> {
  const sourceLabels = createSourceLabelMap(await loadRegistrySources());
  const state = await readCliState();
  const resultPath = state.sources[source]?.lastResultPath;

  if (!resultPath) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({
          error: "dataset_not_found",
          source,
          name: displaySource(source, sourceLabels),
          message: `No collected dataset found for ${displaySource(source, sourceLabels)}. Run \`vana connect ${source}\` first.`,
        })}\n`,
      );
    } else {
      createEmitter(options).info(
        `No collected dataset found for ${displaySource(source, sourceLabels)}. Run \`vana connect ${source}\` first.`,
      );
    }
    return 1;
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        source,
        name: displaySource(source, sourceLabels),
        path: resultPath,
        lastRunAt: state.sources[source]?.lastRunAt ?? null,
        dataState: state.sources[source]?.dataState ?? null,
        nextSteps: [
          `Inspect the dataset with \`vana data show ${source}\`.`,
          `Reconnect ${displaySource(source, sourceLabels)} with \`vana connect ${source}\`.`,
        ],
      })}\n`,
    );
  } else {
    process.stdout.write(`${formatDisplayPath(resultPath)}\n`);
  }
  return 0;
}

async function runLogs(
  source: string | undefined,
  options: GlobalOptions,
): Promise<number> {
  const sourceLabels = createSourceLabelMap(await loadRegistrySources());
  const state = await readCliState();
  const records = Object.entries(state.sources)
    .filter(([, entry]) => Boolean(entry?.lastLogPath))
    .map(([sourceId, entry]) => ({
      source: sourceId,
      name: displaySource(sourceId, sourceLabels),
      path: entry?.lastLogPath ?? "",
      lastRunAt: entry?.lastRunAt ?? null,
      lastRunOutcome: entry?.lastRunOutcome ?? null,
      dataState: (entry?.dataState === "collected_local" ||
      entry?.dataState === "ingested_personal_server" ||
      entry?.dataState === "ingest_failed"
        ? entry.dataState
        : null) as SourceStatus["dataState"] | null,
    }))
    .sort(compareLogRecordOrder);
  const logSummary = {
    attentionCount: records.filter((record) =>
      isAttentionLog(record.lastRunOutcome, record.dataState),
    ).length,
    successfulCount: records.filter(
      (record) =>
        record.dataState === "collected_local" ||
        record.dataState === "ingested_personal_server",
    ).length,
    localCount: records.filter(
      (record) => record.dataState === "collected_local",
    ).length,
    syncedCount: records.filter(
      (record) => record.dataState === "ingested_personal_server",
    ).length,
  };

  if (source) {
    const match = records.find((record) => record.source === source);
    if (!match) {
      const payload = {
        error: "log_not_found",
        source,
        message: `No stored run log found for ${displaySource(source, sourceLabels)}.`,
        nextSteps: [
          `Run \`vana connect ${source}\` to create a new log.`,
          ...(records.length > 0
            ? ["Run `vana logs` to inspect other logs."]
            : []),
        ],
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(payload)}\n`);
      } else {
        const emit = createEmitter(options);
        emit.info(payload.message);
        emit.blank();
        emit.next(`vana connect ${source}`);
      }
      return 1;
    }

    if (options.json) {
      process.stdout.write(`${JSON.stringify(match)}\n`);
    } else {
      process.stdout.write(`${formatDisplayPath(match.path)}\n`);
    }
    return 0;
  }

  const nextSteps = buildLogsNextSteps(records);
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        count: records.length,
        latestLog: records[0] ?? null,
        nextSteps,
        summary: logSummary,
        logs: records,
      })}\n`,
    );
    return 0;
  }

  const emit = createEmitter(options);
  emit.title(records.length > 0 ? `Run logs (${records.length})` : "Run logs");
  emit.blank();

  if (records.length === 0) {
    emit.info("No stored run logs yet.");
    emit.blank();
    emit.next("vana connect");
    return 0;
  }

  emit.info(
    joinOverviewParts([
      logSummary.attentionCount > 0
        ? formatCountLabel("need attention", logSummary.attentionCount)
        : "",
      logSummary.successfulCount > 0
        ? formatCountLabel("successful", logSummary.successfulCount)
        : "",
      logSummary.localCount > 0
        ? formatCountLabel("local", logSummary.localCount)
        : "",
      logSummary.syncedCount > 0
        ? formatCountLabel("synced", logSummary.syncedCount)
        : "",
    ]),
  );
  emit.blank();

  const groups = [
    {
      title: "Needs attention",
      items: records.filter((record) =>
        isAttentionLog(record.lastRunOutcome, record.dataState),
      ),
    },
    {
      title: "Successful runs",
      items: records.filter(
        (record) => !isAttentionLog(record.lastRunOutcome, record.dataState),
      ),
    },
  ].filter((group) => group.items.length > 0);

  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      emit.blank();
    }
    emit.section(formatCountLabel(group.title, group.items.length));
    for (const record of group.items) {
      emit.sourceTitle(record.name, [
        {
          text: formatLogOutcomeLabel(record.lastRunOutcome, record.dataState),
          tone: toneForLogOutcome(record.lastRunOutcome, record.dataState),
        },
      ]);
      emit.keyValue("Path", formatDisplayPath(record.path), "muted");
      if (record.lastRunAt) {
        emit.keyValue("Updated", formatTimestamp(record.lastRunAt), "muted");
      }
    }
  });

  emit.blank();
  if (nextSteps.length > 0) {
    const command = extractCommand(nextSteps[0]);
    if (command) {
      emit.next(command);
    } else {
      emit.detail(`Next: ${nextSteps[0]}`);
    }
  }
  return 0;
}

async function runSourceDetail(
  source: string,
  options: GlobalOptions,
): Promise<number> {
  const emit = createEmitter(options);
  const registrySources = await loadRegistrySources();
  const state = await readCliState();
  const match = registrySources.find(
    (s) => s.id === source || s.name.toLowerCase() === source.toLowerCase(),
  );

  if (!match) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ error: "unknown_source", source, message: `Unknown source: ${source}. Run \`vana sources\` to see available options.` })}\n`,
      );
    } else {
      emit.info(
        `Unknown source: ${source}. Run \`vana sources\` to see available options.`,
      );
    }
    return 1;
  }

  const stored = state.sources[match.id];
  const metadata = await readCachedConnectorMetadata(
    match.id,
    getConnectorCacheDir(),
  );
  const scopes = metadata?.scopes ?? [];
  const sourceStatus = stored
    ? ({
        source: match.id,
        installed: Boolean(stored.connectorInstalled),
        sessionPresent: stored.sessionPresent ?? false,
        lastRunOutcome: stored.lastRunOutcome ?? null,
        dataState: stored.dataState as SourceStatus["dataState"],
      } as SourceStatus)
    : undefined;
  const badge = sourceStatus ? getSourceBadge(sourceStatus) : undefined;

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        id: match.id,
        name: match.name,
        company: match.company,
        description: match.description,
        version: match.version ?? stored?.connectorVersion,
        exportFrequency: match.exportFrequency ?? stored?.exportFrequency,
        authMode: match.authMode,
        scopes,
        scopeLabels: scopes.map((s) => s.label),
        connectorVersion: stored?.connectorVersion,
        lastCollectedAt: stored?.lastCollectedAt,
        dataState: stored?.dataState,
      })}\n`,
    );
    return 0;
  }

  const iconPrefix = await renderIconInline(match.id);
  const badgeList: Array<{ text: string; tone?: RenderTone }> = [];
  if (badge && badge.label !== "new") {
    badgeList.push({ text: badge.label, tone: badge.style });
  }
  emit.sourceTitle(`${iconPrefix}${match.name}`, badgeList);
  emit.blank();
  if (match.description) {
    emit.info(cleanDescription(match.description));
    emit.blank();
  }

  if (scopes.length > 0) {
    emit.section("Collects");
    for (const scope of scopes) {
      if (scope.description) {
        emit.keyValue(
          scope.label,
          cleanDescription(scope.description),
          "muted",
        );
      } else {
        emit.bullet(scope.label);
      }
    }
  }

  if (
    stored?.connectorVersion &&
    match.version &&
    stored.connectorVersion !== match.version
  ) {
    emit.blank();
    emit.detail(
      `A newer connector version is available (${match.version}). Reconnect to update.`,
    );
  }

  emit.blank();
  emit.next(`vana connect ${match.id}`);
  return 0;
}

async function runCollect(
  source: string,
  options: GlobalOptions,
): Promise<number> {
  const emit = createEmitter(options);
  const state = await readCliState();
  const stored = state.sources[source];

  if (!stored || !stored.connectorInstalled) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({
          error: "not_previously_connected",
          source,
          message: `Source "${source}" has not been connected yet. Run \`vana connect ${source}\` first.`,
        })}\n`,
      );
    } else {
      emit.info(
        `Source "${source}" has not been connected yet. Run \`vana connect ${source}\` first.`,
      );
    }
    return 1;
  }

  return runConnect(source, options);
}

async function runCollectAll(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);
  const state = await readCliState();
  const dueSources = Object.entries(state.sources)
    .filter(
      ([, stored]) =>
        stored?.connectorInstalled &&
        isCollectionDue(stored.exportFrequency, stored.lastCollectedAt),
    )
    .map(([id]) => id);

  if (dueSources.length === 0) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ message: "No sources are due for collection.", count: 0 })}\n`,
      );
    } else {
      emit.info("No sources are due for collection.");
    }
    return 0;
  }

  let exitCode = 0;
  for (const source of dueSources) {
    const result = await runConnect(source, options);
    if (result !== 0) {
      exitCode = result;
    }
  }
  return exitCode;
}

async function runServerSync(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);
  const target = await detectPersonalServerTarget();

  if (target.state !== "available") {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({
          error: "personal_server_unavailable",
          message:
            "Personal Server is not available. Run `vana server set-url <url>` to configure.",
        })}\n`,
      );
    } else {
      emit.info(
        "Personal Server is not available. Run `vana server set-url <url>` to configure.",
      );
    }
    return 1;
  }

  const state = await readCliState();
  // Find sources that are local-only OR have failed ingest scopes
  const pendingSources = Object.entries(state.sources).filter(
    ([, stored]) =>
      stored?.lastResultPath &&
      (stored.dataState === "collected_local" ||
        stored.dataState === "ingest_failed" ||
        stored?.ingestScopes?.some((s) => s.status === "failed")),
  );

  if (pendingSources.length === 0) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ message: "No pending datasets to sync.", syncedCount: 0 })}\n`,
      );
    } else {
      emit.info("No pending datasets to sync.");
    }
    return 0;
  }

  let syncedCount = 0;
  const allScopeResults: Array<{
    source: string;
    scopeResults?: Array<{ scope: string; status: string; error?: string }>;
  }> = [];

  for (const [source, stored] of pendingSources) {
    if (!stored?.lastResultPath) {
      continue;
    }
    const ingestEvents = await ingestResult(
      source,
      stored.lastResultPath,
      target,
    );

    const resultEvent = ingestEvents.find(
      (e) =>
        e.type === "ingest-complete" ||
        e.type === "ingest-partial" ||
        e.type === "ingest-failed",
    );
    const scopeResults = resultEvent?.scopeResults;

    const ingestCompleted = ingestEvents.some(
      (e) => e.type === "ingest-complete",
    );
    const ingestPartial = ingestEvents.some((e) => e.type === "ingest-partial");

    if (ingestCompleted || ingestPartial) {
      syncedCount++;
      const dataState =
        ingestCompleted || ingestPartial
          ? "ingested_personal_server"
          : stored.dataState;
      await updateSourceState(source, {
        dataState,
        ingestScopes: scopeResults?.map((r) => ({
          scope: r.scope,
          status: r.status,
          syncedAt:
            r.status === "stored" ? new Date().toISOString() : undefined,
          error: r.error,
        })),
      });
    }

    allScopeResults.push({ source, scopeResults });
    for (const event of ingestEvents) {
      emit.event(event);
    }
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ message: `Synced ${syncedCount} dataset(s).`, syncedCount })}\n`,
    );
  } else {
    // Show per-scope results with scope manifest style
    const renderer = createHumanRenderer();
    for (const entry of allScopeResults) {
      if (entry.scopeResults && entry.scopeResults.length > 0) {
        emit.info(`${entry.source}:`);
        for (const sr of entry.scopeResults) {
          if (sr.status === "stored") {
            emit.info(`  ${renderer.theme.success("\u2713")} ${sr.scope}`);
          } else {
            const errDetail = sr.error ?? "failed";
            emit.info(
              `  ${renderer.theme.error("\u2717")} ${sr.scope} ${renderer.theme.muted(`\u2014 ${errDetail}`)}`,
            );
          }
        }
      }
    }
    emit.blank();
    const allStored = allScopeResults.every(
      (entry) =>
        !entry.scopeResults ||
        entry.scopeResults.every((sr) => sr.status === "stored"),
    );
    emit.success(`Synced ${syncedCount} dataset(s).`);
    emit.blank();
    if (allStored) {
      emit.next("vana data list");
    } else {
      emit.next("vana server sync");
    }
  }
  return 0;
}

async function runServerData(
  scope: string | undefined,
  options: GlobalOptions,
): Promise<number> {
  const emit = createEmitter(options);
  const target = await detectPersonalServerTarget();
  const state = await readCliState();

  // Gather locally-known scopes from state
  const localScopes: Array<{ scope: string; source: string; status: string }> =
    [];
  for (const [src, stored] of Object.entries(state.sources)) {
    if (stored?.ingestScopes) {
      for (const is of stored.ingestScopes) {
        localScopes.push({ scope: is.scope, source: src, status: is.status });
      }
    }
  }

  // If PS is available, try to list remote scopes via client
  let remoteScopes: Array<{ scope: string; count: number }> = [];
  if (target.state === "available" && target.url) {
    try {
      const { createPersonalServerClient: createClient } =
        await import("../personal-server/client.js");
      const client = createClient({ url: target.url });
      remoteScopes = await client.listScopes(scope);
    } catch {
      // Auth required or PS unavailable — fall back to local
    }
  }

  // Use remote scopes if available, otherwise fall back to local
  const scopeList =
    remoteScopes.length > 0
      ? remoteScopes.map((s) => ({
          scope: s.scope,
          detail: `${s.count} version${s.count !== 1 ? "s" : ""}`,
        }))
      : localScopes
          .filter((s) => s.status === "stored")
          .filter((s) => !scope || s.scope.startsWith(scope))
          .map((s) => ({ scope: s.scope, detail: "1 version" }));

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        count: scopeList.length,
        scopes: scopeList,
        source: remoteScopes.length > 0 ? "remote" : "local",
      })}\n`,
    );
    return 0;
  }

  if (scopeList.length === 0) {
    emit.info("No scopes found.");
    if (target.state !== "available") {
      emit.detail(
        "Personal Server is not available. Showing locally-known scopes only.",
      );
    }
    return 0;
  }

  for (const entry of scopeList) {
    emit.keyValue(entry.scope, entry.detail, "muted");
  }

  if (remoteScopes.length === 0 && localScopes.length > 0) {
    emit.blank();
    emit.detail(
      "Showing locally-known scopes. Connect your Personal Server for live data.",
    );
  }

  return 0;
}

function getSourceBadge(source: SourceStatus): {
  label: string;
  style: "success" | "warning" | "error" | "muted";
} {
  if (
    source.dataState === "collected_local" ||
    source.dataState === "ingested_personal_server" ||
    source.dataState === "ingest_failed"
  ) {
    return { label: "connected", style: "success" };
  }

  if (
    source.lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT ||
    source.lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH
  ) {
    return { label: "needs login", style: "warning" };
  }

  if (
    source.lastRunOutcome === CliOutcomeStatus.RUNTIME_ERROR ||
    source.lastRunOutcome === CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR
  ) {
    return { label: "error", style: "error" };
  }

  return { label: "new", style: "muted" };
}

function isCollectionDue(
  frequency: string | undefined,
  lastCollectedAt: string | undefined,
): boolean {
  if (!frequency || !lastCollectedAt) {
    return true;
  }

  const lastMs = new Date(lastCollectedAt).getTime();
  if (Number.isNaN(lastMs)) {
    return true;
  }

  const now = Date.now();
  const elapsed = now - lastMs;
  const intervalMs = parseFrequencyToMs(frequency);
  return elapsed >= intervalMs;
}

function parseFrequencyToMs(frequency: string): number {
  const lower = frequency.toLowerCase().trim();
  if (lower === "daily") {
    return 24 * 60 * 60 * 1000;
  }
  if (lower === "weekly") {
    return 7 * 24 * 60 * 60 * 1000;
  }
  if (lower === "monthly") {
    return 30 * 24 * 60 * 60 * 1000;
  }

  const match = /^(\d+)\s*(h|d|m|w)$/i.exec(lower);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit === "h") return value * 60 * 60 * 1000;
    if (unit === "d") return value * 24 * 60 * 60 * 1000;
    if (unit === "w") return value * 7 * 24 * 60 * 60 * 1000;
    if (unit === "m") return value * 30 * 24 * 60 * 60 * 1000;
  }

  // Default to daily if unparseable.
  return 24 * 60 * 60 * 1000;
}

async function renderIconInline(source: string): Promise<string> {
  const iconPath = findCachedIconPath(source);
  if (!iconPath) {
    return "";
  }
  try {
    // terminal-image is optional — not in package.json dependencies.
    // The `as string` cast prevents TypeScript from resolving the module at compile time.
    const terminalImage = (await import("terminal-image" as string)) as {
      default: {
        buffer: (
          input: Buffer,
          options?: { width?: number; height?: number },
        ) => Promise<string>;
      };
    };
    const imageBuffer = await fsp.readFile(iconPath);
    return await terminalImage.default.buffer(imageBuffer, {
      width: 2,
      height: 1,
    });
  } catch {
    return "";
  }
}

function findCachedIconPath(source: string): string | null {
  const cacheDir = getConnectorCacheDir();
  const extensions = [".png", ".svg", ".jpg", ".jpeg", ".webp"];
  for (const ext of extensions) {
    const candidate = path.join(cacheDir, `${source}.icon${ext}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function createEmitter(options: GlobalOptions): Emitter {
  const renderer = createHumanRenderer();

  return {
    event(event: CliEvent | CliOutcome) {
      if (options.json) {
        process.stdout.write(`${JSON.stringify(event)}\n`);
      }
    },
    info(message: string) {
      if (options.json || options.quiet) {
        return;
      }
      process.stdout.write(`${message}\n`);
    },
    blank() {
      if (options.json || options.quiet) {
        return;
      }
      process.stdout.write("\n");
    },
    title(message: string) {
      if (options.json || options.quiet) {
        return;
      }
      process.stdout.write(`${renderer.title(message)}\n`);
    },
    success(message: string) {
      if (options.json || options.quiet) {
        return;
      }
      process.stdout.write(`${renderer.success(message)}\n`);
    },
    section(message: string) {
      if (options.json || options.quiet) {
        return;
      }
      process.stdout.write(`${renderer.section(message)}\n`);
    },
    keyValue(label: string, value: string, tone: RenderTone = "muted") {
      if (options.json || options.quiet) {
        return;
      }
      process.stdout.write(`${renderer.keyValue(label, value, tone)}\n`);
    },
    detail(message: string) {
      if (options.json || options.quiet) {
        return;
      }
      process.stdout.write(`${renderer.detail(message)}\n`);
    },
    next(command: string) {
      if (options.json || options.quiet) {
        return;
      }
      process.stdout.write(
        `  ${renderer.theme.muted("Next:")} ${renderer.theme.code(command)}\n`,
      );
    },
    bullet(message: string) {
      if (options.json || options.quiet) {
        return;
      }
      process.stdout.write(`${renderer.bullet(message)}\n`);
    },
    sourceTitle(
      name: string,
      badges: Array<{ text: string; tone?: RenderTone }> = [],
    ) {
      if (options.json || options.quiet) {
        return;
      }
      process.stdout.write(
        `${renderer.sourceTitle(
          name,
          badges.map((badge) => renderer.badge(badge.text, badge.tone)),
        )}\n`,
      );
    },
    badge(text: string, tone: RenderTone = "muted") {
      return renderer.badge(text, tone);
    },
    code(text: string) {
      return renderer.theme.code(text);
    },
  };
}

export function displaySource(
  source: string,
  labels: SourceLabelMap = {},
): string {
  return labels[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

function formatCountLabel(label: string, count: number): string {
  const normalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
  return `${normalizedLabel} (${count})`;
}

function joinOverviewParts(parts: string[]): string {
  return parts.filter(Boolean).join(" · ");
}

function humanizeField(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase());
}

export function humanizeIssue(message: string): string {
  if (/checksum|mismatch/i.test(message)) {
    return "Connector is out of date. Will auto-update on next connect.";
  }
  return message;
}

function formatHumanSourceMessage(
  message: string,
  source: string,
  displayName: string,
): string {
  if (!message || source === displayName) {
    return message;
  }

  return message.replace(
    new RegExp(`\\b${escapeRegExp(source)}\\b`, "gi"),
    displayName,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getErrorLogPath(error: unknown): string | null {
  if (
    error &&
    typeof error === "object" &&
    "logPath" in error &&
    typeof (error as { logPath?: unknown }).logPath === "string"
  ) {
    return (error as { logPath: string }).logPath;
  }

  return null;
}

export async function gatherSourceStatuses(
  storedSources: Record<
    string,
    Awaited<ReturnType<typeof readCliState>>["sources"][string]
  >,
  metadata: SourceMetadataMap = {},
): Promise<SourceStatus[]> {
  const installedFiles = await listInstalledConnectorFiles();
  const sourceNames = new Set([
    ...Object.keys(storedSources),
    ...installedFiles.map((file) => file.source),
  ]);

  return [...sourceNames]
    .map((source): SourceStatus => {
      const stored = storedSources[source] ?? {};
      const installed = installedFiles.some((file) => file.source === source);
      const details = metadata[source];
      const dataState: SourceStatus["dataState"] =
        stored.dataState === "ingested_personal_server"
          ? "ingested_personal_server"
          : stored.dataState === "ingest_failed"
            ? "ingest_failed"
            : stored.dataState === "collected_local"
              ? "collected_local"
              : "none";
      const ingestScopes = stored.ingestScopes;
      const syncedScopeCount =
        ingestScopes?.filter((s) => s.status === "stored").length ?? 0;
      const failedScopeCount =
        ingestScopes?.filter((s) => s.status === "failed").length ?? 0;
      return {
        source,
        name: details?.name,
        company: details?.company,
        description: details?.description,
        authMode:
          details?.authMode ?? inferInstalledAuthMode(installedFiles, source),
        connectorVersion: stored.connectorVersion,
        exportFrequency: stored.exportFrequency,
        lastCollectedAt: stored.lastCollectedAt,
        installed,
        sessionPresent: stored.sessionPresent ?? false,
        lastRunAt: stored.lastRunAt ?? null,
        lastRunOutcome: stored.lastRunOutcome ?? null,
        dataState,
        lastError: stored.lastError ?? null,
        lastResultPath: stored.lastResultPath ?? null,
        lastLogPath: stored.lastLogPath ?? null,
        ingestScopes,
        syncedScopeCount: syncedScopeCount > 0 ? syncedScopeCount : undefined,
        failedScopeCount: failedScopeCount > 0 ? failedScopeCount : undefined,
      };
    })
    .sort(compareSourceStatusOrder);
}

export async function listInstalledConnectorFiles(): Promise<
  Array<{ source: string; path: string }>
> {
  const connectorsDir = getConnectorCacheDir();
  try {
    const results: Array<{ source: string; path: string }> = [];
    const entries = await fsp.readdir(connectorsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const companyDir = path.join(connectorsDir, entry.name);
      const files = await fsp.readdir(companyDir);
      for (const file of files) {
        if (!file.endsWith("-playwright.js")) {
          continue;
        }
        results.push({
          source: file.replace(/-playwright\.js$/, ""),
          path: path.join(companyDir, file),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

function formatSourceStatusDetails(source: SourceStatus): SourceStatusDetail[] {
  const details: SourceStatusDetail[] = [];
  const displayName = source.name ?? displaySource(source.source);

  if (source.lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT) {
    details.push(
      source.lastError
        ? {
            kind: "text",
            message: `${source.lastError}. Run \`vana connect ${source.source}\` interactively.`,
          }
        : {
            kind: "text",
            message: `Run \`vana connect ${source.source}\` interactively.`,
          },
    );
  }

  if (source.lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH) {
    details.push({
      kind: "text",
      message: `Run \`vana connect ${source.source}\` without \`--no-input\` to complete the manual browser step.`,
    });
  }

  if (source.lastRunOutcome === CliOutcomeStatus.RUNTIME_ERROR) {
    details.push(
      source.lastError
        ? {
            kind: "text",
            message: formatHumanSourceMessage(
              source.lastError,
              source.source,
              displayName,
            ),
          }
        : {
            kind: "text",
            message: "The last connector run failed.",
          },
    );
  }

  if (source.lastRunOutcome === CliOutcomeStatus.CONNECTOR_UNAVAILABLE) {
    details.push(
      source.lastError
        ? {
            kind: "text",
            message: formatHumanSourceMessage(
              source.lastError,
              source.source,
              displayName,
            ),
          }
        : {
            kind: "text",
            message: "No connector is available for this source.",
          },
    );
  }

  if (!source.lastRunOutcome && source.installed) {
    details.push({
      kind: "text",
      message: `Run \`vana connect ${source.source}\` to collect data.`,
    });
  }

  if (
    source.lastRunOutcome === CliOutcomeStatus.CONNECTED_LOCAL_ONLY &&
    source.lastResultPath
  ) {
    details.push({
      kind: "text",
      message: `Inspect the latest local dataset with \`vana data show ${source.source}\`.`,
    });
  }

  if (
    source.sessionPresent &&
    (source.lastRunOutcome === CliOutcomeStatus.CONNECTED_LOCAL_ONLY ||
      source.lastRunOutcome === CliOutcomeStatus.CONNECTED_AND_INGESTED ||
      source.lastRunOutcome === CliOutcomeStatus.INGEST_FAILED)
  ) {
    details.push({
      kind: "row",
      label: "Session",
      value: "Session cached.",
      tone: "muted",
    });
  }

  if (source.lastRunOutcome === CliOutcomeStatus.CONNECTED_AND_INGESTED) {
    details.push({
      kind: "text",
      message: `Inspect the latest local dataset with \`vana data show ${source.source}\` or use your Personal Server copy.`,
    });
  }

  if (source.lastRunOutcome === CliOutcomeStatus.INGEST_FAILED) {
    details.push(
      source.lastError
        ? {
            kind: "text",
            message: `${source.lastError} Inspect the local dataset with \`vana data show ${source.source}\`.`,
          }
        : {
            kind: "text",
            message: `Personal Server sync failed. Inspect the local dataset with \`vana data show ${source.source}\`.`,
          },
    );
  }

  if (source.dataState === "ingested_personal_server") {
    details.push({
      kind: "row",
      label: "State",
      value: "Synced to Personal Server",
      tone: "success",
    });
  } else if (source.dataState === "ingest_failed") {
    details.push({
      kind: "row",
      label: "State",
      value: "Saved locally, sync failed",
      tone: "warning",
    });
  } else if (source.dataState === "collected_local") {
    details.push({
      kind: "row",
      label: "State",
      value: "Saved locally",
      tone: "muted",
    });
  }

  if (source.lastRunAt) {
    details.push({
      kind: "row",
      label: "Updated",
      value: `${formatTimestamp(source.lastRunAt)} (${formatRelativeTime(source.lastRunAt)})`,
      tone: "muted",
    });
  }

  if (source.lastResultPath && source.dataState !== "none") {
    details.push({
      kind: "row",
      label: "Path",
      value: formatDisplayPath(source.lastResultPath),
      tone: "muted",
    });
  }

  if (
    source.lastLogPath &&
    source.lastRunOutcome &&
    source.lastRunOutcome !== CliOutcomeStatus.CONNECTED_LOCAL_ONLY &&
    source.lastRunOutcome !== CliOutcomeStatus.CONNECTED_AND_INGESTED
  ) {
    details.push({
      kind: "row",
      label: "Run log",
      value: formatDisplayPath(source.lastLogPath),
      tone: "muted",
    });
  }

  return details;
}

export function buildStatusNextSteps(
  sources: SourceStatus[],
  sourceLabels: SourceLabelMap = {},
  runtime: CliStatus["runtime"] = "unhealthy",
  availableSources: Array<{ id: string; name: string; authMode?: string }> = [],
): string[] {
  const nextSteps: string[] = [];
  const highestPriority = [...sources].sort(compareSourceStatusOrder)[0];
  const connectedSources = sources.filter(
    (source) =>
      source.dataState === "collected_local" ||
      source.dataState === "ingested_personal_server" ||
      source.dataState === "ingest_failed",
  );
  const needsAttention = sources.some(
    (source) => rankSourceStatus(source) <= 4,
  );
  const highestPriorityLabel = highestPriority
    ? displaySource(highestPriority.source, sourceLabels)
    : null;
  const suggestedSource =
    availableSources.find((source) => source.authMode !== "legacy") ??
    availableSources[0];

  if (!highestPriority) {
    if (runtime === "installed") {
      if (suggestedSource) {
        nextSteps.push(
          `Connect ${suggestedSource.name} with \`vana connect ${suggestedSource.id}\`.`,
        );
      } else {
        nextSteps.push("Connect your first source with `vana connect`.");
      }
    } else if (runtime === "missing") {
      nextSteps.push("Install the local runtime with `vana setup`.");
      nextSteps.push("Inspect install health with `vana doctor`.");
    } else if (runtime === "unhealthy") {
      nextSteps.push("Inspect install health with `vana doctor`.");
    }
  } else if (highestPriority.lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT) {
    nextSteps.push(
      `Continue ${highestPriorityLabel} with \`vana connect ${highestPriority.source}\`.`,
    );
    if (highestPriority.lastLogPath) {
      nextSteps.push(
        `Inspect the latest run log with \`vana logs ${highestPriority.source}\`.`,
      );
    }
  } else if (highestPriority.lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH) {
    nextSteps.push(
      `Complete the manual browser step for ${highestPriorityLabel} with \`vana connect ${highestPriority.source}\`.`,
    );
    if (highestPriority.lastLogPath) {
      nextSteps.push(
        `Inspect the latest run log with \`vana logs ${highestPriority.source}\`.`,
      );
    }
  } else if (
    highestPriority.lastRunOutcome === CliOutcomeStatus.CONNECTOR_UNAVAILABLE
  ) {
    nextSteps.push("Browse available sources with `vana sources`.");
    if (highestPriority.lastLogPath) {
      nextSteps.push(
        `Inspect the latest run log with \`vana logs ${highestPriority.source}\`.`,
      );
    }
  } else if (
    highestPriority.dataState === "collected_local" ||
    highestPriority.dataState === "ingested_personal_server" ||
    highestPriority.dataState === "ingest_failed"
  ) {
    if (connectedSources.length > 1) {
      nextSteps.push("Review your collected data with `vana data list`.");
    } else {
      nextSteps.push(
        `Inspect the latest dataset with \`vana data show ${highestPriority.source}\`.`,
      );
    }
  }

  if (connectedSources.length > 0 && needsAttention) {
    nextSteps.push(
      connectedSources.length > 1
        ? "Review the data you already collected with `vana data list`."
        : `Inspect the data you already collected with \`vana data show ${connectedSources[0].source}\`.`,
    );
  }

  if (
    sources.some((source) => source.installed || source.lastRunOutcome) &&
    (!needsAttention || connectedSources.length === 0)
  ) {
    nextSteps.push("Connect another source with `vana sources`.");
  }

  if (
    runtime !== "installed" ||
    sources.some(
      (source) =>
        source.lastRunOutcome === CliOutcomeStatus.RUNTIME_ERROR ||
        source.lastRunOutcome === CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR,
    )
  ) {
    nextSteps.push("Inspect install health with `vana doctor`.");
  }

  return [...new Set(nextSteps)];
}

export function buildSourcesNextSteps(
  recommendedSource:
    | {
        id: string;
        name: string;
        authMode?: "automated" | "interactive" | "legacy";
      }
    | null
    | undefined,
  connectedCount: number,
): string[] {
  const nextSteps: string[] = [];

  if (connectedCount > 0) {
    nextSteps.push("Inspect what you already collected with `vana data list`.");
  }
  if (recommendedSource) {
    nextSteps.push(
      `${
        recommendedSource.authMode === "legacy" ? "Complete" : "Connect"
      } ${recommendedSource.name} with \`vana connect ${recommendedSource.id}\`.`,
    );
  }
  nextSteps.push("Or browse the guided picker with `vana connect`.");

  return [...new Set(nextSteps)];
}

export function buildDataListNextSteps(
  datasetRecords: Array<{
    source: string;
    name?: string | null;
  }>,
  registrySources: Array<{
    id: string;
    authMode?: "automated" | "interactive" | "legacy";
  }>,
): string[] {
  if (datasetRecords.length === 0) {
    const suggestedSource =
      registrySources.find((source) => source.authMode !== "legacy") ??
      registrySources[0];

    return [
      suggestedSource
        ? `Collect your first dataset with \`vana connect ${suggestedSource.id}\`.`
        : "Collect your first dataset with `vana connect`.",
      "Check overall status with `vana status`.",
    ];
  }

  return [
    `Inspect ${datasetRecords[0].name ?? displaySource(datasetRecords[0].source)} with \`vana data show ${datasetRecords[0].source}\`.`,
    `Or print its path with \`vana data path ${datasetRecords[0].source}\`.`,
    "Connect another source with `vana sources`.",
  ];
}

export function buildDataShowNextSteps(
  source: string,
  datasetCount: number,
  sourceLabels: SourceLabelMap = {},
): string[] {
  return [
    `Print the path with \`vana data path ${source}\`.`,
    `Reconnect ${displaySource(source, sourceLabels)} with \`vana connect ${source}\`.`,
    ...(datasetCount > 1
      ? ["See all datasets with `vana data list`."]
      : ["Connect another source with `vana sources`."]),
  ];
}

function buildLogsNextSteps(
  records: Array<{
    source: string;
    lastRunOutcome: string | null;
    dataState: SourceStatus["dataState"] | null;
  }>,
): string[] {
  if (records.length === 0) {
    return [
      "Run `vana connect <source>` to create a connector run log.",
      "Check overall status with `vana status`.",
    ];
  }

  const attentionRecord = records.find((record) =>
    isAttentionLog(record.lastRunOutcome, record.dataState),
  );
  const successfulRecord = records.find(
    (record) => !isAttentionLog(record.lastRunOutcome, record.dataState),
  );
  return [
    attentionRecord
      ? `Inspect the latest issue log with \`vana logs ${attentionRecord.source}\`.`
      : `Print the latest log path with \`vana logs ${records[0].source}\`.`,
    ...(successfulRecord
      ? [
          `Inspect a successful run with \`vana logs ${successfulRecord.source}\`.`,
        ]
      : []),
    "Check overall status with `vana status`.",
  ];
}

/** Extract a `vana ...` command from a next-step sentence wrapped in backticks. */
function extractCommand(sentence: string): string | null {
  const match = sentence.match(/`(vana\s[^`]+)`/);
  return match ? match[1] : null;
}

// describeConnectTrust and buildConnectChoices removed — replaced by clack-based picker

function formatMissingConnectSourceMessage(
  source:
    | {
        id: string;
        name: string;
      }
    | undefined,
): string {
  if (source) {
    return `Specify a source. Start with \`vana connect ${source.id}\`, or run \`vana sources\` to see available options.`;
  }

  return "Specify a source. Run `vana sources` to see available options.";
}

// formatSourcePickerDescription removed — replaced by clack-based picker with hints

function normalizeArgv(argv: string[]): string[] {
  if (
    argv[2] === "connect" &&
    ["list", "status", "setup"].includes(argv[3] ?? "")
  ) {
    const mapping: Record<string, string> = {
      list: "sources",
      status: "status",
      setup: "setup",
    };
    return [argv[0], argv[1], mapping[argv[3]], ...argv.slice(4)];
  }

  return argv;
}

export function getCliVersion(): string {
  if (process.env.VANA_APP_ROOT) {
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(
          path.join(process.env.VANA_APP_ROOT, "package.json"),
          "utf8",
        ),
      ) as { version?: string };
      if (packageJson.version) {
        return packageJson.version;
      }
    } catch {
      // Fall through to the repo/dev package metadata.
    }
  }

  try {
    const packageJson = require("../../package.json") as { version?: string };
    if (packageJson.version) {
      return packageJson.version;
    }
  } catch {
    // Fall through to the hard default.
  }

  return "0.0.0";
}

export function getCliChannel(version = getCliVersion()): "stable" | "canary" {
  if (version.includes("canary")) {
    return "canary";
  }

  const candidates = [process.env.VANA_APP_ROOT ?? "", process.execPath].map(
    (value) => value.replace(/\\/g, "/").toLowerCase(),
  );

  return candidates.some((normalizedPath) =>
    /\/releases\/canary-[^/]+(?:\/app)?$/.test(normalizedPath),
  )
    ? "canary"
    : "stable";
}

export function getCliInstallMethod(
  execPath = process.execPath,
): CliInstallMethod {
  const candidates = [process.env.VANA_APP_ROOT ?? "", execPath].map((value) =>
    value.replace(/\\/g, "/").toLowerCase(),
  );

  for (const normalizedPath of candidates) {
    if (!normalizedPath) {
      continue;
    }
    if (normalizedPath.includes("/cellar/vana/")) {
      return "homebrew";
    }
    if (
      normalizedPath.includes("/.local/share/vana/") ||
      normalizedPath.includes("/appdata/local/vana/") ||
      normalizedPath.endsWith("/current/app") ||
      /\/releases\/[^/]+\/app$/.test(normalizedPath)
    ) {
      return "installer";
    }
    if (
      normalizedPath.endsWith("/node") ||
      normalizedPath.endsWith("/node.exe") ||
      normalizedPath.includes("/.nvm/") ||
      normalizedPath.includes("/volta/") ||
      normalizedPath.includes("/pnpm/")
    ) {
      return "development";
    }
  }
  return "unknown";
}

function getCliAppRoot(execPath = process.execPath): string {
  return process.env.VANA_APP_ROOT ?? path.join(path.dirname(execPath), "app");
}

export function getDoctorAppRootPath(
  installMethod: CliInstallMethod,
  execPath = process.execPath,
): string | null {
  if (process.env.VANA_APP_ROOT) {
    return process.env.VANA_APP_ROOT;
  }
  if (installMethod === "homebrew" || installMethod === "installer") {
    return getCliAppRoot(execPath);
  }
  return null;
}

export function formatInstallMethodLabel(method: CliInstallMethod): string {
  switch (method) {
    case "homebrew":
      return "Homebrew";
    case "installer":
      return "Hosted installer";
    case "development":
      return "Development checkout";
    default:
      return "Unknown";
  }
}

export function getLifecycleCommands(
  installMethod: CliInstallMethod,
  channel: CliChannel,
): { upgrade: string; uninstall: string } {
  switch (installMethod) {
    case "homebrew":
      return {
        upgrade: "brew update && brew upgrade vana",
        uninstall: "brew uninstall vana",
      };
    case "installer":
      return {
        upgrade:
          channel === "canary"
            ? "curl -fsSL https://raw.githubusercontent.com/vana-com/vana-connect/feat/connect-cli-v1/install/install.sh | sh -s -- --version canary-feat-connect-cli-v1"
            : "curl -fsSL https://raw.githubusercontent.com/vana-com/vana-connect/main/install/install.sh | sh",
        uninstall:
          "rm -f ~/.local/bin/vana && rm -rf ~/.local/share/vana ~/.dataconnect",
      };
    case "development":
      return {
        upgrade: "git pull && pnpm install && pnpm build",
        uninstall:
          "Remove the local checkout and any generated ~/.dataconnect state.",
      };
    default:
      return {
        upgrade: "Reinstall vana using Homebrew or the hosted installer.",
        uninstall:
          "Remove the installed vana binary and any ~/.dataconnect state you no longer need.",
      };
  }
}

function extractGlobalOptions(argv: string[]): GlobalOptions {
  return {
    json: argv.includes("--json"),
    noInput: argv.includes("--no-input"),
    yes: argv.includes("--yes"),
    quiet: argv.includes("--quiet"),
  };
}

export function createSourceLabelMap(
  sources: Array<{ id: string; name: string }>,
): SourceLabelMap {
  return Object.fromEntries(sources.map((source) => [source.id, source.name]));
}

export function createSourceMetadataMap(
  sources: Array<{
    id: string;
    name: string;
    company?: string;
    description?: string;
    authMode?: "automated" | "interactive" | "legacy";
  }>,
): SourceMetadataMap {
  return Object.fromEntries(
    sources.map((source) => [
      source.id,
      {
        name: source.name,
        company: source.company,
        description: source.description,
        authMode: source.authMode,
      },
    ]),
  );
}

// formatAuthModeBadge removed — replaced by clack-based picker with hints

export function getSourceStatusPresentation(source: SourceStatus): {
  label: string;
  tone: RenderTone;
} {
  if (!source.installed && !source.lastRunOutcome) {
    return { label: "not connected", tone: "muted" };
  }

  if (!source.lastRunOutcome) {
    return { label: "installed", tone: "success" };
  }

  if (source.lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT) {
    return { label: "needs input", tone: "warning" };
  }

  if (source.lastRunOutcome === CliOutcomeStatus.RUNTIME_ERROR) {
    return { label: "error", tone: "error" };
  }

  if (source.lastRunOutcome === CliOutcomeStatus.CONNECTOR_UNAVAILABLE) {
    return { label: "unavailable", tone: "warning" };
  }

  if (source.lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH) {
    return { label: "manual step", tone: "warning" };
  }

  if (source.dataState === "ingested_personal_server") {
    // Check per-scope state for more granular badges
    if (source.ingestScopes && source.ingestScopes.length > 0) {
      const storedCount = source.ingestScopes.filter(
        (s) => s.status === "stored",
      ).length;
      const failedCount = source.ingestScopes.filter(
        (s) => s.status === "failed",
      ).length;
      if (failedCount > 0 && storedCount > 0) {
        return { label: "partial sync", tone: "warning" };
      }
      if (failedCount > 0 && storedCount === 0) {
        return { label: "sync failed", tone: "error" };
      }
    }
    return { label: "synced", tone: "success" };
  }

  if (source.dataState === "collected_local") {
    return { label: "local", tone: "muted" };
  }

  if (source.dataState === "ingest_failed") {
    return { label: "sync failed", tone: "error" };
  }

  return { label: "connected", tone: "success" };
}

export function toneForRuntime(runtime: CliStatus["runtime"]): RenderTone {
  if (runtime === "installed") {
    return "success";
  }
  if (runtime === "missing") {
    return "warning";
  }
  return "muted";
}

// formatProgressUpdate removed — replaced by ConnectRenderer scope methods

/**
 * Extract a human-readable scope name from a progress-update event.
 * The scope name comes from `phase.label` when `phase` is a structured object.
 */
function extractScopeName(event: {
  phase?: unknown;
  message?: string;
}): string | null {
  if (
    event.phase &&
    typeof event.phase === "object" &&
    "label" in event.phase &&
    typeof (event.phase as { label?: unknown }).label === "string"
  ) {
    return (event.phase as { label: string }).label;
  }
  return null;
}

/**
 * Format detail text for a completed scope (e.g. "8 found").
 * Extracts count from event.count or parses it from the message.
 */
function formatScopeDetail(event: {
  count?: number;
  message?: string;
}): string | undefined {
  if (typeof event.count === "number") {
    return `${event.count} found`;
  }
  // Try to extract a count from the completion message (e.g. "Complete! 8 repositories collected.")
  if (typeof event.message === "string") {
    const match = event.message.match(/(\d+)\s+\w+/);
    if (match) {
      return match[0];
    }
  }
  return undefined;
}

// shouldRenderStatusUpdate removed — status updates are silent in the new design

function inferInstalledAuthMode(
  installedFiles: Array<{ source: string; path: string }>,
  source: string,
): "automated" | "interactive" | "legacy" | undefined {
  const match = installedFiles.find((file) => file.source === source);
  if (!match) {
    return undefined;
  }

  try {
    const script = fs.readFileSync(match.path, "utf8");
    if (/page\.requestInput\(/.test(script)) {
      return "interactive";
    }
    if (/page\.(showBrowser|promptUser)\(/.test(script)) {
      return "legacy";
    }
    return "automated";
  } catch {
    return undefined;
  }
}

export async function loadRegistrySources() {
  try {
    return (
      (await listAvailableSources(findDataConnectorsDir() ?? undefined)) ?? []
    ).sort(compareRegistrySourceOrder);
  } catch {
    return [];
  }
}

function compareRegistrySourceOrder(
  left: AvailableSource,
  right: AvailableSource,
): number {
  return (
    rankAuthMode(left.authMode) - rankAuthMode(right.authMode) ||
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}

export function compareSourceStatusOrder(
  left: SourceStatus,
  right: SourceStatus,
): number {
  return (
    rankSourceStatus(left) - rankSourceStatus(right) ||
    compareRegistrySourceOrder(
      {
        id: left.source,
        name: left.name ?? displaySource(left.source),
        authMode: left.authMode,
      },
      {
        id: right.source,
        name: right.name ?? displaySource(right.source),
        authMode: right.authMode,
      },
    )
  );
}

export function rankSourceStatus(source: SourceStatus): number {
  if (source.lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT) {
    return 0;
  }
  if (source.lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH) {
    return 1;
  }
  if (source.lastRunOutcome === CliOutcomeStatus.INGEST_FAILED) {
    return 2;
  }
  if (source.lastRunOutcome === CliOutcomeStatus.RUNTIME_ERROR) {
    return 3;
  }
  if (source.lastRunOutcome === CliOutcomeStatus.CONNECTOR_UNAVAILABLE) {
    return 4;
  }
  if (source.dataState === "ingested_personal_server") {
    return 5;
  }
  if (source.dataState === "collected_local") {
    return 6;
  }
  if (source.installed) {
    return 7;
  }
  return 8;
}

function rankAuthMode(authMode: AvailableSource["authMode"]): number {
  if (authMode === "interactive") {
    return 0;
  }
  if (authMode === "automated") {
    return 1;
  }
  if (authMode === "legacy") {
    return 2;
  }
  return 3;
}

export async function readResultSummary(
  resultPath: string,
): Promise<{ lines: string[] } | null> {
  try {
    const raw = await fsp.readFile(resultPath, "utf8");
    return summarizeResultData(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function summarizeResultData(
  data: Record<string, unknown>,
): { lines: string[] } | null {
  const lines: string[] = [];
  const exportSummary =
    typeof data.exportSummary === "object" && data.exportSummary
      ? (data.exportSummary as Record<string, unknown>)
      : null;
  const profile =
    typeof data.profile === "object" && data.profile
      ? (data.profile as Record<string, unknown>)
      : null;

  if (profile?.username && typeof profile.username === "string") {
    lines.push(`Profile: ${profile.username}`);
  }

  if (Array.isArray(data.repositories)) {
    lines.push(`Repositories: ${data.repositories.length}`);
    const preview = summarizeNamedItems(data.repositories, "Latest repos");
    if (preview) {
      lines.push(preview);
    }
  }

  if (Array.isArray(data.starred)) {
    lines.push(`Starred: ${data.starred.length}`);
  }

  if (Array.isArray(data.orders)) {
    lines.push(`Orders: ${data.orders.length}`);
  }

  if (Array.isArray(data.playlists)) {
    lines.push(`Playlists: ${data.playlists.length}`);
    const preview = summarizeNamedItems(data.playlists, "Playlists");
    if (preview) {
      lines.push(preview);
    }
  }

  if (
    exportSummary?.details &&
    typeof exportSummary.details === "string" &&
    !lines.includes(exportSummary.details) &&
    !Array.isArray(data.repositories) &&
    !Array.isArray(data.starred) &&
    !Array.isArray(data.orders) &&
    !Array.isArray(data.playlists)
  ) {
    lines.push(exportSummary.details);
  }

  return lines.length > 0 ? { lines } : null;
}

function summarizeNamedItems(
  items: unknown[],
  label: string,
  maxItems = 2,
): string | null {
  const names = items
    .map((item) => {
      if (
        typeof item === "object" &&
        item &&
        "name" in item &&
        typeof (item as { name?: unknown }).name === "string"
      ) {
        return (item as { name: string }).name;
      }
      return null;
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, maxItems);

  if (names.length === 0) {
    return null;
  }

  return `${label}: ${names.join(", ")}`;
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function compareDatasetOrder(
  left: {
    lastRunAt: string | null;
    name: string | undefined;
    source: string;
  },
  right: {
    lastRunAt: string | null;
    name: string | undefined;
    source: string;
  },
): number {
  const leftTime = left.lastRunAt ? Date.parse(left.lastRunAt) : 0;
  const rightTime = right.lastRunAt ? Date.parse(right.lastRunAt) : 0;
  return (
    rightTime - leftTime ||
    (left.name ?? left.source).localeCompare(
      right.name ?? right.source,
      undefined,
      {
        sensitivity: "base",
      },
    )
  );
}

function compareLogRecordOrder(
  left: {
    source: string;
    lastRunAt: string | null;
  },
  right: {
    source: string;
    lastRunAt: string | null;
  },
): number {
  const leftTimestamp = left.lastRunAt ? Date.parse(left.lastRunAt) : 0;
  const rightTimestamp = right.lastRunAt ? Date.parse(right.lastRunAt) : 0;
  return (
    rightTimestamp - leftTimestamp ||
    left.source.localeCompare(right.source, undefined, {
      sensitivity: "base",
    })
  );
}

export function hasCollectedData(
  dataState: SourceStatus["dataState"] | null | undefined,
): boolean {
  return (
    dataState === "collected_local" ||
    dataState === "ingested_personal_server" ||
    dataState === "ingest_failed"
  );
}

function formatLogOutcomeLabel(
  lastRunOutcome: string | null,
  dataState: SourceStatus["dataState"] | null,
): string {
  if (lastRunOutcome === CliOutcomeStatus.CONNECTOR_UNAVAILABLE) {
    return "unavailable";
  }
  if (lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH) {
    return "manual step";
  }
  if (lastRunOutcome === CliOutcomeStatus.RUNTIME_ERROR) {
    return "error";
  }
  if (lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT) {
    return "needs input";
  }
  if (dataState === "ingested_personal_server") {
    return "synced";
  }
  if (dataState === "ingest_failed") {
    return "sync failed";
  }
  if (dataState === "collected_local") {
    return "local";
  }
  return "recent";
}

function isAttentionLog(
  lastRunOutcome: string | null,
  dataState: SourceStatus["dataState"] | null,
): boolean {
  return !(
    dataState === "collected_local" ||
    dataState === "ingested_personal_server" ||
    lastRunOutcome === CliOutcomeStatus.CONNECTED_LOCAL_ONLY ||
    lastRunOutcome === CliOutcomeStatus.CONNECTED_AND_INGESTED
  );
}

function toneForLogOutcome(
  lastRunOutcome: string | null,
  dataState: SourceStatus["dataState"] | null,
): RenderTone {
  if (lastRunOutcome === CliOutcomeStatus.RUNTIME_ERROR) {
    return "error";
  }
  if (
    lastRunOutcome === CliOutcomeStatus.CONNECTOR_UNAVAILABLE ||
    lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH ||
    lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT ||
    dataState === "ingest_failed"
  ) {
    return "warning";
  }
  if (dataState === "ingested_personal_server") {
    return "success";
  }
  if (dataState === "collected_local") {
    return "muted";
  }
  return "muted";
}

function isPromptCancelled(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ExitPromptError" || error.message.includes("SIGINT"))
  );
}

// ---------------------------------------------------------------------------
// Skill commands
// ---------------------------------------------------------------------------

async function runSkillList(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);

  try {
    const skills = await listAvailableSkills();
    const installed = await readInstalledSkills();
    const installedIds = new Set(installed.map((s) => s.id));

    const enriched = skills.map((skill) => ({
      ...skill,
      installed: installedIds.has(skill.id),
    }));

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ count: enriched.length, skills: enriched })}\n`,
      );
      return 0;
    }

    emit.title("Available skills");
    emit.blank();

    if (enriched.length === 0) {
      emit.info("No skills are available right now.");
      return 0;
    }

    for (const skill of enriched) {
      const badges: Array<{ text: string; tone?: RenderTone }> = [];
      if (skill.installed) {
        badges.push({ text: "installed", tone: "success" });
      }
      emit.sourceTitle(skill.name, badges);
      emit.detail(skill.description);
    }

    const uninstalled = enriched.find((s) => !s.installed);
    if (uninstalled) {
      emit.blank();
      emit.next(`vana skill install ${uninstalled.id}`);
    }

    return 0;
  } catch (error) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
      );
    } else {
      emit.info(error instanceof Error ? error.message : String(error));
    }
    return 1;
  }
}

async function runSkillInstall(
  name: string,
  options: GlobalOptions,
): Promise<number> {
  const emit = createEmitter(options);

  try {
    const { installedPath } = await installSkill(name);

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ ok: true, id: name, installedPath })}\n`,
      );
      return 0;
    }

    emit.success(`Installed ${name}.`);
    emit.detail(formatDisplayPath(installedPath));
    emit.blank();
    emit.next("vana skill list");

    return 0;
  } catch (error) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`,
      );
    } else {
      emit.info(error instanceof Error ? error.message : String(error));
    }
    return 1;
  }
}

async function runSkillShow(
  name: string,
  options: GlobalOptions,
): Promise<number> {
  const emit = createEmitter(options);

  try {
    const skills = await listAvailableSkills();
    const match = skills.find((s) => s.id.toLowerCase() === name.toLowerCase());

    if (!match) {
      if (options.json) {
        process.stdout.write(
          `${JSON.stringify({ error: `No skill found with id "${name}".` })}\n`,
        );
      } else {
        emit.info(`No skill found with id "${name}".`);
        emit.blank();
        emit.next("vana skill list");
      }
      return 1;
    }

    const installed = await readInstalledSkills();
    const isInstalled = installed.some((s) => s.id === match.id);

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ ...match, installed: isInstalled })}\n`,
      );
      return 0;
    }

    const badges: Array<{ text: string; tone?: RenderTone }> = [];
    if (isInstalled) {
      badges.push({ text: "installed", tone: "success" });
    }
    emit.sourceTitle(match.name, badges);
    emit.detail(match.description);
    emit.keyValue("Version", match.version);

    if (!isInstalled) {
      emit.blank();
      emit.next(`vana skill install ${match.id}`);
    }

    return 0;
  } catch (error) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`,
      );
    } else {
      emit.info(error instanceof Error ? error.message : String(error));
    }
    return 1;
  }
}
