import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { confirm, input, password } from "@inquirer/prompts";
import { Command } from "commander";

import {
  CliOutcomeStatus,
  getBrowserProfilesDir,
  getConnectorCacheDir,
  getLastResultPath,
  readCliState,
  updateSourceState,
} from "../core/index.js";
import type {
  CliEvent,
  CliOutcome,
  CliStatus,
  SourceStatus,
} from "../core/cli-types.js";
import { listAvailableSources } from "../connectors/registry.js";
import {
  detectPersonalServerTarget,
  ingestResult,
} from "../personal-server/index.js";
import {
  findDataConnectorsDir,
  ManagedPlaywrightRuntime,
} from "../runtime/index.js";

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
  };
}

export async function runCli(argv = process.argv): Promise<number> {
  const normalizedArgv = normalizeArgv(argv);
  const parsedOptions = extractGlobalOptions(normalizedArgv);
  const program = new Command();
  program.name("vana").description("Vana Connect CLI");

  program
    .command("connect <source>")
    .option("--json", "Output machine-readable JSON")
    .option("--no-input", "Fail instead of prompting for input")
    .option("--yes", "Approve safe setup prompts automatically")
    .option("--quiet", "Reduce non-essential output")
    .action(async (source: string) => {
      process.exitCode = await runConnect(source, parsedOptions);
    });

  program
    .command("sources")
    .description("List supported sources")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      process.exitCode = await runList(parsedOptions);
    });

  program
    .command("status")
    .description("Show runtime and Personal Server status")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      process.exitCode = await runStatus(parsedOptions);
    });

  program
    .command("setup")
    .description("Install or repair the local runtime")
    .option("--json", "Output machine-readable JSON")
    .option("--yes", "Approve safe setup prompts automatically")
    .action(async () => {
      process.exitCode = await runSetup(parsedOptions);
    });

  await program.parseAsync(normalizedArgv);
  return Number(process.exitCode ?? 0);
}

