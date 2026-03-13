import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

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
import {
  getBrowserCacheDir,
  resolveBrowserPath,
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
    const handle = startInProcessConnectorRun({
      request: options,
      logPath,
    });

    for await (const event of handle.events()) {
      yield event as CliEvent;
    }
  }
}

async function installChromium(logPath: string): Promise<void> {
  const browserCacheDir = getBrowserCacheDir();
  const previousBrowserPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const previousSkipGc = process.env.PLAYWRIGHT_SKIP_BROWSER_GC;

  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH = browserCacheDir;
    process.env.PLAYWRIGHT_SKIP_BROWSER_GC = "1";

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

    await ensureParentDir(logPath);
    await fsp.writeFile(
      logPath,
      `Installing Chromium into ${browserCacheDir}\n`,
      "utf8",
    );
    await registry.install(executables);
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

function getResolvedRuntimePath(): string | null {
  try {
    return resolveBrowserPath();
  } catch {
    return null;
  }
}
