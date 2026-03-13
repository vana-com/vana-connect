import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  ensureParentDir,
  getConnectorCacheDir,
  getDataConnectHome,
  getLastResultPath,
  getLogsDir,
  getRunnerDir,
  getTimestampedLogPath,
} from "../core/index.js";
import type { CliEvent, RuntimeState } from "../core/cli-types.js";
import { fetchConnectorToCache } from "../connectors/registry.js";
import { getBundledRuntimePaths } from "./bundled-assets.js";
import { findDataConnectorsDir } from "./repo-paths.js";

export interface RuntimeInstallResult {
  runtime: RuntimeState;
  runtimePath: string | null;
  logPath?: string;
}

export interface RunConnectorOptions {
  connectorPath: string;
  source: string;
  pretty?: boolean;
  noInput?: boolean;
  signal?: AbortSignal;
  onNeedInput?: (event: NeedInputEvent) => Promise<Record<string, string>>;
}

export interface NeedInputEvent {
  message?: string;
  schema?: {
    properties?: Record<string, unknown>;
  };
  fields: string[];
  responseInputPath: string;
}

export class ManagedPlaywrightRuntime {
  get runnerDir(): string {
    return getRunnerDir();
  }

  get state(): RuntimeState {
    if (!fs.existsSync(path.join(this.runnerDir, "index.cjs"))) {
      return "missing";
    }
    if (
      !fs.existsSync(
        path.join(getConnectorCacheDir(), "..", "run-connector.cjs"),
      )
    ) {
      return "unhealthy";
    }
    return "installed";
  }

  async ensureInstalled(autoApprove: boolean): Promise<RuntimeInstallResult> {
    const runtime = this.state;
    if (runtime === "installed") {
      return { runtime, runtimePath: this.runnerDir };
    }
    const logPath = getTimestampedLogPath("setup");
    await ensureParentDir(logPath);
    const homeDir = getDataConnectHome();
    const bundledRuntime = await getBundledRuntimePaths();
    const runConnectorTargetPath = path.join(homeDir, "run-connector.cjs");

    await fsp.mkdir(homeDir, { recursive: true });
    await fsp.mkdir(getConnectorCacheDir(), { recursive: true });
    await fsp.rm(this.runnerDir, { recursive: true, force: true });
    await fsp.cp(bundledRuntime.playwrightRunnerDir, this.runnerDir, {
      recursive: true,
    });

    await spawnForExit("npm", ["install", "--ignore-scripts"], {
      cwd: this.runnerDir,
      logPath,
      env: {
        ...process.env,
        CI: autoApprove ? "1" : process.env.CI,
      },
    });

    await installChromium(this.runnerDir, logPath);
    await ensureParentDir(runConnectorTargetPath);
    await fsp.copyFile(bundledRuntime.runConnectorPath, runConnectorTargetPath);

    return {
      runtime: this.state,
      runtimePath: this.state === "installed" ? this.runnerDir : null,
      logPath,
    };
  }

