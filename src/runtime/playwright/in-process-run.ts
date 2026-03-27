import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { BrowserContext, Cookie, Page } from "playwright";

import {
  ensureParentDir,
  getSourceResultPath,
  rotateResult,
} from "../../core/index.js";
import type {
  ConnectorRunHandle,
  ConnectorRunRequest,
  RuntimeEvent,
  RuntimeInputRequest,
} from "../core/index.js";
import {
  getDefaultUserDataDir,
  importChromeCookies,
  isSystemChrome,
  launchPersistentContext,
  resolveBrowserPath,
} from "./browser.js";

type PendingInputRequest = {
  message?: string;
  schema?: {
    properties?: Record<string, unknown>;
  };
};

type NetworkCaptureConfig = {
  urlPattern: string;
  bodyPattern: string;
};

type RunState = {
  context: BrowserContext | null;
  page: Page | null;
  userDataDir: string;
  browserPath: string | null;
  browserClosed: boolean;
  browserClosedByConnector: boolean;
  connectorCompleted: boolean;
  headless: boolean;
  allowHeaded: boolean;
  hasResult: boolean;
  resultPath: string | null;
  cookies: Cookie[];
  legacyAuthTriggered: boolean;
};

class NeedsInputError extends Error {
  constructor() {
    super("Connector requires additional input.");
  }
}

class LegacyAuthError extends Error {
  constructor(method: "promptUser" | "showBrowser") {
    super(`${method} is not supported by the in-process runtime.`);
  }
}

function setupNetworkCapture(
  page: Page,
  networkCaptures: Map<string, NetworkCaptureConfig>,
  capturedResponses: Map<
    string,
    { url: string; data: unknown; timestamp: number }
  >,
  writeLog: (message: string) => void,
): void {
  page.on("response", async (response) => {
    const url = response.url();

    for (const [key, config] of networkCaptures.entries()) {
      if (config.urlPattern && !url.includes(config.urlPattern)) {
        continue;
      }

      try {
        const request = response.request();
        const postData = request.postData() || "";
        if (config.bodyPattern) {
          const patterns = config.bodyPattern.split("|");
          if (!patterns.some((pattern) => postData.includes(pattern))) {
            continue;
          }
        }

        const body = await response.json().catch(() => null);
        if (body) {
          capturedResponses.set(key, {
            url,
            data: body,
            timestamp: Date.now(),
          });
          writeLog(`[network] captured ${key} from ${url}`);
        }
      } catch {
        // Ignore non-JSON responses.
      }
    }
  });
}

async function reopenContext(
  runState: RunState,
  networkCaptures: Map<string, NetworkCaptureConfig>,
  capturedResponses: Map<
    string,
    { url: string; data: unknown; timestamp: number }
  >,
  headless: boolean,
  writeLog: (message: string) => void,
  pushEvent: (event: RuntimeEvent) => void,
  source: string,
  logPath: string,
): Promise<void> {
  if (runState.context && !runState.browserClosed) {
    runState.browserClosedByConnector = true;
    await runState.context.close().catch(() => {});
    runState.context = null;
    runState.page = null;
  }

  runState.browserClosed = false;
  runState.browserClosedByConnector = false;
  runState.headless = headless;
  runState.context = await launchPersistentContext(
    runState.userDataDir,
    headless,
    runState.browserPath,
  );
  runState.page =
    runState.context.pages()[0] || (await runState.context.newPage());

  runState.context.browser()?.on("disconnected", () => {
    runState.browserClosed = true;
    runState.context = null;
    runState.page = null;
    if (!runState.connectorCompleted && !runState.browserClosedByConnector) {
      pushEvent({
        type: "runtime-error",
        source,
        message: "Browser session ended before the connector completed.",
        logPath,
      });
    }
  });

  if (runState.page) {
    setupNetworkCapture(
      runState.page,
      networkCaptures,
      capturedResponses,
      writeLog,
    );
  }

  writeLog(
    `[browser] launched ${headless ? "headless" : "headed"} context at ${runState.userDataDir}`,
  );
}

