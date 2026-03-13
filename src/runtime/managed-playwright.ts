import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import {
  ensureParentDir,
  getBrowserProfilesDir,
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
import {
  getBrowserCacheDir,
  resolveBrowserPath,
  startChildProcessConnectorRun,
  startInProcessConnectorRun,
} from "./playwright/index.js";
import { findDataConnectorsDir } from "./repo-paths.js";

const require = createRequire(import.meta.url);

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

  get runtimePath(): string | null {
    return getResolvedRuntimePath();
  }

  get state(): RuntimeState {
    if (process.env.VANA_CONNECT_CHILD_PROCESS_RUNNER) {
      return fs.existsSync(path.join(this.runnerDir, "index.cjs"))
        ? "installed"
        : "missing";
    }

    return this.runtimePath ? "installed" : "missing";
  }

  async ensureInstalled(autoApprove: boolean): Promise<RuntimeInstallResult> {
    const runtime = this.state;
    if (runtime === "installed") {
      return { runtime, runtimePath: this.runtimePath };
    }
    const logPath = getTimestampedLogPath("setup");
    await ensureParentDir(logPath);
    const homeDir = getDataConnectHome();

    await fsp.mkdir(homeDir, { recursive: true });
    await fsp.mkdir(getConnectorCacheDir(), { recursive: true });
    await fsp.mkdir(getBrowserProfilesDir(), { recursive: true });
    await fsp.mkdir(getBrowserCacheDir(), { recursive: true });

    if (process.env.VANA_CONNECT_CHILD_PROCESS_RUNNER) {
      await ensureLegacyRunnerInstalled({
        autoApprove,
        logPath,
        runnerDir: this.runnerDir,
      });
    } else {
      await installChromium(logPath);
    }

    return {
      runtime: this.state,
      runtimePath: this.runtimePath,
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
    const handle: ConnectorRunHandle = process.env
      .VANA_CONNECT_CHILD_PROCESS_RUNNER
      ? startChildProcessConnectorRun({
          request: options,
          runnerDir: this.runnerDir,
          logPath,
        })
      : startInProcessConnectorRun({
          request: options,
          logPath,
        });

    for await (const event of handle.events()) {
      yield event as CliEvent;
    }
  }
}

async function installChromium(logPath: string): Promise<void> {
  const playwrightCliPath = path.join(
    path.dirname(require.resolve("playwright/package.json")),
    "cli.js",
  );
  const browserCacheDir = getBrowserCacheDir();
  try {
    await spawnForExit(
      getNodeCommand(),
      [playwrightCliPath, "install", "chromium"],
      {
        cwd: getDataConnectHome(),
        logPath,
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: browserCacheDir,
        },
      },
    );
  } catch {
    await spawnForExit(
      getNodeCommand(),
      [playwrightCliPath, "install", "chromium"],
      {
        cwd: getDataConnectHome(),
        logPath,
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: browserCacheDir,
          PLAYWRIGHT_SKIP_BROWSER_GC: "1",
        },
      },
    );
  }
}

async function ensureLegacyRunnerInstalled({
  autoApprove,
  logPath,
  runnerDir,
}: {
  autoApprove: boolean;
  logPath: string;
  runnerDir: string;
}): Promise<void> {
  const bundledRuntime = await getBundledRuntimePaths();

  await fsp.rm(runnerDir, { recursive: true, force: true });
  await fsp.cp(bundledRuntime.playwrightRunnerDir, runnerDir, {
    recursive: true,
  });

  await spawnForExit("npm", ["install", "--ignore-scripts"], {
    cwd: runnerDir,
    logPath,
    env: {
      ...process.env,
      CI: autoApprove ? "1" : process.env.CI,
    },
  });

  await installChromium(logPath);
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

function getNodeCommand(): string {
  return process.env.VANA_NODE_BIN || process.execPath;
}

function getResolvedRuntimePath(): string | null {
  try {
    return resolveBrowserPath();
  } catch {
    return null;
  }
}
