import os from "node:os";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { confirm, input, password, select } from "@inquirer/prompts";
import { Command } from "commander";

import { createHumanRenderer } from "./render/index.js";
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
import type { AvailableSource } from "../connectors/registry.js";
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
    authMode?: "automated" | "interactive" | "legacy";
  };
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
  bullet(message: string): void;
  sourceTitle(
    name: string,
    badges?: Array<{ text: string; tone?: RenderTone }>,
  ): void;
  badge(text: string, tone?: RenderTone): string;
  code(text: string): string;
}

type RenderTone = "accent" | "success" | "warning" | "error" | "muted" | "info";

export async function runCli(argv = process.argv): Promise<number> {
  const normalizedArgv = normalizeArgv(argv);
  const parsedOptions = extractGlobalOptions(normalizedArgv);
  const program = new Command();
  program.name("vana").description("Vana Connect CLI");

  program
    .command("connect [source]")
    .option("--json", "Output machine-readable JSON")
    .option("--no-input", "Fail instead of prompting for input")
    .option("--yes", "Approve safe setup prompts automatically")
    .option("--quiet", "Reduce non-essential output")
    .action(async (source?: string) => {
      process.exitCode = source
        ? await runConnect(source, parsedOptions)
        : await runConnectEntry(parsedOptions);
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

  const data = program.command("data").description("Inspect collected data");

  data
    .command("list")
    .description("List locally available collected datasets")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      process.exitCode = await runDataList(parsedOptions);
    });

  data
    .command("show <source>")
    .description("Show a collected dataset")
    .option("--json", "Output machine-readable JSON")
    .action(async (source: string) => {
      process.exitCode = await runDataShow(source, parsedOptions);
    });

  data
    .command("path <source>")
    .description("Print the local path for a collected dataset")
    .option("--json", "Output machine-readable JSON")
    .action(async (source: string) => {
      process.exitCode = await runDataPath(source, parsedOptions);
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
  const displayName = displaySource(source, sourceLabels);
  let setupLogPath: string | undefined;
  let fetchLogPath: string | undefined;
  let runLogPath: string | undefined;

  try {
    emit.title(`Connect ${displayName}`);
    emit.blank();
    emit.section("Preparing");
    emit.info(`Finding a connector for ${displayName}...`);
    const target = await detectPersonalServerTarget();

    if (runtime.state !== "installed") {
      emit.info(
        `Vana Connect needs a local browser runtime before it can connect ${displayName}.`,
      );
      emit.blank();
      emit.section("Runtime setup");
      emit.bullet("Install the local browser runtime.");
      emit.bullet("Install a Chromium browser engine.");
      emit.bullet("Create local runtime files under `~/.dataconnect/`.");
      emit.detail(
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
          message: "Install the local runtime now?",
          default: true,
        });
        if (!shouldContinue) {
          emit.info("Cancelled. Runtime setup was not started.");
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
      emit.success("Runtime ready.");
      if (installResult.logPath) {
        emit.detail(`Setup log: ${formatDisplayPath(installResult.logPath)}`);
      }
    } else {
      emit.event({
        type: "setup-check",
        runtime: runtime.state,
      });
    }

    let fetched: Awaited<
      ReturnType<ManagedPlaywrightRuntime["fetchConnector"]>
    >;
    try {
      fetched = await runtime.fetchConnector(source);
    } catch (error) {
      const rawMessage =
        error instanceof Error
          ? error.message
          : `No connector is available for ${displayName} right now.`;
      const message = formatHumanSourceMessage(rawMessage, source, displayName);
      await updateSourceState(source, {
        connectorInstalled: false,
        lastRunAt: new Date().toISOString(),
        lastRunOutcome: CliOutcomeStatus.CONNECTOR_UNAVAILABLE,
        dataState: "none",
        lastError: message,
        lastResultPath: null,
      });
      emit.info(message);
      if (!options.json) {
        emit.blank();
        emit.section("Next");
        emit.bullet("Browse available sources with `vana sources`.");
        emit.bullet(
          `Then connect one with ${emit.code("vana connect <source>")}.`,
        );
      }
      emit.event({
        type: "outcome",
        status: CliOutcomeStatus.CONNECTOR_UNAVAILABLE,
        source,
        reason: message,
      });
      return 1;
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
    emit.info("Connector ready.");
    if (sourceDetails?.description) {
      emit.info(sourceDetails.description);
    }

    const profilePath = path.join(
      getBrowserProfilesDir(),
      `${path.basename(resolution.connectorPath, path.extname(resolution.connectorPath))}`,
    );
    if (fs.existsSync(profilePath)) {
      emit.detail(
        `Found an existing ${displayName} session. Reusing it if it is still valid...`,
      );
    }

    await updateSourceState(resolution.source, {
      connectorInstalled: true,
      sessionPresent: fs.existsSync(profilePath),
      lastError: null,
    });

    emit.blank();
    emit.section("Connecting");
    emit.info(`Connecting to ${displayName}...`);
    emit.info("Collecting your data...");

    let finalStatus: CliOutcome["status"] =
      CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR;
    let finalDataState: SourceStatus["dataState"] = "none";
    let ingestFailureMessage: string | null = null;
    let resultPath = getLastResultPath();
    let collectedResult = false;

    for await (const event of runtime.runConnector({
      connectorPath: resolution.connectorPath,
      source: resolution.source,
      noInput: options.noInput,
      onNeedInput: async (needInput) => {
        emit.blank();
        emit.section("Continue in this terminal");
        emit.info(
          `Vana Connect will keep the ${displayName} session local to this machine.`,
        );
        emit.detail("The details you enter here stay local.");
        emit.blank();
        emit.info(
          needInput.message ??
            `${displayName} needs additional details to continue.`,
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
            `${displayName} needs additional input before it can connect.`,
          );
          emit.blank();
          emit.section("Next");
          emit.bullet(
            `Run ${emit.code(`vana connect ${source}`)} without ${emit.code("--no-input")}.`,
          );
        }
        return 1;
      }

      if (event.type === "progress-update") {
        const progressLine = formatProgressUpdate(event);
        if (progressLine) {
          emit.detail(progressLine);
        }
        continue;
      }

      if (event.type === "status-update") {
        if (event.message && shouldRenderStatusUpdate(event.message)) {
          emit.detail(event.message);
        }
        continue;
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
          emit.info(`Run log: ${formatDisplayPath(event.logPath)}`);
        }
        return 1;
      }

      if (event.type === "headed-required") {
        emit.blank();
        emit.section("Continue in your browser");
        if (event.message) {
          emit.info(event.message);
        }
        if (event.url) {
          emit.detail(`Opening ${displayName} in a local browser session...`);
        }
        continue;
      }

      if (event.type === "legacy-auth") {
        await updateSourceState(resolution.source, {
          lastRunAt: new Date().toISOString(),
          lastRunOutcome: CliOutcomeStatus.LEGACY_AUTH,
          lastError: event.message ?? "Legacy authentication is required.",
          dataState: "none",
          lastResultPath: null,
        });
        emit.info(
          event.message ??
            "This connector needs a manual browser step that is not available in non-interactive mode.",
        );
        emit.blank();
        emit.section("Next");
        emit.bullet(
          `Run ${emit.code(`vana connect ${source}`)} without ${emit.code("--no-input")}.`,
        );
        if (event.logPath) {
          emit.detail(`Run log: ${formatDisplayPath(event.logPath)}`);
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
        const ingestFailedEvent = ingestEvents.find(
          (ingestEvent) => ingestEvent.type === "ingest-failed",
        );
        if (ingestCompleted) {
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
        lastResultPath: null,
      });
      emit.event({
        type: "outcome",
        status: CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR,
        source: resolution.source,
        reason: "Connector run ended without a result.",
      });
      if (runLogPath) {
        emit.info(`Run log: ${formatDisplayPath(runLogPath)}`);
      }
      return 1;
    }

    await updateSourceState(resolution.source, {
      connectorInstalled: true,
      sessionPresent: true,
      lastRunAt: new Date().toISOString(),
      lastRunOutcome: finalStatus,
      dataState: finalDataState,
      lastError: ingestFailureMessage,
      lastResultPath: resultPath,
    });

    const resultSummary = await readResultSummary(resultPath);
    const connectCommand = emit.code("vana status");
    const dataCommand = emit.code(`vana data show ${source}`);
    const successSummary =
      finalStatus === CliOutcomeStatus.CONNECTED_AND_INGESTED
        ? `Collected your ${displayName} data and synced it to your Personal Server.`
        : `Collected your ${displayName} data and saved it locally.`;

    emit.success(`Connected ${displayName}.`);
    emit.detail(successSummary);

    emit.blank();
    if (resultSummary) {
      emit.section("Collected");
      for (const line of resultSummary.lines) {
        emit.bullet(line);
      }
    }

    emit.blank();
    if (finalStatus === CliOutcomeStatus.CONNECTED_AND_INGESTED) {
      emit.section("Synced");
      emit.bullet("Your data is now available in your Personal Server.");
    } else {
      emit.section("Saved locally");
      emit.bullet(formatDisplayPath(resultPath));
      emit.detail("Saved browser session available for faster reconnects.");
      if (
        finalStatus === CliOutcomeStatus.INGEST_FAILED &&
        ingestFailureMessage
      ) {
        emit.detail(`Personal Server sync failed: ${ingestFailureMessage}`);
      } else if (target.state !== "available") {
        emit.detail(
          "No Personal Server is available right now, so this run stayed local.",
        );
      }
    }

    if (runLogPath) {
      emit.detail(`Run log: ${formatDisplayPath(runLogPath)}`);
    } else if (fetchLogPath) {
      emit.detail(`Fetch log: ${formatDisplayPath(fetchLogPath)}`);
    } else if (setupLogPath) {
      emit.detail(`Setup log: ${formatDisplayPath(setupLogPath)}`);
    }

    emit.blank();
    emit.section("Next");
    emit.bullet(`Run ${connectCommand}`);
    emit.bullet(`Or inspect the data with ${dataCommand}`);
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
      emit.detail(`Run log: ${formatDisplayPath(runLogPath)}`);
    } else if (fetchLogPath) {
      emit.detail(`Fetch log: ${formatDisplayPath(fetchLogPath)}`);
    } else if (setupLogPath) {
      emit.detail(`Setup log: ${formatDisplayPath(setupLogPath)}`);
    }
    return 1;
  }
}

async function runConnectEntry(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);
  const sources = await loadRegistrySources();

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        error: "source_required",
        message:
          "Specify a source. Run `vana sources` to see available options.",
      })}\n`,
    );
    return 1;
  }

  if (options.noInput) {
    emit.info("Specify a source. Run `vana sources` to see available options.");
    return 1;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emit.info("Specify a source. Run `vana sources` to see available options.");
    return 1;
  }

  if (sources.length === 0) {
    emit.info("No sources are available right now.");
    emit.info("Run `vana sources` to verify the local connector registry.");
    return 1;
  }

  emit.title("Connect data");
  emit.blank();
  const readyNowCount = sources.filter(
    (source) => source.authMode !== "legacy",
  ).length;
  const manualCount = sources.length - readyNowCount;
  if (readyNowCount > 0 || manualCount > 0) {
    const parts = [];
    if (readyNowCount > 0) {
      parts.push(
        `${readyNowCount} ready ${readyNowCount === 1 ? "source" : "sources"}`,
      );
    }
    if (manualCount > 0) {
      parts.push(
        `${manualCount} with manual ${manualCount === 1 ? "step" : "steps"}`,
      );
    }
    emit.detail(parts.join(" • "));
  }
  emit.info("Choose a source to connect:");
  emit.detail(
    `Or jump straight in with ${emit.code("vana connect <source>")}.`,
  );
  let source: string;
  try {
    source = await select({
      message: "Source",
      pageSize: 8,
      choices: sources.map((item) => ({
        name: `${item.name}${formatAuthModeBadge(item.authMode, emit)}`,
        description: item.description,
        short: item.name,
        value: item.id,
      })),
    });
  } catch (error) {
    if (isPromptCancelled(error)) {
      emit.info("Cancelled. No source was connected.");
      emit.detail(`Browse sources any time with ${emit.code("vana sources")}.`);
      return 1;
    }
    throw error;
  }
  emit.blank();
  return runConnect(source, options);
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
  emit.title(
    enrichedSources.length > 0
      ? `Available sources (${enrichedSources.length})`
      : "Available sources",
  );
  emit.blank();
  const groups = [
    {
      title: "Ready now",
      items: enrichedSources.filter((source) => source.authMode !== "legacy"),
    },
    {
      title: "Manual steps",
      items: enrichedSources.filter((source) => source.authMode === "legacy"),
    },
  ].filter((group) => group.items.length > 0);

  groups.forEach((group, index) => {
    if (index > 0) {
      emit.blank();
    }
    emit.section(formatCountLabel(group.title, group.items.length));
    for (const source of group.items) {
      const badges: Array<{ text: string; tone?: RenderTone }> = [];
      if (source.authMode === "interactive") {
        badges.push({ text: "interactive", tone: "info" });
      } else if (source.authMode === "legacy") {
        badges.push({ text: "legacy", tone: "warning" });
      }
      if (source.installed) {
        badges.push({ text: "installed", tone: "success" });
      }
      emit.sourceTitle(source.name, badges);
      if (source.description) {
        emit.detail(source.description);
      }
    }
  });
  if (groups.length === 0) {
    emit.info("No sources are available right now.");
  } else {
    emit.blank();
    emit.section("Next");
    emit.bullet(`Browse the guided picker with ${emit.code("vana connect")}.`);
    emit.bullet(
      `Or connect one directly with ${emit.code("vana connect <source>")}.`,
    );
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
    runtimePath: runtime.runtimePath,
    personalServer: personalServer.state,
    personalServerUrl: personalServer.url,
    sources,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(status)}\n`);
    return 0;
  }

  emit.title("Vana Connect status");
  emit.blank();
  emit.section("Environment");
  emit.keyValue("Runtime", status.runtime, toneForRuntime(status.runtime));
  if (status.runtimePath) {
    emit.detail(formatDisplayPath(status.runtimePath));
  }
  emit.keyValue(
    "Personal Server",
    status.personalServer,
    status.personalServer === "available" ? "success" : "muted",
  );
  if (status.personalServerUrl) {
    emit.detail(status.personalServerUrl);
  }
  const sourceGroups = [
    {
      title: "Needs attention",
      items: status.sources.filter((source) => rankSourceStatus(source) <= 4),
    },
    {
      title: "Connected",
      items: status.sources.filter(
        (source) =>
          source.dataState === "ingested_personal_server" ||
          source.dataState === "collected_local" ||
          source.dataState === "ingest_failed",
      ),
    },
    {
      title: "Installed",
      items: status.sources.filter(
        (source) =>
          rankSourceStatus(source) > 4 &&
          source.dataState === "none" &&
          source.installed,
      ),
    },
  ].filter((group) => group.items.length > 0);
  if (sourceGroups.length > 0) {
    emit.blank();
  }
  sourceGroups.forEach((group, index) => {
    if (index > 0) {
      emit.blank();
    }
    emit.section(formatCountLabel(group.title, group.items.length));
    for (const source of group.items) {
      const status = getSourceStatusPresentation(source);
      const badges: Array<{ text: string; tone?: RenderTone }> = [];
      if (source.authMode === "interactive") {
        badges.push({ text: "interactive", tone: "info" });
      } else if (source.authMode === "legacy") {
        badges.push({ text: "legacy", tone: "warning" });
      }
      badges.push({ text: status.label, tone: status.tone });
      emit.sourceTitle(displaySource(source.source, sourceLabels), badges);
      const details = formatSourceStatusDetails(source);
      for (const detail of details) {
        emit.detail(detail);
      }
    }
  });
  const nextSteps = buildStatusNextSteps(status.sources, sourceLabels);
  if (nextSteps.length > 0) {
    emit.blank();
    emit.section("Next");
    for (const step of nextSteps) {
      emit.bullet(step);
    }
  }
  return 0;
}