async function ensureHeadedBrowser(
  runState: RunState,
  source: string,
  logPath: string,
  pushEvent: (event: RuntimeEvent) => void,
  writeLog: (message: string) => void,
  networkCaptures: Map<string, NetworkCaptureConfig>,
  capturedResponses: Map<
    string,
    { url: string; data: unknown; timestamp: number }
  >,
  url?: string,
): Promise<boolean> {
  if (!runState.allowHeaded) {
    writeLog(
      "[browser] headed interaction requested but prompting is disabled",
    );
    throw new LegacyAuthError(url ? "showBrowser" : "promptUser");
  }

  if (
    process.platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY
  ) {
    throw new Error(
      "This source needs a manual browser step, but no local display server is available. Run this command in a desktop session or use xvfb-run.",
    );
  }

  if (runState.headless || runState.browserClosed || !runState.context) {
    pushEvent({
      type: "headed-required",
      source,
      message:
        "This source needs a manual browser step. Opening a local browser session on this machine.",
      logPath,
      url,
    });
    await reopenContext(
      runState,
      networkCaptures,
      capturedResponses,
      false,
      writeLog,
      pushEvent,
      source,
      logPath,
    );
  }

  if (url && runState.page) {
    await runState.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  return true;
}

export function startInProcessConnectorRun({
  request,
  logPath,
}: {
  request: ConnectorRunRequest;
  logPath: string;
}): ConnectorRunHandle {
  const runId = `${path.basename(request.connectorPath, path.extname(request.connectorPath))}-${Date.now()}`;
  const pendingInputPath = path.join(
    os.homedir(),
    ".vana",
    `pending-input-${runId}.json`,
  );
  const responseInputPath = path.join(
    os.homedir(),
    ".vana",
    `input-response-${runId}.json`,
  );
  const logStream = fs.createWriteStream(logPath);
  const queue: RuntimeEvent[] = [];
  let resolveQueue: (() => void) | null = null;
  let settled = false;
  let activeContext: BrowserContext | null = null;
  let activeRunState: RunState | null = null;

  const flushQueue = () => {
    resolveQueue?.();
    resolveQueue = null;
  };

  const pushEvent = (event: RuntimeEvent) => {
    queue.push(event);
    flushQueue();
  };

  const writeLog = (message: string) => {
    logStream.write(`${message}\n`);
  };

  const runPromise = (async () => {
    pushEvent({
      type: "run-started",
      source: request.source,
      logPath,
    });

    const slug = path.basename(
      request.connectorPath,
      path.extname(request.connectorPath),
    );
    const runState: RunState = {
      context: null,
      page: null,
      userDataDir: getDefaultUserDataDir(slug),
      browserPath: null,
      browserClosed: false,
      browserClosedByConnector: false,
      connectorCompleted: false,
      headless: true,
      allowHeaded: !request.noInput,
      hasResult: false,
      resultPath: null,
      cookies: [],
      legacyAuthTriggered: false,
    };
    activeRunState = runState;

    if (request.signal) {
      request.signal.addEventListener("abort", () => {
        void runState.context?.close().catch(() => {});
      });
    }

    try {
      const connectorCode = await fsp.readFile(request.connectorPath, "utf8");

      // Skip browser launch for demo/fixture connectors that don't need it.
      // VANA_DEMO_FAST_SUCCESS connectors only use page.setData/setProgress/return.
      const skipBrowser = process.env.VANA_DEMO_FAST_SUCCESS === "1";

      if (!skipBrowser) {
        runState.browserPath = resolveBrowserPath();
        writeLog(`[runtime] Using browser: ${runState.browserPath}`);

        const markerFile = path.join(runState.userDataDir, ".cookies-imported");
        if (
          isSystemChrome(runState.browserPath) &&
          !fs.existsSync(markerFile)
        ) {
          writeLog(
            "[runtime] Initializing browser profile before cookie import",
          );
          const tempContext = await launchPersistentContext(
            runState.userDataDir,
            true,
            runState.browserPath,
          );
          await tempContext.close();
          importChromeCookies(runState.userDataDir, runState.browserPath);
        }

        await reopenContext(
          runState,
          new Map<string, NetworkCaptureConfig>(),
          new Map<string, { url: string; data: unknown; timestamp: number }>(),
          true,
          writeLog,
          pushEvent,
          request.source,
          logPath,
        );
        activeContext = runState.context;
      }

      const pageApi = createPageApi({
        request,
        runState,
        logPath,
        pendingInputPath,
        responseInputPath,
        pushEvent,
        writeLog,
      });

      if (!skipBrowser) {
        await runState.page?.goto("about:blank", {
          waitUntil: "domcontentloaded",
        });
      }
      const connectorFunction = buildConnectorFunction(connectorCode);
      const result = await connectorFunction.call(null, pageApi);

      if (!runState.hasResult && result != null) {
        const exportData =
          result &&
          typeof result === "object" &&
          "success" in result &&
          "data" in result
            ? (result as { data: unknown }).data
            : result;
        const resultPath = getSourceResultPath(request.source);
        await ensureParentDir(resultPath);
        await rotateResult(request.source);
        await fsp.writeFile(
          resultPath,
          `${JSON.stringify(exportData, null, 2)}\n`,
          "utf8",
        );
        pushEvent({
          type: "collection-complete",
          source: request.source,
          resultPath,
          logPath,
        });
        runState.hasResult = true;
        runState.resultPath = resultPath;
      }

      runState.connectorCompleted = true;
      if (!runState.browserClosed && runState.context) {
        await runState.context.close().catch(() => {});
      }
    } catch (error) {
      if (error instanceof NeedsInputError) {
        return;
      }

      pushEvent(classifyRuntimeError(error, request.source, logPath));
    } finally {
      settled = true;
      activeContext = runState.context;
      await activeContext?.close().catch(() => {});
      logStream.end();
      flushQueue();
    }
  })();

  return {
    source: request.source,
    logPath,
    async *events(): AsyncGenerator<RuntimeEvent, void, void> {
      try {
        while (!settled || queue.length > 0) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              resolveQueue = resolve;
            });
            continue;
          }

          yield queue.shift() as RuntimeEvent;
        }
      } finally {
        await runPromise.catch(() => {});
      }
    },
    stop() {
      void (activeRunState?.context ?? activeContext)?.close().catch(() => {});
      if (!settled) {
        pushEvent({
          type: "runtime-error",
          source: request.source,
          message: "Connector run stopped.",
          logPath,
        });
      }
    },
  };
}

