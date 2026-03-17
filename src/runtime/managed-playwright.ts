import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  ensureParentDir,
  getBrowserProfilesDir,
  getConnectorCacheDir,
  getDataConnectHome,
  getLogsDir,
  getTimestampedLogPath,
} from "../core/index.js";
import type { CliEvent, RuntimeState } from "../core/cli-types.js";
import { fetchConnectorToCache } from "../connectors/registry.js";
import type { RuntimeCapabilities } from "./core/index.js";
import {
  getBrowserCacheDir,
  resolveBrowserPath,
  startInProcessConnectorRun,
} from "./playwright/index.js";
import { findDataConnectorsDir } from "./repo-paths.js";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

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
  get capabilities(): RuntimeCapabilities {
    return {
      supportsHeaded:
        process.platform !== "linux" ||
        Boolean(process.env.DISPLAY) ||
        Boolean(process.env.WAYLAND_DISPLAY),
      supportsManagedProfiles: true,
      supportsScreenshots: true,
    };
  }

  get runtimePath(): string | null {
    return getResolvedRuntimePath();
  }

  get state(): RuntimeState {
    return this.runtimePath ? "installed" : "missing";
  }

  async ensureInstalled(_autoApprove: boolean): Promise<RuntimeInstallResult> {
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

    await installChromium(logPath);

    return {
      runtime: this.state,
      runtimePath: this.runtimePath,
      logPath,
    };
  }

  async fetchConnector(source: string): Promise<{
    connectorPath: string;
    logPath: string;
    version?: string;
    exportFrequency?: string;
  }> {
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
      return {
        connectorPath: resolution.connectorPath,
        logPath,
        version: resolution.version,
      };
    } catch (error) {
      await fsp.writeFile(
        logPath,
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        "utf8",
      );
      if (error && typeof error === "object") {
        Object.assign(error, { logPath });
      }
      throw error;
    }
  }

  async *runConnector(
    options: RunConnectorOptions,
  ): AsyncGenerator<CliEvent, void, void> {
    await fsp.mkdir(getLogsDir(), { recursive: true });
    const logPath = getTimestampedLogPath(`run-${options.source}`);
    const handle = startInProcessConnectorRun({
      request: options,
      logPath,
    });

    for await (const event of handle.events()) {
      yield event as CliEvent;
    }
  }
}

export async function installChromium(logPath: string): Promise<void> {
  const browserCacheDir = getBrowserCacheDir();
  const previousBrowserPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const previousSkipGc = process.env.PLAYWRIGHT_SKIP_BROWSER_GC;

  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH = browserCacheDir;
    process.env.PLAYWRIGHT_SKIP_BROWSER_GC = "1";

    await ensureParentDir(logPath);
    await fsp.writeFile(
      logPath,
      `Installing Chromium into ${browserCacheDir}\n`,
      "utf8",
    );
    const cliInstalled = await installChromiumViaPackagedCli(
      logPath,
      browserCacheDir,
    );
    if (!cliInstalled) {
      await fsp.appendFile(
        logPath,
        "Falling back to Playwright internal registry install.\n",
        "utf8",
      );
      const { registry } = require(
        require.resolve("playwright-core/lib/server/registry/index", {
          paths: [path.dirname(require.resolve("playwright/package.json"))],
        }),
      ) as {
        registry: {
          findExecutable(name: string): {
            name: string;
            installType: string;
          };
          install(
            executables: Array<unknown>,
            options?: { force?: boolean },
          ): Promise<void>;
        };
      };

      const executables: Array<unknown> = [];
      if (process.platform === "win32") {
        executables.push(registry.findExecutable("winldd"));
      }
      executables.push(registry.findExecutable("chromium"));
      await registry.install(executables);
    }
    await fsp.appendFile(logPath, "Chromium installation complete.\n", "utf8");
  } catch (error) {
    await ensureParentDir(logPath);
    await fsp.appendFile(
      logPath,
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      "utf8",
    );
    throw error;
  } finally {
    if (previousBrowserPath === undefined) {
      delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    } else {
      process.env.PLAYWRIGHT_BROWSERS_PATH = previousBrowserPath;
    }

    if (previousSkipGc === undefined) {
      delete process.env.PLAYWRIGHT_SKIP_BROWSER_GC;
    } else {
      process.env.PLAYWRIGHT_SKIP_BROWSER_GC = previousSkipGc;
    }
  }
}

export async function installChromiumViaPackagedCli(
  logPath: string,
  browserCacheDir: string,
): Promise<boolean> {
  const playwrightCliPath = getPlaywrightCliPath();
  if (!playwrightCliPath) {
    await fsp.appendFile(
      logPath,
      "Playwright packaged CLI not found. Skipping CLI install path.\n",
      "utf8",
    );
    return false;
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [playwrightCliPath, "install", "chromium"],
      {
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: browserCacheDir,
          PLAYWRIGHT_SKIP_BROWSER_GC: "1",
        },
        windowsHide: true,
      },
    );
    if (stdout) {
      await fsp.appendFile(logPath, stdout, "utf8");
    }
    if (stderr) {
      await fsp.appendFile(logPath, stderr, "utf8");
    }
    return true;
  } catch (error) {
    const details =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    await fsp.appendFile(
      logPath,
      `Playwright packaged CLI install failed.\n${details}\n`,
      "utf8",
    );
    return false;
  }
}

export function getPlaywrightCliPath(): string | null {
  try {
    const playwrightPackagePath = require.resolve("playwright/package.json");
    const playwrightRoot = path.dirname(playwrightPackagePath);
    const cliPath = path.join(playwrightRoot, "cli.js");
    return cliPath;
  } catch {
    return null;
  }
}

function getResolvedRuntimePath(): string | null {
  try {
    return resolveBrowserPath();
  } catch {
    return null;
  }
}