async function runConnect(
  source: string,
  options: GlobalOptions,
): Promise<number> {
  const runtime = new ManagedPlaywrightRuntime();
  const emit = createEmitter(options);
  const registrySources = await loadRegistrySources();
  const sourceLabels = createSourceLabelMap(registrySources);
  let setupLogPath: string | undefined;
  let fetchLogPath: string | undefined;
  let runLogPath: string | undefined;

  try {
    emit.info(
      `Finding a connector for ${displaySource(source, sourceLabels)}...`,
    );
    const target = await detectPersonalServerTarget();

    if (runtime.state !== "installed") {
      emit.info(
        `Vana Connect needs a local browser runtime before it can connect ${displaySource(
          source,
          sourceLabels,
        )}.`,
      );
      emit.info("");
      emit.info("This will install:");
      emit.info("- the connector runner");
      emit.info("- a Chromium browser engine");
      emit.info("- local runtime files under ~/.dataconnect/");
      emit.info("");
      emit.info(
        "Your credentials stay on this machine. Nothing is sent anywhere except the platform you’re connecting to.",
      );

      if (!options.yes) {
        if (options.noInput) {
          emit.event({
            type: "outcome",
            status: CliOutcomeStatus.SETUP_REQUIRED,
            source,
          });
          return 1;
        }

        const shouldContinue = await confirm({
          message: "Continue?",
          default: true,
        });
        if (!shouldContinue) {
          emit.event({
            type: "outcome",
            status: CliOutcomeStatus.SETUP_REQUIRED,
            source,
            reason: "setup_declined",
          });
          return 1;
        }
      }

      const installResult = await runtime.ensureInstalled(Boolean(options.yes));
      setupLogPath = installResult.logPath;
      emit.event({
        type: "setup-complete",
        runtime: installResult.runtime,
        logPath: installResult.logPath,
      });
      emit.info("Runtime ready.");
      if (installResult.logPath) {
        emit.info(`Setup log: ${installResult.logPath}`);
      }
    } else {
      emit.event({
        type: "setup-check",
        runtime: runtime.state,
      });
    }

    const fetched = await runtime.fetchConnector(source);
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
    emit.info("Connector ready.");
    if (sourceDetails?.description) {
      emit.info(sourceDetails.description);
    }

    const profilePath = path.join(
      getBrowserProfilesDir(),
      `${path.basename(resolution.connectorPath, path.extname(resolution.connectorPath))}`,
    );
    if (fs.existsSync(profilePath)) {
      emit.info(
        `Found an existing ${displaySource(source, sourceLabels)} session. Trying that first...`,
      );
    }

    await updateSourceState(resolution.source, {
      connectorInstalled: true,
      sessionPresent: fs.existsSync(profilePath),
      lastError: null,
    });

    emit.info(`Connecting to ${displaySource(source, sourceLabels)}...`);
    emit.info("Collecting your data...");

    let finalStatus: CliOutcome["status"] =
      CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR;
    let resultPath = getLastResultPath();
    let collectedResult = false;

    for await (const event of runtime.runConnector({
      connectorPath: resolution.connectorPath,
      source: resolution.source,
      noInput: options.noInput,
      onNeedInput: async (needInput) => {
        emit.info("");
        emit.info(
          `To connect ${displaySource(source, sourceLabels)}, Vana Connect will open a local browser session on this machine.`,
        );
        emit.info("Your credentials stay local.");
        emit.info("");
        emit.info(
          needInput.message ??
            `${displaySource(source, sourceLabels)} needs additional details to continue.`,
        );

        const values: Record<string, string> = {};
        for (const field of needInput.fields) {
          if (field.toLowerCase().includes("password")) {
            values[field] = await password({ message: humanizeField(field) });
          } else {
            values[field] = await input({ message: humanizeField(field) });
          }
        }
        return values;
      },
    })) {
      emit.event(event);
      if (event.logPath) {
        runLogPath = event.logPath;
      }

      if (event.type === "needs-input") {
        await updateSourceState(resolution.source, {
          lastRunAt: new Date().toISOString(),
          lastRunOutcome: CliOutcomeStatus.NEEDS_INPUT,
          lastError: event.message ?? "Input required.",
        });
        emit.event({
          type: "outcome",
          status: CliOutcomeStatus.NEEDS_INPUT,
          source: resolution.source,
        });
        if (!options.json) {
          emit.info(
            `${displaySource(source, sourceLabels)} needs additional input before it can connect.`,
          );
          emit.info(
            `Next: run \`vana connect ${source}\` without \`--no-input\`.`,
          );
        }
        return 1;
      }

      if (event.type === "runtime-error") {
        await updateSourceState(resolution.source, {
          lastRunAt: new Date().toISOString(),
          lastRunOutcome: CliOutcomeStatus.RUNTIME_ERROR,
          lastError: event.message ?? "Connector run failed.",
        });
        emit.info(event.message ?? "Connector run failed.");
        emit.event({
          type: "outcome",
          status: CliOutcomeStatus.RUNTIME_ERROR,
          source: resolution.source,
        });
        if (event.logPath) {
          emit.info(`Run log: ${event.logPath}`);
        }
        return 1;
      }

      if (event.type === "legacy-auth") {
        await updateSourceState(resolution.source, {
          lastRunAt: new Date().toISOString(),
          lastRunOutcome: CliOutcomeStatus.LEGACY_AUTH,
          lastError: event.message ?? "Legacy authentication is required.",
          dataState: "none",
        });
        emit.info(
          event.message ??
            "This connector requires legacy headed authentication that is not available in batch mode.",
        );
        emit.info(
          `Next: establish a reusable ${displaySource(
            source,
            sourceLabels,
          )} session manually, or migrate this connector to requestInput.`,
        );
        if (event.logPath) {
          emit.info(`Run log: ${event.logPath}`);
        }
        emit.event({
          type: "outcome",
          status: CliOutcomeStatus.LEGACY_AUTH,
          source: resolution.source,
        });
        return 1;
      }

      if (event.type === "collection-complete" && event.resultPath) {
        collectedResult = true;
        resultPath = event.resultPath;
        const ingestEvents = await ingestResult(
          resolution.source,
          resultPath,
          target,
        );
        for (const ingestEvent of ingestEvents) {
          emit.event(ingestEvent);
        }

        const ingestCompleted = ingestEvents.some(
          (ingestEvent) => ingestEvent.type === "ingest-complete",
        );
        finalStatus = ingestCompleted
          ? CliOutcomeStatus.CONNECTED_AND_INGESTED
          : CliOutcomeStatus.CONNECTED_LOCAL_ONLY;
      }
    }

    if (!collectedResult) {
      await updateSourceState(resolution.source, {
        connectorInstalled: true,
        sessionPresent: fs.existsSync(profilePath),
        lastRunAt: new Date().toISOString(),
        lastRunOutcome: CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR,
        dataState: "none",
        lastError: "Connector run ended without a result.",
      });
      emit.event({
        type: "outcome",
        status: CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR,
        source: resolution.source,
        reason: "Connector run ended without a result.",
      });
      if (runLogPath) {
        emit.info(`Run log: ${runLogPath}`);
      }
      return 1;
    }

    const dataState =
      finalStatus === CliOutcomeStatus.CONNECTED_AND_INGESTED
        ? "ingested_personal_server"
        : "collected_local";

    await updateSourceState(resolution.source, {
      connectorInstalled: true,
      sessionPresent: true,
      lastRunAt: new Date().toISOString(),
      lastRunOutcome: finalStatus,
      dataState,
      lastError: null,
    });

    if (finalStatus === CliOutcomeStatus.CONNECTED_AND_INGESTED) {
      emit.info(`Connected ${displaySource(source, sourceLabels)}.`);
      emit.info(
        `Collected your ${displaySource(source, sourceLabels)} data and synced it to your Personal Server.`,
      );
    } else {
      if (target.state !== "available") {
        emit.info(
          `No Personal Server is available right now, so your ${displaySource(
            source,
            sourceLabels,
          )} data was saved locally.`,
        );
      }
      emit.info(`Connected ${displaySource(source, sourceLabels)}.`);
      emit.info(
        `Collected your ${displaySource(source, sourceLabels)} data and saved it locally.`,
      );
      emit.info(`Local result: ${resultPath}`);
    }

    if (runLogPath) {
      emit.info(`Run log: ${runLogPath}`);
    } else if (fetchLogPath) {
      emit.info(`Fetch log: ${fetchLogPath}`);
    } else if (setupLogPath) {
      emit.info(`Setup log: ${setupLogPath}`);
    }

    emit.info(
      "Next: run `vana status` to inspect your current connection state.",
    );
    emit.event({
      type: "outcome",
      status: finalStatus,
      source: resolution.source,
      resultPath,
    });
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error.";
    emit.info(message);
    emit.event({
      type: "outcome",
      status: CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR,
      source,
      reason: message,
    });
    if (runLogPath) {
      emit.info(`Run log: ${runLogPath}`);
    } else if (fetchLogPath) {
      emit.info(`Fetch log: ${fetchLogPath}`);
    } else if (setupLogPath) {
      emit.info(`Setup log: ${setupLogPath}`);
    }
    return 1;
  }
}

