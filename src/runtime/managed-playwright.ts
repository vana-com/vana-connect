import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  ensureParentDir,
  getConnectorCacheDir,
  getDataConnectHome,
  getLogsDir,
  getRunnerDir,
  getTimestampedLogPath,
} from "../core/index.js";
import type { CliEvent, RuntimeState } from "../core/cli-types.js";
import { fetchConnectorToCache } from "../connectors/registry.js";
import { getBundledRuntimePaths } from "./bundled-assets.js";
import type { ConnectorRunHandle } from "./core/index.js";
import { startChildProcessConnectorRun } from "./playwright/index.js";
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
    const handle: ConnectorRunHandle = startChildProcessConnectorRun({
      request: options,
      runnerDir: this.runnerDir,
      logPath,
    });

    for await (const event of handle.events()) {
      yield event as CliEvent;
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