  async fetchConnector(
    source: string,
  ): Promise<{ connectorPath: string; logPath: string }> {
    const dataConnectorsDir = findDataConnectorsDir();
    const logPath = getTimestampedLogPath(`fetch-${source}`);
    await ensureParentDir(logPath);

    try {
      const resolution = await fetchConnectorToCache(
        source,
        getConnectorCacheDir(),
        dataConnectorsDir ?? undefined,
      );
      await fsp.writeFile(
        logPath,
        `${JSON.stringify(
          {
            type: "connector-resolved",
            source: resolution.source,
            connectorPath: resolution.connectorPath,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      return { connectorPath: resolution.connectorPath, logPath };
    } catch (error) {
      await fsp.writeFile(
        logPath,
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        "utf8",
      );
      throw error;
    }
  }

  async *runConnector(
    options: RunConnectorOptions,
  ): AsyncGenerator<CliEvent, void, void> {
    await fsp.mkdir(getLogsDir(), { recursive: true });
    const logPath = getTimestampedLogPath(`run-${options.source}`);
    const runConnectorPath = path.join(
      getRunnerDir(),
      "..",
      "run-connector.cjs",
    );
    const args = [
      runConnectorPath,
      options.connectorPath,
      "--output",
      getLastResultPath(),
    ];
    const child = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const logStream = fs.createWriteStream(logPath);
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      });
    }

    let stdoutBuffer = "";
    let settled = false;
    const queue: CliEvent[] = [];
    let resolveQueue: (() => void) | null = null;

    const flushQueue = () => {
      resolveQueue?.();
      resolveQueue = null;
    };

    const pushEvent = (event: CliEvent) => {
      queue.push(event);
      flushQueue();
    };

    child.stderr.on("data", (chunk) => {
      logStream.write(chunk);
    });

    child.stdout.on("data", async (chunk: Buffer) => {
      logStream.write(chunk);
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (parsed.type === "need-input") {
          const fields = Object.keys(
            ((
              parsed.schema as
                | { properties?: Record<string, unknown> }
                | undefined
            )?.properties ?? {}) as Record<string, unknown>,
          );

          if (options.noInput || !options.onNeedInput) {
            child.kill("SIGTERM");
            pushEvent({
              type: "needs-input",
              source: options.source,
              message:
                typeof parsed.message === "string"
                  ? parsed.message
                  : "Additional input is required.",
              fields,
              logPath,
            });
            continue;
          }

          const input = await options.onNeedInput({
            message:
              typeof parsed.message === "string"
                ? parsed.message
                : "Additional input is required.",
            schema: parsed.schema as NeedInputEvent["schema"],
            fields,
            responseInputPath: String(parsed.responseInputPath),
          });
          await ensureParentDir(String(parsed.responseInputPath));
          await fsp.writeFile(
            String(parsed.responseInputPath),
            `${JSON.stringify(input)}\n`,
            "utf8",
          );
          continue;
        }

        if (parsed.type === "result") {
          pushEvent({
            type: "collection-complete",
            source: options.source,
            resultPath: String(parsed.resultPath),
            logPath,
          });
          continue;
        }

        if (parsed.type === "legacy-auth") {
          pushEvent({
            type: "legacy-auth",
            source: options.source,
            message:
              typeof parsed.message === "string"
                ? parsed.message
                : "This connector requires legacy headed authentication.",
            logPath,
          });
          continue;
        }

        if (parsed.type === "error") {
          pushEvent({
            type: "runtime-error",
            source: options.source,
            message:
              typeof parsed.message === "string"
                ? parsed.message
                : "Connector run failed.",
            logPath,
          });
          continue;
        }
      }
    });

    child.on("close", () => {
      settled = true;
      logStream.end();
      flushQueue();
    });

    pushEvent({
      type: "run-started",
      source: options.source,
      logPath,
    });

    while (!settled || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          resolveQueue = resolve;
        });
        continue;
      }
      yield queue.shift() as CliEvent;
    }
  }
}

async function installChromium(
  runnerDir: string,
  logPath: string,
): Promise<void> {
  try {
    await spawnForExit("npx", ["playwright", "install", "chromium"], {
      cwd: runnerDir,
      logPath,
    });
  } catch {
    await spawnForExit("npx", ["playwright", "install", "chromium"], {
      cwd: runnerDir,
      logPath,
      env: {
        ...process.env,
        PLAYWRIGHT_SKIP_BROWSER_GC: "1",
      },
    });
  }
}

interface SpawnOptions {
  cwd: string;
  logPath: string;
  env?: NodeJS.ProcessEnv;
}

async function spawnForExit(
  command: string,
  args: string[],
  options: SpawnOptions,
): Promise<void> {
  await ensureParentDir(options.logPath);
  const logStream = fs.createWriteStream(options.logPath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => logStream.write(chunk));
    child.stderr.on("data", (chunk) => logStream.write(chunk));
    child.on("close", (code) => {
      logStream.end();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed with exit code ${code}.`));
    });
  });
}
