import fs from "node:fs";
import fsp from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import * as sea from "node:sea";

import {
  ensureParentDir,
  getLastResultPath,
  getRunnerDir,
} from "../../core/index.js";
import type {
  ConnectorRunHandle,
  ConnectorRunRequest,
  RuntimeEvent,
  RuntimeInputRequest,
} from "../core/index.js";

export function startChildProcessConnectorRun({
  request,
  runnerDir,
  logPath,
}: {
  request: ConnectorRunRequest;
  runnerDir?: string;
  logPath: string;
}): ConnectorRunHandle {
  const activeRunnerDir = runnerDir ?? getRunnerDir();
  const child = spawn(getNodeCommand(), ["index.cjs"], {
    cwd: activeRunnerDir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const logStream = fs.createWriteStream(logPath);
  const runId = `${path.basename(request.connectorPath, path.extname(request.connectorPath))}-${Date.now()}`;
  const pendingInputPath = path.join(
    os.homedir(),
    ".dataconnect",
    `pending-input-${runId}.json`,
  );
  const responseInputPath = path.join(
    os.homedir(),
    ".dataconnect",
    `input-response-${runId}.json`,
  );
  let stopRequested = false;

  if (request.signal) {
    request.signal.addEventListener("abort", () => {
      child.kill("SIGTERM");
    });
  }

  async function* events(): AsyncGenerator<RuntimeEvent, void, void> {
    let stdoutBuffer = "";
    let settled = false;
    let started = false;
    let terminalEventSeen = false;
    const queue: RuntimeEvent[] = [];
    let resolveQueue: (() => void) | null = null;

    const flushQueue = () => {
      resolveQueue?.();
      resolveQueue = null;
    };

    const pushEvent = (event: RuntimeEvent) => {
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
        if (parsed.type === "ready") {
          started = true;
          writeChildCommand(child, {
            type: "run",
            runId,
            connectorPath: path.resolve(request.connectorPath),
            url: "about:blank",
            headless: true,
            allowHeaded: false,
          });
          continue;
        }

        if (parsed.type === "need-input") {
          const schema = parsed.schema as
            | { properties?: Record<string, unknown> }
            | undefined;
          const inputRequest: RuntimeInputRequest = {
            message:
              typeof parsed.message === "string"
                ? parsed.message
                : "Additional input is required.",
            schema,
            fields: Object.keys(
              (schema?.properties ?? {}) as Record<string, unknown>,
            ),
            responseInputPath,
          };

          if (request.noInput || !request.onNeedInput) {
            await writePendingInput({
              pendingInputPath,
              responseInputPath,
              message: inputRequest.message ?? "Additional input is required.",
              schema: inputRequest.schema,
            });
            stopRequested = true;
            child.kill("SIGTERM");
            pushEvent({
              type: "needs-input",
              source: request.source,
              message: inputRequest.message ?? "Additional input is required.",
              fields: inputRequest.fields,
              schema: inputRequest.schema,
              responseInputPath,
              logPath,
            });
            continue;
          }

          const input = await request.onNeedInput(inputRequest);
          await ensureParentDir(responseInputPath);
          await fsp.writeFile(
            responseInputPath,
            `${JSON.stringify(input)}\n`,
            "utf8",
          );
          await fsp.rm(pendingInputPath, { force: true });
          continue;
        }

        if (parsed.type === "result") {
          terminalEventSeen = true;
          const resultPath = getLastResultPath();
          await ensureParentDir(resultPath);
          await fsp.writeFile(
            resultPath,
            `${JSON.stringify(parsed.data ?? null, null, 2)}\n`,
            "utf8",
          );
          pushEvent({
            type: "collection-complete",
            source: request.source,
            resultPath,
            logPath,
          });
          continue;
        }

        if (parsed.type === "legacy-auth") {
          terminalEventSeen = true;
          pushEvent({
            type: "legacy-auth",
            source: request.source,
            message:
              typeof parsed.message === "string"
                ? parsed.message
                : "This connector requires legacy headed authentication.",
            logPath,
          });
          continue;
        }

        if (parsed.type === "error") {
          terminalEventSeen = true;
          if (isLegacyAuthMessage(parsed.message)) {
            pushEvent({
              type: "legacy-auth",
              source: request.source,
              message:
                "This connector uses legacy authentication (showBrowser/promptUser) which is not supported in batch mode. Either use a migrated connector that supports requestInput, or establish a session manually first.",
              logPath,
            });
            continue;
          }
          pushEvent({
            type: "runtime-error",
            source: request.source,
            message:
              typeof parsed.message === "string"
                ? parsed.message
                : "Connector run failed.",
            logPath,
          });
          continue;
        }

        if (
          parsed.type === "request-input" &&
          typeof parsed.requestId === "string" &&
          parsed.payload &&
          typeof parsed.payload === "object"
        ) {
          const payload = parsed.payload as {
            message?: string;
            schema?: { properties?: Record<string, unknown> };
          };
          const inputRequest: RuntimeInputRequest = {
            message: payload.message ?? "Additional input is required.",
            schema: payload.schema,
            fields: Object.keys(payload.schema?.properties ?? {}),
            responseInputPath,
          };

          if (request.noInput || !request.onNeedInput) {
            await writePendingInput({
              pendingInputPath,
              responseInputPath,
              message: inputRequest.message ?? "Additional input is required.",
              schema: inputRequest.schema,
            });
            stopRequested = true;
            pushEvent({
              type: "needs-input",
              source: request.source,
              message: inputRequest.message ?? "Additional input is required.",
              fields: inputRequest.fields,
              schema: inputRequest.schema,
              responseInputPath,
              logPath,
            });
            child.kill("SIGTERM");
            continue;
          }

          const input = await request.onNeedInput(inputRequest);
          await ensureParentDir(responseInputPath);
          await fsp.writeFile(
            responseInputPath,
            `${JSON.stringify(input)}\n`,
            "utf8",
          );
          writeChildCommand(child, {
            type: "input-response",
            runId,
            requestId: parsed.requestId,
            data: input,
          });
        }
      }
    });

    child.on("close", (code) => {
      settled = true;
      logStream.end();
      if (!terminalEventSeen && !stopRequested && started && code !== 0) {
        pushEvent({
          type: "runtime-error",
          source: request.source,
          message: "Connector run failed.",
          logPath,
        });
      }
      flushQueue();
    });

    pushEvent({
      type: "run-started",
      source: request.source,
      logPath,
    });

    while (!settled || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          resolveQueue = resolve;
        });
        continue;
      }
      yield queue.shift() as RuntimeEvent;
    }
  }

  return {
    source: request.source,
    logPath,
    events,
    stop() {
      stopRequested = true;
      child.kill("SIGTERM");
    },
  };
}

function getNodeCommand(): string {
  if (!sea.isSea()) {
    return process.execPath;
  }

  return process.env.VANA_NODE_BIN || "node";
}

function writeChildCommand(
  child: ReturnType<typeof spawn>,
  payload: Record<string, unknown>,
): void {
  if (!child.stdin) {
    throw new Error("Runner stdin is not available.");
  }

  child.stdin.write(`${JSON.stringify(payload)}\n`);
}

function isLegacyAuthMessage(message: unknown): boolean {
  return (
    typeof message === "string" &&
    (message.includes("showBrowser") || message.includes("promptUser"))
  );
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