async function runSetup(options: GlobalOptions): Promise<number> {
  const emit = createEmitter(options);
  const runtime = new ManagedPlaywrightRuntime();

  emit.title("Vana Connect setup");
  emit.blank();
  emit.section("Runtime");

  if (runtime.state === "installed") {
    emit.info("The local runtime is already installed.");
    if (runtime.runtimePath) {
      emit.detail(formatDisplayPath(runtime.runtimePath));
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
  const state = await readCliState();
  const sources = await gatherSourceStatuses(
    state.sources,
    createSourceMetadataMap(await loadRegistrySources()),
  );
  const datasetRecords = await Promise.all(
    sources
      .filter((source) => Boolean(source.lastResultPath))
      .map(async (source) => ({
        source: source.source,
        name: source.name,
        authMode: source.authMode ?? null,
        dataState: source.dataState,
        lastRunAt: source.lastRunAt ?? null,
        path: source.lastResultPath ?? null,
        summary: source.lastResultPath
          ? await readResultSummary(source.lastResultPath)
          : null,
      })),
  );
  datasetRecords.sort(compareDatasetOrder);

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ datasets: datasetRecords })}\n`);
    return 0;
  }

  const emit = createEmitter(options);
  if (datasetRecords.length === 0) {
    emit.title("Collected data");
    emit.blank();
    emit.info("No local datasets collected yet.");
    emit.info("Run `vana connect <source>` to collect data.");
    return 0;
  }

  emit.title(
    datasetRecords.length > 0
      ? `Collected data (${datasetRecords.length})`
      : "Collected data",
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
    if (dataset.lastRunAt) {
      emit.keyValue("Updated", formatTimestamp(dataset.lastRunAt), "muted");
    }
    if (dataset.path) {
      emit.keyValue("Path", formatDisplayPath(dataset.path), "muted");
    }
  });
  emit.blank();
  emit.section("Next");
  emit.bullet(`Inspect one with ${emit.code("vana data show <source>")}.`);
  emit.bullet(`Print a path with ${emit.code("vana data path <source>")}.`);
  return 0;
}

async function runDataShow(
  source: string,
  options: GlobalOptions,
): Promise<number> {
  const sourceLabels = createSourceLabelMap(await loadRegistrySources());
  const state = await readCliState();
  const record = state.sources[source];
  const resultPath = record?.lastResultPath;
  const emit = createEmitter(options);

  if (!resultPath) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({
          error: "dataset_not_found",
          source,
          message: `No collected dataset found for ${displaySource(source, sourceLabels)}. Run \`vana connect ${source}\` first.`,
        })}\n`,
      );
    } else {
      emit.info(
        `No collected dataset found for ${displaySource(source, sourceLabels)}. Run \`vana connect ${source}\` first.`,
      );
    }
    return 1;
  }

  try {
    const raw = await fsp.readFile(resultPath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const summary = summarizeResultData(data);
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({
          source,
          name: displaySource(source, sourceLabels),
          path: resultPath,
          summary,
          lastRunAt: record?.lastRunAt ?? null,
          dataState: record?.dataState ?? null,
          data,
        })}\n`,
      );
      return 0;
    }

    emit.title(`${displaySource(source, sourceLabels)} data`);
    emit.blank();
    if (summary) {
      emit.section("Summary");
      for (const line of summary.lines) {
        emit.bullet(line);
      }
      emit.blank();
    }
    emit.keyValue("Path", formatDisplayPath(resultPath), "muted");
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
    emit.section("Next");
    emit.bullet(
      `Print the path with ${emit.code(`vana data path ${source}`)}.`,
    );
    emit.bullet(`Inspect other datasets with ${emit.code("vana data list")}.`);
    emit.bullet(`Check overall status with ${emit.code("vana status")}.`);
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Could not read ${resultPath}.`;
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({ error: "dataset_read_failed", source, path: resultPath, message })}\n`,
      );
    } else {
      emit.info(message);
    }
    return 1;
  }
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
          message: `No collected dataset found for ${displaySource(source, sourceLabels)}.`,
        })}\n`,
      );
    } else {
      createEmitter(options).info(
        `No collected dataset found for ${displaySource(source, sourceLabels)}.`,
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
      })}\n`,
    );
  } else {
    process.stdout.write(`${formatDisplayPath(resultPath)}\n`);
  }
  return 0;
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

function displaySource(source: string, labels: SourceLabelMap = {}): string {
  return labels[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

function formatCountLabel(label: string, count: number): string {
  return `${label} (${count})`;
}

function humanizeField(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase());
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
      return {
        source,
        name: details?.name,
        company: details?.company,
        description: details?.description,
        authMode:
          details?.authMode ?? inferInstalledAuthMode(installedFiles, source),
        installed,
        sessionPresent: stored.sessionPresent ?? false,
        lastRunAt: stored.lastRunAt ?? null,
        lastRunOutcome: stored.lastRunOutcome ?? null,
        dataState,
        lastError: stored.lastError ?? null,
        lastResultPath: stored.lastResultPath ?? null,
      };
    })
    .sort(compareSourceStatusOrder);
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

function formatSourceStatusDetails(source: SourceStatus): string[] {
  const details: string[] = [];
  const displayName = source.name ?? displaySource(source.source);

  if (source.lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT) {
    details.push(
      source.lastError
        ? `${source.lastError}. Run \`vana connect ${source.source}\` interactively.`
        : `Run \`vana connect ${source.source}\` interactively.`,
    );
  }

  if (source.lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH) {
    details.push(
      `Run \`vana connect ${source.source}\` without \`--no-input\` to complete the manual browser step.`,
    );
  }

  if (source.lastRunOutcome === CliOutcomeStatus.RUNTIME_ERROR) {
    details.push(
      source.lastError
        ? formatHumanSourceMessage(source.lastError, source.source, displayName)
        : "The last connector run failed.",
    );
  }

  if (source.lastRunOutcome === CliOutcomeStatus.CONNECTOR_UNAVAILABLE) {
    details.push(
      source.lastError
        ? formatHumanSourceMessage(source.lastError, source.source, displayName)
        : "No connector is available for this source.",
    );
  }

  if (!source.lastRunOutcome && source.installed) {
    details.push(`Run \`vana connect ${source.source}\` to collect data.`);
  }

  if (
    source.lastRunOutcome === CliOutcomeStatus.CONNECTED_LOCAL_ONLY &&
    source.lastResultPath
  ) {
    details.push(
      `Inspect the latest local dataset with \`vana data show ${source.source}\`.`,
    );
  }

  if (
    source.sessionPresent &&
    (source.lastRunOutcome === CliOutcomeStatus.CONNECTED_LOCAL_ONLY ||
      source.lastRunOutcome === CliOutcomeStatus.CONNECTED_AND_INGESTED ||
      source.lastRunOutcome === CliOutcomeStatus.INGEST_FAILED)
  ) {
    details.push("Saved browser session available for faster reconnects.");
  }

  if (source.lastRunOutcome === CliOutcomeStatus.CONNECTED_AND_INGESTED) {
    details.push(
      `Inspect the latest local dataset with \`vana data show ${source.source}\` or use your Personal Server copy.`,
    );
  }

  if (source.lastRunOutcome === CliOutcomeStatus.INGEST_FAILED) {
    details.push(
      source.lastError
        ? `${source.lastError} Inspect the local dataset with \`vana data show ${source.source}\`.`
        : `Personal Server sync failed. Inspect the local dataset with \`vana data show ${source.source}\`.`,
    );
  }

  if (source.lastRunAt) {
    details.push(`Updated: ${formatTimestamp(source.lastRunAt)}`);
  }

  if (source.lastResultPath && source.dataState !== "none") {
    details.push(formatDisplayPath(source.lastResultPath));
  }

  return details;
}