async function runList(options: GlobalOptions): Promise<number> {
  const sources = await loadRegistrySources();
  const installedSourceIds = new Set(
    (await listInstalledConnectorFiles()).map((source) => source.source),
  );
  const enrichedSources = sources.map((source) => ({
    ...source,
    installed: installedSourceIds.has(source.id),
  }));
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ sources: enrichedSources })}\n`);
    return 0;
  }

  const emit = createEmitter(options);
  for (const source of enrichedSources) {
    const description = source.description ? ` - ${source.description}` : "";
    const installed = source.installed ? " [installed]" : "";
    emit.info(`${source.name}${installed}${description}`);
  }
  return 0;
}

async function runStatus(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);
  const runtime = new ManagedPlaywrightRuntime();
  const personalServer = await detectPersonalServerTarget();
  const state = await readCliState();
  const registrySources = await loadRegistrySources();
  const sourceLabels = createSourceLabelMap(registrySources);
  const sourceMetadata = createSourceMetadataMap(registrySources);
  const sources = await gatherSourceStatuses(state.sources, sourceMetadata);

  const status: CliStatus = {
    runtime: runtime.state,
    runtimePath: runtime.state === "installed" ? runtime.runnerDir : null,
    personalServer: personalServer.state,
    personalServerUrl: personalServer.url,
    sources,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(status)}\n`);
    return 0;
  }

  emit.info("Vana Connect status");
  emit.info("");
  emit.info(`Runtime: ${status.runtime}`);
  emit.info(`Personal Server: ${status.personalServer}`);
  emit.info("");
  for (const source of status.sources) {
    emit.info(formatSourceStatus(source, sourceLabels));
    const details = formatSourceStatusDetail(source);
    if (details) {
      emit.info(`  ${details}`);
    }
  }
  return 0;
}

