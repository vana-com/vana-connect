import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import { Separator, confirm, input, password, select } from "@inquirer/prompts";
import { Command, CommanderError } from "commander";

import {
  createHumanRenderer,
  createProgressHandle,
  formatDisplayPath,
} from "./render/index.js";
import {
  CliOutcomeStatus,
  getCliStatePath,
  getBrowserProfilesDir,
  getConnectorCacheDir,
  getDataConnectHome,
  getLastResultPath,
  getLogsDir,
  readCliState,
  updateSourceState,
} from "../core/index.js";
import type {
  CliChannel,
  CliDoctor,
  CliDoctorCheck,
  CliEvent,
  CliInstallMethod,
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
    .addHelpText(
      "after",
      `
Start here:
  vana connect
  vana status
  vana data list

Automation:
  vana connect github --json --no-input
  vana sources --json | jq '.sources[] | {id, authMode}'

Support:
  vana doctor
  vana logs

Version:
  ${cliVersion} (${getCliChannel(cliVersion)}, ${formatInstallMethodLabel(getCliInstallMethod()).toLowerCase()})
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
    .command("sources")
    .description("List supported sources")
    .option("--json", "Output machine-readable JSON")
    .action(async () => {
      process.exitCode = await runList(parsedOptions);
    });
  sourcesCommand.addHelpText(
    "after",
    `
Examples:
  vana sources
  vana sources --json | jq '.sources'
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

  try {
    await program.parseAsync(normalizedArgv);
  } catch (error) {
    if (
      error instanceof CommanderError &&
      (error.code === "commander.help" ||
        error.code === "commander.helpDisplayed" ||
        error.code === "commander.version")
    ) {
      process.exitCode = error.exitCode;
      return Number(process.exitCode ?? 0);
    }
    throw error;
  }
  return Number(process.exitCode ?? 0);
}

async function runConnect(
  source: string,
  options: GlobalOptions,
): Promise<number> {
  const runtime = new ManagedPlaywrightRuntime();
  const emit = createEmitter(options);
  const progress = createProgressHandle({
    enabled: !options.json && !options.quiet,
  });
  const registrySources = await loadRegistrySources();
  const sourceLabels = createSourceLabelMap(registrySources);
  const displayName = displaySource(source, sourceLabels);
  let setupLogPath: string | undefined;
  let fetchLogPath: string | undefined;
  let runLogPath: string | undefined;
  let terminalExitCode: number | null = null;

  try {
    emit.title(`Connect ${displayName}`);
    emit.blank();
    emit.section("Preparing");
    emit.info(`Finding a connector for ${displayName}...`);
    progress.start(`Preparing ${displayName}...`);
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
      progress.update("Runtime ready.");
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
        lastLogPath: getErrorLogPath(error),
      });
      if (!options.json) {
        progress.fail(`${displayName} is not available yet.`);
        const suggestedSource =
          registrySources.find((item) => item.authMode !== "legacy") ??
          registrySources[0];
        emit.blank();
        emit.section("Not available yet");
        emit.info(message);
        emit.blank();
        emit.section("Next");
        if (suggestedSource) {
          emit.bullet(
            `Try ${suggestedSource.name} with ${emit.code(`vana connect ${suggestedSource.id}`)}.`,
          );
        }
        emit.bullet(
          `Browse available sources with ${emit.code("vana sources")}.`,
        );
        emit.bullet(
          `Or check overall status with ${emit.code("vana status")}.`,
        );
      } else {
        emit.info(message);
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
    progress.update(`Connector ready for ${displayName}.`);
    if (sourceDetails?.description) {
      emit.info(sourceDetails.description);
    }
    const connectTrustMessage = describeConnectTrust(sourceDetails?.authMode);
    if (connectTrustMessage) {
      emit.detail(connectTrustMessage);
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

    if (
      sourceDetails?.authMode === "legacy" &&
      !options.noInput &&
      process.platform === "linux" &&
      !process.env.DISPLAY &&
      !process.env.WAYLAND_DISPLAY
    ) {
      const message =
        "This source needs a manual browser step, but no local display server is available. Run this command in a desktop session or use xvfb-run.";
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
      emit.blank();
      emit.section("Manual step required");
      emit.info(
        `${displayName} still needs a manual browser step on this machine.`,
      );
      emit.detail(message);
      emit.blank();
      emit.section("Next");
      emit.bullet("Run this command in a desktop session.");
      emit.bullet(
        `Or retry with ${emit.code(`xvfb-run -a vana connect ${source}`)}.`,
      );
      if (fetchLogPath) {
        emit.bullet(
          `Inspect the latest run log with ${emit.code(`vana logs ${source}`)}.`,
        );
      }
      emit.bullet(`Or check overall status with ${emit.code("vana status")}.`);
      emit.event({
        type: "outcome",
        status: CliOutcomeStatus.LEGACY_AUTH,
        source: resolution.source,
        reason: "display_server_unavailable",
      });
      progress.fail(`Manual step required for ${displayName}.`);
      return 1;
    }

    await updateSourceState(resolution.source, {
      connectorInstalled: true,
      sessionPresent: fs.existsSync(profilePath),
      lastError: null,
      lastLogPath: fetchLogPath ?? null,
    });

    emit.blank();
    emit.section("Connecting");
    emit.info(`Connecting to ${displayName}...`);
    emit.info("Collecting your data...");
    progress.update(`Collecting ${displayName} data...`);

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
        try {
          for (const field of needInput.fields) {
            if (field.toLowerCase().includes("password")) {
              values[field] = await password({ message: humanizeField(field) });
            } else {
              values[field] = await input({ message: humanizeField(field) });
            }
          }
        } catch (error) {
          if (isPromptCancelled(error)) {
            throw new Error("__vana_prompt_cancelled__");
          }
          throw error;
        }
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
        if (!options.json) {
          progress.stop();
          emit.blank();
          emit.section("Input required");
          emit.info(
            `${displayName} needs additional input before it can connect.`,
          );
          emit.detail(
            `Because ${emit.code("--no-input")} is enabled, Vana stopped before prompting in this terminal.`,
          );
          emit.blank();
          emit.section("Next");
          emit.bullet(
            `Run ${emit.code(`vana connect ${source}`)} without ${emit.code("--no-input")}.`,
          );
          if (event.logPath || fetchLogPath) {
            emit.bullet(
              `Inspect the latest run log with ${emit.code(`vana logs ${source}`)}.`,
            );
          }
          emit.bullet(
            `Or check overall status with ${emit.code("vana status")}.`,
          );
        }
        terminalExitCode = 1;
        continue;
      }

      if (event.type === "progress-update") {
        const progressLine = formatProgressUpdate(event);
        if (progressLine) {
          progress.update(progressLine);
          emit.detail(progressLine);
        }
        continue;
      }

      if (event.type === "status-update") {
        if (event.message && shouldRenderStatusUpdate(event.message)) {
          progress.update(event.message);
          emit.detail(event.message);
        }
        continue;
      }

      if (event.type === "runtime-error") {
        await updateSourceState(resolution.source, {
          lastRunAt: new Date().toISOString(),
          lastRunOutcome: CliOutcomeStatus.RUNTIME_ERROR,
          lastError: event.message ?? "Connector run failed.",
          lastLogPath: event.logPath,
        });
        emit.blank();
        progress.fail(`Problem connecting ${displayName}.`);
        emit.section("Problem");
        emit.info(event.message ?? "Connector run failed.");
        emit.event({
          type: "outcome",
          status: CliOutcomeStatus.RUNTIME_ERROR,
          source: resolution.source,
        });
        emit.blank();
        emit.section("Next");
        emit.bullet(`Retry with ${emit.code(`vana connect ${source}`)}.`);
        if (event.logPath || fetchLogPath || setupLogPath) {
          emit.bullet(
            `Inspect the latest run log with ${emit.code(`vana logs ${source}`)}.`,
          );
        }
        emit.bullet(`Inspect install health with ${emit.code("vana doctor")}.`);
        emit.bullet(
          `Or check overall status with ${emit.code("vana status")}.`,
        );
        if (event.logPath) {
          emit.keyValue("Run log", formatDisplayPath(event.logPath), "muted");
        }
        terminalExitCode = 1;
        continue;
      }

      if (event.type === "headed-required") {
        emit.blank();
        progress.update(`Manual browser step required for ${displayName}.`);
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
          lastLogPath: event.logPath,
        });
        emit.blank();
        progress.stop();
        emit.section("Manual step required");
        emit.info(
          `${displayName} still needs a manual browser step on this machine.`,
        );
        if (options.noInput) {
          emit.detail(
            `Because ${emit.code("--no-input")} is enabled, Vana stopped before opening that session.`,
          );
        } else {
          emit.detail(
            "Vana Connect could not continue this older connector flow automatically yet.",
          );
        }
        emit.blank();
        emit.section("Next");
        if (options.noInput) {
          emit.bullet(
            `Run ${emit.code(`vana connect ${source}`)} without ${emit.code("--no-input")}.`,
          );
        } else {
          emit.bullet(
            `Complete the browser step locally, then rerun ${emit.code(`vana connect ${source}`)}.`,
          );
        }
        if (event.logPath || fetchLogPath) {
          emit.bullet(
            `Inspect the latest run log with ${emit.code(`vana logs ${source}`)}.`,
          );
        }
        emit.bullet(
          `Or check overall status with ${emit.code("vana status")}.`,
        );
        if (event.logPath) {
          emit.keyValue("Run log", formatDisplayPath(event.logPath), "muted");
        }
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
      lastLogPath: runLogPath ?? fetchLogPath ?? setupLogPath ?? null,
    });

    const resultSummary = await readResultSummary(resultPath);
    const statusCommand = emit.code("vana status");
    const dataCommand = emit.code(`vana data show ${source}`);
    const successSummary =
      finalStatus === CliOutcomeStatus.CONNECTED_AND_INGESTED
        ? `Collected your ${displayName} data and synced it to your Personal Server.`
        : `Collected your ${displayName} data and saved it locally.`;

    emit.success(`Connected ${displayName}.`);
    progress.succeed(`Connected ${displayName}.`);
    emit.detail(successSummary);

    emit.blank();
    if (resultSummary) {
      emit.section("Collected");
      for (const line of resultSummary.lines) {
        emit.bullet(line);
      }
    }

    emit.blank();
    emit.section(
      finalStatus === CliOutcomeStatus.CONNECTED_AND_INGESTED
        ? "Saved and synced"
        : "Saved locally",
    );
    emit.keyValue("Path", formatDisplayPath(resultPath), "muted");
    emit.keyValue("Session", "Saved for faster reconnects.", "muted");
    if (finalStatus === CliOutcomeStatus.CONNECTED_AND_INGESTED) {
      emit.keyValue(
        "Server",
        "Your data is now available in your Personal Server.",
        "success",
      );
    } else if (
      finalStatus === CliOutcomeStatus.INGEST_FAILED &&
      ingestFailureMessage
    ) {
      emit.keyValue(
        "Server",
        `Sync failed: ${ingestFailureMessage}`,
        "warning",
      );
    } else if (target.state !== "available") {
      emit.keyValue(
        "Server",
        "Unavailable, so this run stayed local.",
        "muted",
      );
    }

    if (runLogPath) {
      emit.keyValue("Run log", formatDisplayPath(runLogPath), "muted");
    } else if (fetchLogPath) {
      emit.keyValue("Fetch log", formatDisplayPath(fetchLogPath), "muted");
    } else if (setupLogPath) {
      emit.keyValue("Setup log", formatDisplayPath(setupLogPath), "muted");
    }

    emit.blank();
    emit.section("Next");
    emit.bullet(`Inspect the data with ${dataCommand}`);
    emit.bullet(`Connect another source with ${emit.code("vana sources")}`);
    if (runLogPath) {
      emit.bullet(
        `Inspect the run log with ${emit.code(`vana logs ${source}`)}.`,
      );
    }
    emit.bullet(`Or check overall status with ${statusCommand}`);
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
      emit.blank();
      progress.stop();
      emit.section("Cancelled");
      emit.info(`Stopped before ${displayName} finished collecting your data.`);
      emit.detail("No credentials were sent anywhere.");
      emit.blank();
      emit.section("Next");
      emit.bullet(`Resume with ${emit.code(`vana connect ${source}`)}.`);
      if (runLogPath) {
        emit.bullet(
          `Inspect the latest run log with ${emit.code(`vana logs ${source}`)}.`,
        );
      }
      emit.bullet(`Or check overall status with ${emit.code("vana status")}.`);
      emit.event({
        type: "outcome",
        status: CliOutcomeStatus.NEEDS_INPUT,
        source,
        reason: "prompt_cancelled",
      });
      if (runLogPath) {
        emit.keyValue("Run log", formatDisplayPath(runLogPath), "muted");
      }
      return 1;
    }
    const message =
      error instanceof Error ? error.message : "Unexpected error.";
    progress.fail(`Problem connecting ${displayName}.`);
    emit.info(message);
    emit.event({
      type: "outcome",
      status: CliOutcomeStatus.UNEXPECTED_INTERNAL_ERROR,
      source,
      reason: message,
    });
    emit.blank();
    emit.section("Next");
    if (runLogPath || fetchLogPath || setupLogPath) {
      emit.bullet(
        `Inspect the latest run log with ${emit.code(`vana logs ${source}`)}.`,
      );
    }
    emit.bullet(`Inspect install health with ${emit.code("vana doctor")}.`);
    emit.bullet(`Or check overall status with ${emit.code("vana status")}.`);
    if (runLogPath) {
      emit.detail(`Run log: ${formatDisplayPath(runLogPath)}`);
    } else if (fetchLogPath) {
      emit.detail(`Fetch log: ${formatDisplayPath(fetchLogPath)}`);
    } else if (setupLogPath) {
      emit.detail(`Setup log: ${formatDisplayPath(setupLogPath)}`);
    }
    return 1;
  } finally {
    progress.stop();
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

  emit.title("Connect data");
  emit.blank();
  const connectedCount = enrichedSources.filter((source) =>
    hasCollectedData(source.dataState),
  ).length;
  const readyNowCount = enrichedSources.filter(
    (source) =>
      source.authMode !== "legacy" && !hasCollectedData(source.dataState),
  ).length;
  const manualCount = enrichedSources.filter(
    (source) =>
      source.authMode === "legacy" && !hasCollectedData(source.dataState),
  ).length;
  if (connectedCount > 0 || readyNowCount > 0 || manualCount > 0) {
    const parts = [];
    if (connectedCount > 0) {
      parts.push(
        `${connectedCount} connected ${connectedCount === 1 ? "source" : "sources"}`,
      );
    }
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
  if (connectedCount > 0) {
    emit.detail(
      `Inspect what you already collected with ${emit.code("vana data list")}, or reconnect any source below.`,
    );
  } else {
    emit.detail(
      `Or jump straight in with ${emit.code("vana connect <source>")}.`,
    );
  }
  let source: string;
  try {
    source = await select({
      message: "Source",
      pageSize: 8,
      choices: buildConnectChoices(
        enrichedSources,
        emit,
        suggestedSource?.id ?? null,
      ),
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
  const state = await readCliState();
  const sourceMetadata = createSourceMetadataMap(sources);
  const statuses = await gatherSourceStatuses(state.sources, sourceMetadata);
  const statusMap = new Map(statuses.map((source) => [source.source, source]));
  const installedSourceIds = new Set(
    (await listInstalledConnectorFiles()).map((source) => source.source),
  );
  const enrichedSources = sources.map((source) => {
    const status = statusMap.get(source.id);
    return {
      ...source,
      installed: installedSourceIds.has(source.id),
      dataState: status?.dataState,
      lastRunOutcome: status?.lastRunOutcome ?? null,
      sessionPresent: status?.sessionPresent ?? false,
    };
  });
  const readyCount = enrichedSources.filter(
    (source) =>
      source.authMode !== "legacy" && !hasCollectedData(source.dataState),
  ).length;
  const manualCount = enrichedSources.filter(
    (source) =>
      source.authMode === "legacy" && !hasCollectedData(source.dataState),
  ).length;
  const connectedCount = enrichedSources.filter(
    (source) =>
      source.dataState === "collected_local" ||
      source.dataState === "ingested_personal_server" ||
      source.dataState === "ingest_failed",
  ).length;
  const recommendedSource =
    enrichedSources.find(
      (source) =>
        source.authMode !== "legacy" &&
        source.dataState !== "collected_local" &&
        source.dataState !== "ingested_personal_server" &&
        source.dataState !== "ingest_failed",
    ) ??
    enrichedSources.find(
      (source) =>
        source.dataState !== "collected_local" &&
        source.dataState !== "ingested_personal_server" &&
        source.dataState !== "ingest_failed",
    ) ??
    null;
  const nextSteps = buildSourcesNextSteps(recommendedSource, connectedCount);
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        count: enrichedSources.length,
        recommendedSource,
        nextSteps,
        summary: {
          connectedCount,
          readyCount,
          manualCount,
          installedCount: enrichedSources.filter((source) => source.installed)
            .length,
        },
        sources: enrichedSources,
      })}\n`,
    );
    return 0;
  }

  const emit = createEmitter(options);
  emit.title(
    enrichedSources.length > 0
      ? `Available sources (${enrichedSources.length})`
      : "Available sources",
  );
  emit.blank();
  if (enrichedSources.length > 0) {
    emit.info(
      joinOverviewParts([
        connectedCount > 0 ? formatCountLabel("connected", connectedCount) : "",
        readyCount > 0 ? formatCountLabel("ready now", readyCount) : "",
        manualCount > 0
          ? formatCountLabel("with manual step", manualCount)
          : "",
      ]),
    );
    emit.blank();
  }
  const groups = [
    {
      title: "Connected",
      items: enrichedSources.filter(
        (source) =>
          source.dataState === "collected_local" ||
          source.dataState === "ingested_personal_server" ||
          source.dataState === "ingest_failed",
      ),
    },
    {
      title: "Ready now",
      items: enrichedSources.filter(
        (source) =>
          source.authMode !== "legacy" &&
          source.dataState !== "collected_local" &&
          source.dataState !== "ingested_personal_server" &&
          source.dataState !== "ingest_failed",
      ),
    },
    {
      title: "Manual steps",
      items: enrichedSources.filter(
        (source) =>
          source.authMode === "legacy" &&
          source.dataState !== "collected_local" &&
          source.dataState !== "ingested_personal_server" &&
          source.dataState !== "ingest_failed",
      ),
    },
  ].filter((group) => group.items.length > 0);

  groups.forEach((group, index) => {
    if (index > 0) {
      emit.blank();
    }
    emit.section(formatCountLabel(group.title, group.items.length));
    for (const source of group.items) {
      const badges: Array<{ text: string; tone?: RenderTone }> = [];
      if (
        source.dataState === "ingested_personal_server" ||
        source.dataState === "collected_local" ||
        source.dataState === "ingest_failed"
      ) {
        if (source.dataState === "ingested_personal_server") {
          badges.push({ text: "synced", tone: "success" });
        } else if (source.dataState === "ingest_failed") {
          badges.push({ text: "sync failed", tone: "warning" });
        } else {
          badges.push({ text: "local", tone: "muted" });
        }
      }
      if (source.authMode === "interactive") {
        badges.push({ text: "interactive", tone: "info" });
      } else if (source.authMode === "legacy") {
        badges.push({ text: "legacy", tone: "warning" });
      }
      if (
        recommendedSource?.id === source.id &&
        recommendedSource.authMode !== "legacy"
      ) {
        badges.push({ text: "recommended", tone: "accent" });
      }
      if (source.installed) {
        badges.push({ text: "installed", tone: "success" });
      }
      emit.sourceTitle(source.name, badges);
      if (source.description) {
        emit.detail(source.description);
      }
      if (
        source.dataState === "collected_local" ||
        source.dataState === "ingested_personal_server" ||
        source.dataState === "ingest_failed"
      ) {
        emit.detail(
          `Inspect with ${emit.code(`vana data show ${source.id}`)}.`,
        );
      } else {
        emit.detail(describeSourceFlow(source.authMode));
      }
    }
  });
  if (groups.length === 0) {
    emit.info("No sources are available right now.");
  } else {
    if (nextSteps.length > 0) {
      emit.blank();
      emit.section("Next");
      for (const step of nextSteps) {
        emit.bullet(step);
      }
    }
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
    cliVersion: getCliVersion(),
    channel: getCliChannel(),
    installMethod: getCliInstallMethod(),
    runtime: runtime.state,
    runtimePath: runtime.runtimePath,
    personalServer: personalServer.state,
    personalServerUrl: personalServer.url,
    summary: {
      sourceCount: sources.length,
      needsAttentionCount: sources.filter(
        (source) => rankSourceStatus(source) <= 4,
      ).length,
      connectedCount: sources.filter(
        (source) =>
          source.dataState === "ingested_personal_server" ||
          source.dataState === "collected_local" ||
          source.dataState === "ingest_failed",
      ).length,
      installedCount: sources.filter((source) => source.installed).length,
      localCount: sources.filter(
        (source) => source.dataState === "collected_local",
      ).length,
      syncedCount: sources.filter(
        (source) => source.dataState === "ingested_personal_server",
      ).length,
      syncFailedCount: sources.filter(
        (source) => source.dataState === "ingest_failed",
      ).length,
    },
    sources,
  };
  const nextSteps = buildStatusNextSteps(
    status.sources,
    sourceLabels,
    status.runtime,
    registrySources,
  );

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ...status, nextSteps })}\n`);
    return 0;
  }

  emit.title("Vana Connect status");
  emit.blank();
  emit.info(
    joinOverviewParts([
      (status.summary?.needsAttentionCount ?? 0) > 0
        ? formatCountLabel(
            "need attention",
            status.summary?.needsAttentionCount ?? 0,
          )
        : "",
      (status.summary?.connectedCount ?? 0) > 0
        ? formatCountLabel("connected", status.summary?.connectedCount ?? 0)
        : "",
      (status.summary?.localCount ?? 0) > 0
        ? formatCountLabel("local only", status.summary?.localCount ?? 0)
        : "",
      (status.summary?.syncedCount ?? 0) > 0
        ? formatCountLabel("synced", status.summary?.syncedCount ?? 0)
        : "",
      (status.summary?.syncFailedCount ?? 0) > 0
        ? formatCountLabel("sync failed", status.summary?.syncFailedCount ?? 0)
        : "",
      (status.summary?.connectedCount ?? 0) === 0 &&
      (status.summary?.installedCount ?? 0) > 0
        ? formatCountLabel("installed", status.summary?.installedCount ?? 0)
        : "",
    ]),
  );
  emit.blank();
  emit.section("Environment");
  emit.keyValue("Runtime", status.runtime, toneForRuntime(status.runtime));
  if (status.runtimePath) {
    emit.keyValue("Browser", formatDisplayPath(status.runtimePath), "muted");
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
        if (detail.kind === "row") {
          emit.keyValue(detail.label, detail.value, detail.tone ?? "muted");
          continue;
        }
        emit.detail(detail.message);
      }
    }
  });
  if (nextSteps.length > 0) {
    emit.blank();
    emit.section("Next");
    for (const step of nextSteps) {
      emit.bullet(step);
    }
  }
  return 0;
}