function buildStatusNextSteps(
  sources: SourceStatus[],
  sourceLabels: SourceLabelMap = {},
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

  if (highestPriority?.lastRunOutcome === CliOutcomeStatus.NEEDS_INPUT) {
    nextSteps.push(
      `Continue ${highestPriorityLabel} with \`vana connect ${highestPriority.source}\`.`,
    );
  } else if (highestPriority?.lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH) {
    nextSteps.push(
      `Complete the manual browser step for ${highestPriorityLabel} with \`vana connect ${highestPriority.source}\`.`,
    );
  } else if (
    highestPriority?.lastRunOutcome === CliOutcomeStatus.CONNECTOR_UNAVAILABLE
  ) {
    nextSteps.push("Browse available sources with `vana sources`.");
  } else if (
    highestPriority &&
    (highestPriority.dataState === "collected_local" ||
      highestPriority.dataState === "ingested_personal_server" ||
      highestPriority.dataState === "ingest_failed")
  ) {
    if (connectedSources.length > 1) {
      nextSteps.push("Review your collected data with `vana data list`.");
    } else {
      nextSteps.push(
        `Inspect the latest dataset with \`vana data show ${highestPriority.source}\`.`,
      );
    }
  }

  if (
    sources.some((source) => source.installed || source.lastRunOutcome) &&
    (!needsAttention || connectedSources.length === 0)
  ) {
    nextSteps.push("Connect another source with `vana sources`.");
  }

  return [...new Set(nextSteps)];
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

function formatDisplayPath(filePath: string): string {
  const homeDir = os.homedir();
  if (filePath === homeDir) {
    return "~";
  }

  if (filePath.startsWith(`${homeDir}${path.sep}`)) {
    return `~${filePath.slice(homeDir.length)}`;
  }

  return filePath;
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

function formatAuthModeBadge(
  authMode: "automated" | "interactive" | "legacy" | undefined,
  emit?: Pick<Emitter, "badge">,
): string {
  if (authMode === "legacy") {
    return ` ${emit ? emit.badge("legacy", "warning") : "[legacy]"}`;
  }

  if (authMode === "interactive") {
    return ` ${emit ? emit.badge("interactive", "info") : "[interactive]"}`;
  }

  return "";
}

function getSourceStatusPresentation(source: SourceStatus): {
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
    return { label: "synced", tone: "success" };
  }

  if (source.dataState === "collected_local") {
    return { label: "local", tone: "muted" };
  }

  if (source.dataState === "ingest_failed") {
    return { label: "sync failed", tone: "warning" };
  }

  return { label: "connected", tone: "success" };
}

function toneForRuntime(runtime: CliStatus["runtime"]): RenderTone {
  if (runtime === "installed") {
    return "success";
  }
  if (runtime === "missing") {
    return "warning";
  }
  return "muted";
}

function formatProgressUpdate(event: {
  message?: string;
  count?: number;
  phase?: unknown;
}): string | null {
  const phaseLabel =
    event.phase &&
    typeof event.phase === "object" &&
    "label" in event.phase &&
    typeof (event.phase as { label?: unknown }).label === "string"
      ? (event.phase as { label: string }).label
      : null;
  const phaseStep =
    event.phase &&
    typeof event.phase === "object" &&
    "step" in event.phase &&
    typeof (event.phase as { step?: unknown }).step === "number"
      ? (event.phase as { step: number }).step
      : null;
  const phaseTotal =
    event.phase &&
    typeof event.phase === "object" &&
    "total" in event.phase &&
    typeof (event.phase as { total?: unknown }).total === "number"
      ? (event.phase as { total: number }).total
      : null;
  const phasePrefix =
    phaseLabel && phaseStep != null && phaseTotal != null
      ? `${phaseLabel} (${phaseStep}/${phaseTotal})`
      : phaseLabel;

  if (phasePrefix && event.message) {
    return `${phasePrefix}: ${event.message}`;
  }
  if (event.message) {
    return event.message;
  }
  if (phasePrefix && typeof event.count === "number") {
    return `${phasePrefix}: ${event.count}`;
  }
  return null;
}

function shouldRenderStatusUpdate(message: string): boolean {
  return !/^complete\b/i.test(message.trim());
}

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

async function loadRegistrySources() {
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

function compareSourceStatusOrder(
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

function rankSourceStatus(source: SourceStatus): number {
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

async function readResultSummary(
  resultPath: string,
): Promise<{ lines: string[] } | null> {
  try {
    const raw = await fsp.readFile(resultPath, "utf8");
    return summarizeResultData(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

function summarizeResultData(
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
  }

  if (Array.isArray(data.starred)) {
    lines.push(`Starred: ${data.starred.length}`);
  }

  if (Array.isArray(data.orders)) {
    lines.push(`Orders: ${data.orders.length}`);
  }

  if (Array.isArray(data.playlists)) {
    lines.push(`Playlists: ${data.playlists.length}`);
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

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function compareDatasetOrder(
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

function isPromptCancelled(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ExitPromptError" || error.message.includes("SIGINT"))
  );
}