function buildConnectorFunction(
  connectorCode: string,
): (page: unknown) => Promise<unknown> {
  let modifiedCode = connectorCode;
  const iifePattern = /\n\(async\s*\(\)\s*=>\s*\{/g;
  const matches = [...modifiedCode.matchAll(iifePattern)];

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    modifiedCode =
      modifiedCode.slice(0, lastMatch.index) +
      "\nreturn (async () => {" +
      modifiedCode.slice(lastMatch.index + lastMatch[0].length);
  }

  const AsyncFunction = Object.getPrototypeOf(async function () {})
    .constructor as new (
    ...args: string[]
  ) => (page: unknown) => Promise<unknown>;
  return new AsyncFunction("page", modifiedCode);
}

function createPageApi({
  request,
  runState,
  logPath,
  pendingInputPath,
  responseInputPath,
  pushEvent,
  writeLog,
}: {
  request: ConnectorRunRequest;
  runState: RunState;
  logPath: string;
  pendingInputPath: string;
  responseInputPath: string;
  pushEvent: (event: RuntimeEvent) => void;
  writeLog: (message: string) => void;
}) {
  const networkCaptures = new Map<string, NetworkCaptureConfig>();
  const capturedResponses = new Map<
    string,
    { url: string; data: unknown; timestamp: number }
  >();

  function requirePage(): Page {
    if (runState.browserClosed || !runState.page) {
      throw new Error(
        "Browser is closed. Use page.httpFetch() for HTTP requests.",
      );
    }
    return runState.page;
  }

  if (runState.page) {
    setupNetworkCapture(
      runState.page,
      networkCaptures,
      capturedResponses,
      writeLog,
    );
  }

  return {
    goto: async (
      url: string,
      options: {
        waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
        timeout?: number;
      } = {},
    ) => {
      const page = requirePage();
      const gotoOptions: Parameters<Page["goto"]>[1] = {
        waitUntil: options.waitUntil ?? "domcontentloaded",
      };
      if (options.timeout != null) {
        gotoOptions.timeout = options.timeout;
      }
      writeLog(`[page] goto ${url}`);
      await page.goto(url, gotoOptions);
    },

    evaluate: async (script: string) => {
      return requirePage().evaluate(script);
    },

    screenshot: async () => {
      const buffer = await requirePage().screenshot({
        type: "jpeg",
        quality: 70,
        timeout: 5000,
      });
      return buffer.toString("base64");
    },

    requestInput: async (payload: PendingInputRequest) => {
      const fields = Object.keys(payload.schema?.properties ?? {});
      const inputRequest: RuntimeInputRequest = {
        message: payload.message ?? "Additional input is required.",
        schema: payload.schema,
        fields,
        responseInputPath,
      };

      if (request.noInput) {
        // --no-input mode: fail immediately
        await writePendingInput({
          pendingInputPath,
          responseInputPath,
          message: inputRequest.message ?? "Additional input is required.",
          schema: inputRequest.schema,
        });
        pushEvent({
          type: "needs-input",
          source: request.source,
          message: inputRequest.message ?? "Additional input is required.",
          fields: inputRequest.fields,
          schema: inputRequest.schema,
          pendingInputPath,
          responseInputPath,
          logPath,
        });
        throw new NeedsInputError();
      }

      if (!request.onNeedInput) {
        // IPC mode: write question file, emit event, poll for answer.
        // An external agent reads the pending file, collects input from
        // the user, and writes the response file.
        await writePendingInput({
          pendingInputPath,
          responseInputPath,
          message: inputRequest.message ?? "Additional input is required.",
          schema: inputRequest.schema,
        });
        pushEvent({
          type: "needs-input",
          source: request.source,
          message: inputRequest.message ?? "Additional input is required.",
          fields: inputRequest.fields,
          schema: inputRequest.schema,
          pendingInputPath,
          responseInputPath,
          logPath,
        });

        const response = await pollForInputResponse(
          responseInputPath,
          1_800_000,
        ); // 30 min timeout
        await fsp.rm(pendingInputPath, { force: true });
        return response;
      }

      const input = await request.onNeedInput(inputRequest);
      await ensureParentDir(responseInputPath);
      await fsp.writeFile(
        responseInputPath,
        `${JSON.stringify(input)}\n`,
        "utf8",
      );
      await fsp.rm(pendingInputPath, { force: true });
      return input;
    },

    requestData: async (payload: PendingInputRequest) => {
      if (request.noInput) {
        writeLog("[page] requestData skipped (no-input mode)");
        return { status: "skipped" as const, reason: "no-input" as const };
      }

      const fields = Object.keys(payload.schema?.properties ?? {});
      const inputRequest: RuntimeInputRequest = {
        message: payload.message ?? "Additional input is required.",
        schema: payload.schema,
        fields,
        responseInputPath,
      };

      if (!request.onNeedInput) {
        await writePendingInput({
          pendingInputPath,
          responseInputPath,
          message: inputRequest.message ?? "Additional input is required.",
          schema: inputRequest.schema,
        });
        pushEvent({
          type: "needs-input",
          source: request.source,
          message: inputRequest.message ?? "Additional input is required.",
          fields: inputRequest.fields,
          schema: inputRequest.schema,
          pendingInputPath,
          responseInputPath,
          logPath,
        });
        const response = await pollForInputResponse(
          responseInputPath,
          1_800_000,
        );
        await fsp.rm(pendingInputPath, { force: true });
        return { status: "success" as const, data: response };
      }

      const input = await request.onNeedInput(inputRequest);
      await ensureParentDir(responseInputPath);
      await fsp.writeFile(
        responseInputPath,
        `${JSON.stringify(input)}\n`,
        "utf8",
      );
      await fsp.rm(pendingInputPath, { force: true });
      return { status: "success" as const, data: input };
    },

    requestManualAction: async (
      message: string,
      checkFn: () => Promise<unknown>,
      options?: {
        url?: string;
        interval?: number;
        autoGoHeadless?: boolean;
      },
    ) => {
      const { url, interval = 2000, autoGoHeadless = true } = options ?? {};

      if (request.noInput) {
        writeLog("[page] requestManualAction skipped (no-input mode)");
        return { status: "skipped" as const, reason: "no-input" as const };
      }

      await ensureHeadedBrowser(
        runState,
        request.source,
        logPath,
        pushEvent,
        writeLog,
        networkCaptures,
        capturedResponses,
        url,
      );
      pushEvent({
        type: "headed-required",
        source: request.source,
        message,
        logPath,
        url: url ?? runState.page?.url(),
      });

      writeLog(`[page] requestManualAction: ${message}`);
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, interval));
        if (
          request.signal?.aborted ||
          runState.browserClosed ||
          !runState.page
        ) {
          throw new Error(
            "Browser session ended before manual interaction completed.",
          );
        }
        try {
          const result = await checkFn();
          if (result) {
            writeLog("[page] Manual action completed");
            break;
          }
        } catch {
          // Keep waiting until the connector's condition passes.
        }
      }

      if (autoGoHeadless) {
        await reopenContext(
          runState,
          networkCaptures,
          capturedResponses,
          true,
          writeLog,
          pushEvent,
          request.source,
          logPath,
        );
        if (runState.page) {
          await runState.page.goto("about:blank", {
            waitUntil: "domcontentloaded",
          });
        }
      }

      return { status: "success" as const };
    },

    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),

    setData: async (key: string, value: unknown) => {
      if (key === "status" && typeof value === "string") {
        pushEvent({
          type: "status-update",
          source: request.source,
          logPath,
          message: value,
        });
      }
      if (key === "result") {
        if (!runState.hasResult) {
          const resultPath = getSourceResultPath(request.source);
          await ensureParentDir(resultPath);
          await rotateResult(request.source);
          await fsp.writeFile(
            resultPath,
            `${JSON.stringify(value, null, 2)}\n`,
            "utf8",
          );
          runState.hasResult = true;
          runState.resultPath = resultPath;
          pushEvent({
            type: "collection-complete",
            source: request.source,
            resultPath,
            logPath,
          });
        }
      }
      writeLog(
        `[data] ${key}=${typeof value === "string" ? value : JSON.stringify(value)}`,
      );
    },

    setProgress: async ({
      phase,
      message,
      count,
    }: {
      phase?: unknown;
      message?: string;
      count?: number;
    }) => {
      pushEvent({
        type: "progress-update",
        source: request.source,
        logPath,
        phase,
        message,
        count,
      });
      writeLog(
        `[progress] ${JSON.stringify({
          phase,
          message,
          count,
        })}`,
      );
    },

    promptUser: async (
      message: string,
      checkFn: () => Promise<unknown>,
      interval = 2000,
    ) => {
      writeLog(`[prompt] ${message}`);
      if (request.noInput) {
        if (!runState.legacyAuthTriggered) {
          pushEvent({
            type: "legacy-auth",
            source: request.source,
            message:
              "This source needs a manual browser step, but prompting is disabled in --no-input mode.",
            logPath,
          });
        }
        runState.legacyAuthTriggered = true;
        return;
      }

      await ensureHeadedBrowser(
        runState,
        request.source,
        logPath,
        pushEvent,
        writeLog,
        networkCaptures,
        capturedResponses,
        runState.page?.url(),
      );
      pushEvent({
        type: "headed-required",
        source: request.source,
        message,
        logPath,
        url: runState.page?.url(),
      });

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, interval));
        if (
          request.signal?.aborted ||
          runState.browserClosed ||
          !runState.page
        ) {
          throw new Error(
            "Browser session ended before manual interaction completed.",
          );
        }
        try {
          const result = await checkFn();
          if (result) {
            writeLog("[prompt] User action completed");
            return;
          }
        } catch {
          // Keep waiting until the connector's condition passes.
        }
      }
    },

    captureNetwork: async (config: {
      key: string;
      urlPattern?: string;
      bodyPattern?: string;
    }) => {
      networkCaptures.set(config.key, {
        urlPattern: config.urlPattern || "",
        bodyPattern: config.bodyPattern || "",
      });
    },

    getCapturedResponse: async (key: string) => {
      return capturedResponses.get(key) ?? null;
    },

    clearNetworkCaptures: async () => {
      networkCaptures.clear();
      capturedResponses.clear();
    },

    hasCapturedResponse: (key: string) => capturedResponses.has(key),

    closeBrowser: async () => {
      if (runState.browserClosed) {
        return;
      }

      if (runState.context) {
        try {
          runState.cookies = await runState.context.cookies();
        } catch {
          runState.cookies = [];
        }
      }

      runState.browserClosed = true;
      runState.browserClosedByConnector = true;
      await runState.context?.close().catch(() => {});
      runState.context = null;
      runState.page = null;
      writeLog("[browser] closed by connector");
    },

    showBrowser: async (url?: string) => {
      if (request.noInput) {
        if (!runState.legacyAuthTriggered) {
          pushEvent({
            type: "legacy-auth",
            source: request.source,
            message:
              "This source needs a manual browser step, but prompting is disabled in --no-input mode.",
            logPath,
          });
        }
        runState.legacyAuthTriggered = true;
        return { headed: false };
      }

      await ensureHeadedBrowser(
        runState,
        request.source,
        logPath,
        pushEvent,
        writeLog,
        networkCaptures,
        capturedResponses,
        url,
      );
      return { headed: true };
    },

    goHeadless: async () => {
      await reopenContext(
        runState,
        networkCaptures,
        capturedResponses,
        true,
        writeLog,
        pushEvent,
        request.source,
        logPath,
      );
      if (runState.page) {
        await runState.page.goto("about:blank", {
          waitUntil: "domcontentloaded",
        });
      }
    },

    httpFetch: async (
      url: string,
      options: RequestInit & { timeout?: number } = {},
    ) => {
      const { timeout = 30000, ...fetchOptions } = options;
      if (runState.cookies.length > 0) {
        try {
          const urlObject = new URL(url);
          const relevantCookies = runState.cookies
            .filter((cookie) => {
              const cookieDomain = cookie.domain.startsWith(".")
                ? cookie.domain.slice(1)
                : cookie.domain;
              return (
                urlObject.hostname === cookieDomain ||
                urlObject.hostname.endsWith(`.${cookieDomain}`)
              );
            })
            .map((cookie) => `${cookie.name}=${cookie.value}`)
            .join("; ");
          if (relevantCookies) {
            fetchOptions.headers = {
              ...(fetchOptions.headers || {}),
              cookie: relevantCookies,
            };
          }
        } catch {
          // Ignore cookie injection failures.
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const text = await response.text();
        let json: unknown = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        return {
          ok: response.ok,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          text,
          json,
          error: null,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        return {
          ok: false,
          status: 0,
          headers: {},
          text: "",
          json: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

function classifyRuntimeError(
  error: unknown,
  source: string,
  logPath: string,
): RuntimeEvent {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("showBrowser") || message.includes("promptUser")) {
    return {
      type: "legacy-auth",
      source,
      message:
        "This source needs a manual browser step, but prompting is disabled in --no-input mode.",
      logPath,
    };
  }

  if (
    message.includes("Missing X server or $DISPLAY") ||
    message.includes("headed browser without having a XServer running")
  ) {
    return {
      type: "runtime-error",
      source,
      message:
        "This source needs a manual browser step, but no local display server is available. Run this command in a desktop session or use xvfb-run.",
      logPath,
    };
  }

  return {
    type: "runtime-error",
    source,
    message,
    logPath,
  };
}

async function pollForInputResponse(
  responsePath: string,
  timeoutMs: number,
): Promise<Record<string, string>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const content = await fsp.readFile(responsePath, "utf8");
      const parsed = JSON.parse(content) as Record<string, string>;
      await fsp.rm(responsePath, { force: true });
      return parsed;
    } catch {
      // File doesn't exist yet, keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new NeedsInputError();
}

async function writePendingInput({
  pendingInputPath,
  responseInputPath,
  message,
  schema,
}: {
  pendingInputPath: string;
  responseInputPath: string;
  message: string;
  schema?: {
    properties?: Record<string, unknown>;
  };
}): Promise<void> {
  await ensureParentDir(pendingInputPath);
  await fsp.writeFile(
    pendingInputPath,
    `${JSON.stringify(
      {
        message,
        schema: schema ?? {},
        responseInputPath,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