async function runDoctor(options: GlobalOptions): Promise<number> {
  const runtime = new ManagedPlaywrightRuntime();
  const personalServer = await detectPersonalServerTarget();
  const state = await readCliState();
  const registrySources = await loadRegistrySources();
  const sourceMetadata = createSourceMetadataMap(registrySources);
  const sourceLabels = createSourceLabelMap(registrySources);
  const sources = await gatherSourceStatuses(state.sources, sourceMetadata);
  const cliVersion = getCliVersion();
  const cliChannel = getCliChannel(cliVersion);
  const installMethod = getCliInstallMethod();
  const lifecycle = getLifecycleCommands(installMethod, cliChannel);
  const appRootPath = getDoctorAppRootPath(installMethod);
  const recentSources = [...sources]
    .filter((source) => Boolean(source.lastRunAt))
    .sort(compareSourceStatusOrder)
    .slice(0, 3);
  const attentionSources = recentSources.filter(
    (source) => rankSourceStatus(source) <= 4,
  );
  const connectedCount = sources.filter(
    (source) =>
      source.dataState === "collected_local" ||
      source.dataState === "ingested_personal_server" ||
      source.dataState === "ingest_failed",
  ).length;
  const attentionCount = sources.filter(
    (source) => rankSourceStatus(source) <= 4,
  ).length;

  const directories = [
    {
      key: "executable",
      label: "Executable",
      path: process.execPath,
      present: fs.existsSync(process.execPath),
    },
    ...(appRootPath
      ? [
          {
            key: "appRoot",
            label: "App root",
            path: appRootPath,
            present: fs.existsSync(appRootPath),
          },
        ]
      : []),
    {
      key: "dataHome",
      label: "Data home",
      path: getDataConnectHome(),
      present: fs.existsSync(getDataConnectHome()),
    },
    {
      key: "stateFile",
      label: "State file",
      path: getCliStatePath(),
      present: fs.existsSync(getCliStatePath()),
    },
    {
      key: "connectorCache",
      label: "Connector cache",
      path: getConnectorCacheDir(),
      present: fs.existsSync(getConnectorCacheDir()),
    },
    {
      key: "browserProfiles",
      label: "Browser profiles",
      path: getBrowserProfilesDir(),
      present: fs.existsSync(getBrowserProfilesDir()),
    },
    {
      key: "logs",
      label: "Logs",
      path: getLogsDir(),
      present: fs.existsSync(getLogsDir()),
    },
  ];

  const checks: CliDoctorCheck[] = [
    {
      key: "cli",
      label: "CLI",
      status: "ok",
      detail: `Version ${cliVersion}`,
    },
    {
      key: "runtime",
      label: "Runtime",
      status: runtime.state === "installed" ? "ok" : "warn",
      detail:
        runtime.state === "installed"
          ? `Browser available at ${formatDisplayPath(runtime.runtimePath ?? "unknown")}`
          : "Run `vana setup` to install the local browser runtime.",
    },
    {
      key: "personalServer",
      label: "Personal Server",
      status: personalServer.state === "available" ? "ok" : "warn",
      detail:
        personalServer.state === "available"
          ? (personalServer.url ?? "Available")
          : "Unavailable. Connects will stay local until a Personal Server is reachable.",
    },
    ...directories.map<CliDoctorCheck>((entry) => ({
      key: entry.key,
      label: entry.label,
      status: entry.present ? "ok" : "warn",
      detail: `${entry.present ? "Present" : "Missing"} at ${formatDisplayPath(entry.path)}`,
    })),
    {
      key: "sources",
      label: "Tracked sources",
      status: "ok" as const,
      detail: `${Object.keys(state.sources).length} source${Object.keys(state.sources).length === 1 ? "" : "s"} in local state`,
    },
    ...(attentionSources[0]
      ? [
          {
            key: "latestIssue",
            label: "Latest issue",
            status: "warn" as const,
            detail: `${displaySource(attentionSources[0].source, sourceLabels)}: ${attentionSources[0].lastError ?? getSourceStatusPresentation(attentionSources[0]).label}`,
          },
        ]
      : []),
  ];

  const nextSteps = [
    ...(runtime.state !== "installed"
      ? ["Install the local runtime with `vana setup`."]
      : []),
    ...(personalServer.state !== "available"
      ? [
          "Your Personal Server is unavailable, so successful runs will stay local.",
        ]
      : []),
    ...(Object.keys(state.sources).length === 0
      ? ["Connect your first source with `vana connect`."]
      : ["Check overall status with `vana status`."]),
    ...(attentionSources[0]?.lastLogPath
      ? [
          `Inspect the latest issue log with \`vana logs ${attentionSources[0].source}\`.`,
        ]
      : recentSources[0]?.lastLogPath
        ? [
            `Inspect the latest run log with \`vana logs ${recentSources[0].source}\`.`,
          ]
        : []),
  ];

  const payload: CliDoctor = {
    cliVersion,
    channel: cliChannel,
    installMethod,
    runtime: runtime.state,
    runtimePath: runtime.runtimePath,
    personalServer: personalServer.state,
    personalServerUrl: personalServer.url,
    capabilities: runtime.capabilities,
    paths: {
      executable: process.execPath,
      appRoot: appRootPath,
      dataHome: getDataConnectHome(),
      stateFile: getCliStatePath(),
      connectorCache: getConnectorCacheDir(),
      browserProfiles: getBrowserProfilesDir(),
      logs: getLogsDir(),
    },
    lifecycle,
    summary: {
      trackedSourceCount: Object.keys(state.sources).length,
      attentionCount,
      connectedCount,
    },
    recentSources,
    checks,
    nextSteps,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return 0;
  }

  const emit = createEmitter(options);
  emit.title("Vana Connect doctor");
  emit.blank();
  emit.section("Summary");
  emit.keyValue("CLI", cliVersion, "muted");
  emit.keyValue("Channel", cliChannel, "muted");
  emit.keyValue("Install", formatInstallMethodLabel(installMethod), "muted");
  emit.keyValue("Runtime", runtime.state, toneForRuntime(runtime.state));
  emit.keyValue(
    "Personal Server",
    personalServer.state,
    personalServer.state === "available" ? "success" : "warning",
  );
  emit.keyValue(
    "Tracked sources",
    String(Object.keys(state.sources).length),
    "muted",
  );
  emit.keyValue(
    "Attention",
    String(attentionCount),
    attentionCount > 0 ? "warning" : "muted",
  );
  emit.keyValue(
    "Connected",
    String(connectedCount),
    connectedCount > 0 ? "success" : "muted",
  );
  emit.keyValue(
    "Headed sessions",
    runtime.capabilities.supportsHeaded ? "Available" : "Unavailable",
    runtime.capabilities.supportsHeaded ? "success" : "warning",
  );
  emit.keyValue(
    "Managed profiles",
    runtime.capabilities.supportsManagedProfiles ? "Available" : "Unavailable",
    runtime.capabilities.supportsManagedProfiles ? "success" : "warning",
  );
  emit.keyValue(
    "Screenshots",
    runtime.capabilities.supportsScreenshots ? "Available" : "Unavailable",
    runtime.capabilities.supportsScreenshots ? "success" : "warning",
  );
  emit.blank();
  emit.section("Checks");
  for (const check of checks) {
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
      if (source.authMode === "interactive") {
        badges.push({ text: "interactive", tone: "info" });
      } else if (source.authMode === "legacy") {
        badges.push({ text: "legacy", tone: "warning" });
      }
      badges.push({ text: status.label, tone: status.tone });
      emit.sourceTitle(displaySource(source.source, sourceLabels), badges);
      const details = formatSourceStatusDetails(source);
      for (const detail of details) {
        if (detail.kind === "row") {
          emit.keyValue(detail.label, detail.value, detail.tone ?? "muted");
        } else {
          emit.detail(detail.message);
        }
      }
    }
  }
  emit.blank();
  emit.section("Paths");
  emit.keyValue("Executable", formatDisplayPath(process.execPath), "muted");
  if (appRootPath) {
    emit.keyValue("App root", formatDisplayPath(appRootPath), "muted");
  }
  emit.keyValue("Data home", formatDisplayPath(getDataConnectHome()), "muted");
  emit.keyValue("State file", formatDisplayPath(getCliStatePath()), "muted");
  emit.keyValue(
    "Connector cache",
    formatDisplayPath(getConnectorCacheDir()),
    "muted",
  );
  emit.keyValue(
    "Browser profiles",
    formatDisplayPath(getBrowserProfilesDir()),
    "muted",
  );
  emit.keyValue("Logs", formatDisplayPath(getLogsDir()), "muted");
  emit.blank();
  emit.section("Lifecycle");
  emit.keyValue("Upgrade", lifecycle.upgrade, "muted");
  emit.keyValue("Uninstall", lifecycle.uninstall, "muted");
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
  const registrySources = await loadRegistrySources();
  const suggestedSource =
    registrySources.find((source) => source.authMode !== "legacy") ??
    registrySources[0];

  emit.title("Vana Connect setup");
  emit.blank();
  emit.section("Runtime");

  if (runtime.state === "installed") {
    emit.info("The local runtime is already installed.");
    if (runtime.runtimePath) {
      emit.keyValue("Browser", formatDisplayPath(runtime.runtimePath), "muted");
    }
    emit.blank();
    emit.section("Next");
    emit.bullet(`Check overall status with ${emit.code("vana status")}.`);
    emit.bullet(formatSetupConnectStep(emit, suggestedSource));
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
    emit.section("Next");
    emit.bullet(`Check overall status with ${emit.code("vana status")}.`);
    emit.bullet(formatSetupConnectStep(emit, suggestedSource));
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
  const registrySources = await loadRegistrySources();
  const sources = await gatherSourceStatuses(
    state.sources,
    createSourceMetadataMap(registrySources),
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
  const nextSteps = buildDataListNextSteps(datasetRecords, registrySources);

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        count: datasetRecords.length,
        latestDataset: datasetRecords[0] ?? null,
        nextSteps,
        summary: {
          localCount: datasetRecords.filter(
            (dataset) => dataset.dataState !== "ingested_personal_server",
          ).length,
          syncedCount: datasetRecords.filter(
            (dataset) => dataset.dataState === "ingested_personal_server",
          ).length,
          syncFailedCount: datasetRecords.filter(
            (dataset) => dataset.dataState === "ingest_failed",
          ).length,
        },
        datasets: datasetRecords,
      })}\n`,
    );
    return 0;
  }

  const emit = createEmitter(options);
  if (datasetRecords.length === 0) {
    const suggestedSource =
      registrySources.find((source) => source.authMode !== "legacy") ??
      registrySources[0];
    emit.title("Collected data");
    emit.blank();
    emit.info("No local datasets collected yet.");
    emit.blank();
    emit.section("Next");
    if (suggestedSource) {
      emit.bullet(
        `Collect your first dataset with ${emit.code(`vana connect ${suggestedSource.id}`)}.`,
      );
    } else {
      emit.bullet(
        `Collect your first dataset with ${emit.code("vana connect")}.`,
      );
    }
    emit.bullet(`Check overall status with ${emit.code("vana status")}.`);
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
  emit.section("Next");
  for (const step of nextSteps) {
    emit.bullet(step);
  }
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
  const datasetCount = Object.values(state.sources).filter((entry) =>
    Boolean(entry?.lastResultPath),
  ).length;
  const emit = createEmitter(options);

  if (!resultPath) {
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({
          error: "dataset_not_found",
          source,
          message: `No collected dataset found for ${displaySource(source, sourceLabels)}. Run \`vana connect ${source}\` first.`,
          nextSteps: [
            `Run \`vana connect ${source}\` to collect data.`,
            ...(datasetCount > 0
              ? ["Run `vana data list` to inspect other datasets."]
              : []),
          ],
        })}\n`,
      );
    } else {
      emit.info(
        `No collected dataset found for ${displaySource(source, sourceLabels)}. Run \`vana connect ${source}\` first.`,
      );
      emit.blank();
      emit.section("Next");
      emit.bullet(`Collect data with ${emit.code(`vana connect ${source}`)}.`);
      if (datasetCount > 0) {
        emit.bullet(
          `Inspect other datasets with ${emit.code("vana data list")}.`,
        );
      }
    }
    return 1;
  }

  try {
    const raw = await fsp.readFile(resultPath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const summary = summarizeResultData(data);
    const nextSteps = buildDataShowNextSteps(
      source,
      datasetCount,
      sourceLabels,
    );
    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({
          source,
          name: displaySource(source, sourceLabels),
          path: resultPath,
          summary,
          lastRunAt: record?.lastRunAt ?? null,
          dataState: record?.dataState ?? null,
          nextSteps,
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
    for (const step of nextSteps) {
      emit.bullet(step);
    }
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
        emit.section("Next");
        for (const step of payload.nextSteps) {
          emit.bullet(step);
        }
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
    emit.section("Next");
    for (const step of nextSteps) {
      emit.bullet(step);
    }
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
  emit.section("Next");
  for (const step of nextSteps) {
    emit.bullet(step);
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
  const normalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
  return `${normalizedLabel} (${count})`;
}

function joinOverviewParts(parts: string[]): string {
  return parts.filter(Boolean).join(" • ");
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
        lastLogPath: stored.lastLogPath ?? null,
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
      value: "Saved for faster reconnects.",
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
      value: formatTimestamp(source.lastRunAt),
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

function buildStatusNextSteps(
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

function buildSourcesNextSteps(
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

function buildDataListNextSteps(
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

function buildDataShowNextSteps(
  source: string,
  datasetCount: number,
  sourceLabels: SourceLabelMap = {},
): string[] {
  return [
    `Print the path with \`vana data path ${source}\`.`,
    `Use \`vana data show ${source} --json | jq\` for structured inspection.`,
    `Reconnect ${displaySource(source, sourceLabels)} with \`vana connect ${source}\`.`,
    "Connect another source with `vana sources`.",
    ...(datasetCount > 1
      ? ["Inspect other datasets with `vana data list`."]
      : []),
    "Check overall status with `vana status`.",
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

function formatSetupConnectStep(
  emit: Pick<Emitter, "code">,
  source:
    | {
        id: string;
        name: string;
      }
    | undefined,
): string {
  if (source) {
    return `Connect ${source.name} with ${emit.code(`vana connect ${source.id}`)}.`;
  }

  return `Connect a source with ${emit.code("vana connect")}.`;
}

function describeConnectTrust(
  authMode: "automated" | "interactive" | "legacy" | undefined,
): string | null {
  if (authMode === "legacy") {
    return "If needed, Vana Connect will open a local browser session on this machine.";
  }

  if (authMode === "interactive") {
    return "If needed, Vana Connect will ask for details in this terminal. Those details stay local to this machine.";
  }

  return null;
}

function buildConnectChoices(
  sources: Array<{
    id: string;
    name: string;
    description?: string;
    authMode?: "automated" | "interactive" | "legacy";
    dataState?: SourceStatus["dataState"];
    lastRunOutcome?: string | null;
    sessionPresent?: boolean;
  }>,
  emit: Pick<Emitter, "badge">,
  recommendedSourceId: string | null = null,
) {
  const connected = sources.filter((source) =>
    hasCollectedData(source.dataState),
  );
  const readyNow = sources.filter(
    (source) =>
      source.authMode !== "legacy" && !hasCollectedData(source.dataState),
  );
  const manualSteps = sources.filter(
    (source) =>
      source.authMode === "legacy" && !hasCollectedData(source.dataState),
  );
  const choices: Array<
    | Separator
    | {
        value: string;
        name: string;
        description: string;
        short: string;
      }
  > = [];

  const appendGroup = (label: string, items: typeof sources) => {
    if (items.length === 0) {
      return;
    }
    if (choices.length > 0) {
      choices.push(new Separator(""));
    }
    choices.push(new Separator(label));
    for (const item of items) {
      choices.push({
        name: `${item.name}${formatAuthModeBadge(item.authMode, emit)}${
          item.id === recommendedSourceId && item.authMode !== "legacy"
            ? ` ${emit.badge("recommended", "accent")}`
            : ""
        }`,
        description: formatSourcePickerDescription(item),
        short: item.name,
        value: item.id,
      });
    }
  };

  appendGroup("Connected", connected);
  appendGroup("Ready now", readyNow);
  appendGroup("Manual steps", manualSteps);

  return choices;
}

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

function describeSourceFlow(
  authMode: "automated" | "interactive" | "legacy" | undefined,
): string {
  if (authMode === "legacy") {
    return "Flow: finishes with a manual browser step on this machine.";
  }

  if (authMode === "interactive") {
    return "Flow: prompts in this terminal when the source needs input.";
  }

  return "Flow: runs without extra input when the source supports it.";
}

function formatSourcePickerDescription(source: {
  description?: string;
  authMode?: "automated" | "interactive" | "legacy";
  dataState?: SourceStatus["dataState"];
  lastRunOutcome?: string | null;
  sessionPresent?: boolean;
  id?: string;
}): string {
  if (hasCollectedData(source.dataState) && source.id) {
    const savedState =
      source.dataState === "ingested_personal_server"
        ? "Already connected and synced."
        : source.dataState === "ingest_failed"
          ? "Already connected locally; Personal Server sync failed."
          : "Already connected locally.";
    const reconnectHint = source.sessionPresent
      ? " Saved session available for faster reconnects."
      : "";
    return `${savedState} Inspect with \`vana data show ${source.id}\` or reconnect now.${reconnectHint}`;
  }

  if (source.lastRunOutcome === CliOutcomeStatus.LEGACY_AUTH && source.id) {
    return `Needs a manual browser step on this machine. Continue with \`vana connect ${source.id}\`.`;
  }

  const flow = describeSourceFlow(source.authMode);
  if (!source.description) {
    return flow;
  }

  return `${source.description} ${flow}`;
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

function getCliVersion(): string {
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

function getCliChannel(version = getCliVersion()): "stable" | "canary" {
  return version.includes("canary") ? "canary" : "stable";
}

function getCliInstallMethod(execPath = process.execPath): CliInstallMethod {
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

function getDoctorAppRootPath(
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

function formatInstallMethodLabel(method: CliInstallMethod): string {
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

function getLifecycleCommands(
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

function hasCollectedData(
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