async function runSetup(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);
  const runtime = new ManagedPlaywrightRuntime();

  if (runtime.state === "installed") {
    emit.info("Vana Connect runtime is already installed.");
    emit.event({ type: "setup-check", runtime: runtime.state });
    return 0;
  }

  try {
    const result = await runtime.ensureInstalled(Boolean(options.yes));
    emit.info("Runtime ready.");
    if (result.logPath) {
      emit.info(`Setup log: ${result.logPath}`);
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

function createEmitter(options: GlobalOptions) {
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
  };
}

function displaySource(source: string, labels: SourceLabelMap = {}): string {
  return labels[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

function humanizeField(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase());
}

async function gatherSourceStatuses(
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
    .sort((left, right) => left.localeCompare(right))
    .map((source) => {
      const stored = storedSources[source] ?? {};
      const installed = installedFiles.some((file) => file.source === source);
      const details = metadata[source];
      return {
        source,
        name: details?.name,
        company: details?.company,
        description: details?.description,
        installed,
        sessionPresent: stored.sessionPresent ?? false,
        lastRunAt: stored.lastRunAt ?? null,
        lastRunOutcome: stored.lastRunOutcome ?? null,
        dataState:
          stored.dataState === "ingested_personal_server"
            ? "ingested_personal_server"
            : stored.dataState === "collected_local"
              ? "collected_local"
              : "none",
        lastError: stored.lastError ?? null,
      };
    });
}

async function listInstalledConnectorFiles(): Promise<
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

function formatSourceStatus(
  source: SourceStatus,
  labels: SourceLabelMap = {},
): string {
  if (!source.installed) {
    return `${displaySource(source.source, labels)}: not connected`;
  }

  if (!source.lastRunOutcome) {
    return `${displaySource(source.source, labels)}: installed`;
  }

  if (source.lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT) {
    return `${displaySource(source.source, labels)}: needs input`;
  }

  if (source.lastRunOutcome === CliOutcomeStatus.RUNTIME_ERROR) {
    return `${displaySource(source.source, labels)}: error`;
  }

  if (source.lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH) {
    return `${displaySource(source.source, labels)}: legacy auth required`;
  }

  if (source.dataState === "ingested_personal_server") {
    return `${displaySource(source.source, labels)}: connected, synced`;
  }

  if (source.dataState === "collected_local") {
    return `${displaySource(source.source, labels)}: connected, local only`;
  }

  return `${displaySource(source.source, labels)}: connected`;
}

function formatSourceStatusDetail(source: SourceStatus): string | null {
  if (source.lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT) {
    return source.lastError
      ? `${source.lastError}. Run \`vana connect ${source.source}\` interactively.`
      : `Run \`vana connect ${source.source}\` interactively.`;
  }

  if (source.lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH) {
    return "This source still uses legacy headed auth and cannot complete in batch mode.";
  }

  if (source.lastRunOutcome === CliOutcomeStatus.RUNTIME_ERROR) {
    return source.lastError ?? "The last connector run failed.";
  }

  if (!source.lastRunOutcome && source.installed) {
    return `Run \`vana connect ${source.source}\` to collect data.`;
  }

  return null;
}

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

function extractGlobalOptions(argv: string[]): GlobalOptions {
  return {
    json: argv.includes("--json"),
    noInput: argv.includes("--no-input"),
    yes: argv.includes("--yes"),
    quiet: argv.includes("--quiet"),
  };
}

function createSourceLabelMap(
  sources: Array<{ id: string; name: string }>,
): SourceLabelMap {
  return Object.fromEntries(sources.map((source) => [source.id, source.name]));
}

function createSourceMetadataMap(
  sources: Array<{
    id: string;
    name: string;
    company?: string;
    description?: string;
  }>,
): SourceMetadataMap {
  return Object.fromEntries(
    sources.map((source) => [
      source.id,
      {
        name: source.name,
        company: source.company,
        description: source.description,
      },
    ]),
  );
}

async function loadRegistrySources() {
  try {
    return (
      (await listAvailableSources(findDataConnectorsDir() ?? undefined)) ?? []
    );
  } catch {
    return [];
  }
}
