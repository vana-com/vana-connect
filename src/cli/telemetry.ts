import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getTelemetryOutboxDir,
  readCliConfig,
  updateCliConfig,
} from "../core/index.js";
import type {
  CliChannel,
  CliEvent,
  CliInstallMethod,
  CliOutcome,
} from "../core/cli-types.js";

const TELEMETRY_ENDPOINT = "https://telemetry.opendatalabs.com/v1/cli/events";
const MAX_EVENTS_PER_BATCH = 100;
const MAX_BATCH_BYTES = 64 * 1024;
const MAX_FILES_PER_FLUSH = 10;
const FLUSH_TIMEOUT_MS = 1500;
const EVENT_VERSION = 1;

type TelemetryMode = "normal" | "disabled" | "debug" | "local_only";
type TelemetryReason =
  | "default"
  | "config_enabled"
  | "config_disabled"
  | "env_disabled"
  | "env_debug"
  | "local_only";

type TelemetryMetadata = Record<string, string | number | boolean | null>;

export interface TelemetryCommandContext {
  command: string;
  subcommand?: string;
  source?: string;
  cliVersion: string;
  channel: CliChannel;
  installMethod: CliInstallMethod;
  options: {
    json: boolean;
    noInput: boolean;
    quiet: boolean;
    detach: boolean;
    ipc: boolean;
  };
  localOnly?: boolean;
}

export interface TelemetryStatus {
  enabled: boolean;
  mode: "normal" | "disabled" | "debug";
  reason: TelemetryReason;
  installId: string;
  endpoint: string;
  queuedBatches: number;
}

interface ResolvedTelemetryState {
  enabled: boolean;
  mode: TelemetryMode;
  reason: TelemetryReason;
  endpoint: string;
  installId: string;
  queuedBatches: number;
}

interface TelemetryStoredEvent {
  eventId: string;
  eventVersion: number;
  timestamp: string;
  installId: string;
  runId: string;
  eventName: string;
  command: string;
  subcommand: string | null;
  source: string | null;
  connectorVersion: string | null;
  authMode: string | null;
  platform: string;
  os: string;
  arch: string;
  cliVersion: string;
  channel: CliChannel;
  installMethod: CliInstallMethod;
  ci: boolean;
  agent: boolean;
  interactive: boolean;
  outcome: string | null;
  errorClass: string | null;
  durationMs: number | null;
  storedScopeCount: number | null;
  failedScopeCount: number | null;
  metadata: TelemetryMetadata | null;
}

interface TelemetryEnvelope {
  batchId: string;
  sentAt: string;
  client: {
    name: "vana-cli";
    version: string;
  };
  events: TelemetryStoredEvent[];
}

interface CommandResult {
  exitCode: number;
  outcome?: string | null;
  errorClass?: string | null;
}

export interface CliTelemetrySession {
  trackCliEvent(event: CliEvent | CliOutcome): void;
  trackCustomEvent(
    eventName: string,
    patch?: Partial<TelemetryStoredEvent>,
  ): void;
  markCommandResult(result: CommandResult): void;
  persist(): Promise<void>;
  flush(): Promise<void>;
}

let activeSession: CliTelemetrySession | null = null;

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getEndpoint() {
  return process.env.VANA_TELEMETRY_URL?.trim() || TELEMETRY_ENDPOINT;
}

function getInteractive(options: TelemetryCommandContext["options"]) {
  return Boolean(
    process.stdin.isTTY && process.stdout.isTTY && !options.noInput,
  );
}

function sanitizeMetadata(metadata?: TelemetryMetadata | null) {
  if (!metadata) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(metadata).slice(0, 16),
  ) as TelemetryMetadata;
}

function countScopeResults(
  scopeResults?: Array<{ status: "stored" | "failed"; scope: string }>,
) {
  return {
    storedScopeCount:
      scopeResults?.filter((item) => item.status === "stored").length ?? null,
    failedScopeCount:
      scopeResults?.filter((item) => item.status === "failed").length ?? null,
  };
}

function classifyError(reason?: string | null) {
  const value = (reason ?? "").toLowerCase();
  if (!value) return null;
  if (value.includes("setup_declined")) return "setup_declined";
  if (value.includes("setup_required")) return "setup_required";
  if (value.includes("source_required")) return "source_required";
  if (value.includes("prompt_cancelled")) return "prompt_cancelled";
  if (value.includes("auth")) return "auth_failed";
  if (value.includes("needs input")) return "needs_input";
  if (value.includes("legacy")) return "legacy_auth";
  if (value.includes("personal_server_unavailable"))
    return "personal_server_unavailable";
  if (value.includes("ingest")) return "ingest_failed";
  if (value.includes("connector")) return "connector_unavailable";
  if (value.includes("runtime")) return "runtime_error";
  return "unknown";
}

function mapCliEventToTelemetry(event: CliEvent | CliOutcome): {
  eventName: string;
  patch?: Partial<TelemetryStoredEvent>;
} | null {
  switch (event.type) {
    case "setup-check":
      return {
        eventName: "runtime_check_completed",
        patch: {
          metadata: sanitizeMetadata({ runtime: event.runtime ?? null }),
        },
      };
    case "setup-complete":
      return {
        eventName: "runtime_install_completed",
        patch: {
          metadata: sanitizeMetadata({ runtime: event.runtime ?? null }),
        },
      };
    case "connector-resolved":
      return { eventName: "connector_resolved" };
    case "needs-input":
      return {
        eventName: "input_required",
        patch: {
          errorClass: "needs_input",
          metadata: sanitizeMetadata({ fieldCount: event.fields?.length ?? 0 }),
        },
      };
    case "legacy-auth":
      return {
        eventName: "legacy_auth_required",
        patch: { errorClass: "legacy_auth" },
      };
    case "collection-complete":
      return { eventName: "collection_completed" };
    case "runtime-error":
      return {
        eventName: "collection_failed",
        patch: { errorClass: classifyError(event.message) ?? "runtime_error" },
      };
    case "ingest-started":
      return { eventName: "ingest_started" };
    case "ingest-complete":
      return {
        eventName: "ingest_completed",
        patch: countScopeResults(event.scopeResults),
      };
    case "ingest-partial":
      return {
        eventName: "ingest_partial",
        patch: {
          ...countScopeResults(event.scopeResults),
          errorClass: "ingest_failed",
        },
      };
    case "ingest-failed":
      return {
        eventName: "ingest_failed",
        patch: {
          ...countScopeResults(event.scopeResults),
          errorClass: "ingest_failed",
        },
      };
    case "ingest-skipped":
      return {
        eventName: "ingest_skipped",
        patch: {
          errorClass: classifyError(event.reason) ?? null,
          metadata: sanitizeMetadata({ reason: event.reason ?? null }),
        },
      };
    case "outcome":
    case "progress-update":
    case "status-update":
    case "headed-required":
    case "jpeg":
      return null;
  }

  return null;
}

async function ensureOutboxDir() {
  await fs.mkdir(getTelemetryOutboxDir(), { recursive: true });
}

async function listOutboxFiles() {
  try {
    const dirents = await fs.readdir(getTelemetryOutboxDir(), {
      withFileTypes: true,
    });
    return dirents
      .filter(
        (entry: { isFile(): boolean; name: string }) =>
          entry.isFile() && entry.name.endsWith(".json"),
      )
      .map((entry: { name: string }) =>
        path.join(getTelemetryOutboxDir(), entry.name),
      )
      .sort();
  } catch {
    return [];
  }
}

async function countQueuedBatches() {
  return (await listOutboxFiles()).length;
}

async function ensureTelemetryInstallId() {
  const config = await readCliConfig();
  if (config.telemetryInstallId) {
    return config.telemetryInstallId;
  }

  const installId = randomId("inst");
  await updateCliConfig({ telemetryInstallId: installId });
  return installId;
}

async function resolveTelemetryState(
  localOnly = false,
): Promise<ResolvedTelemetryState> {
  const config = await readCliConfig();
  const installId = await ensureTelemetryInstallId();
  const queuedBatches = await countQueuedBatches();

  if (localOnly) {
    return {
      enabled: false,
      mode: "local_only",
      reason: "local_only",
      endpoint: getEndpoint(),
      installId,
      queuedBatches,
    };
  }

  if (process.env.VANA_TELEMETRY_DEBUG === "1") {
    return {
      enabled: true,
      mode: "debug",
      reason: "env_debug",
      endpoint: getEndpoint(),
      installId,
      queuedBatches,
    };
  }

  if (process.env.VANA_TELEMETRY_DISABLED === "1") {
    return {
      enabled: false,
      mode: "disabled",
      reason: "env_disabled",
      endpoint: getEndpoint(),
      installId,
      queuedBatches,
    };
  }

  if (config.telemetryEnabled === false) {
    return {
      enabled: false,
      mode: "disabled",
      reason: "config_disabled",
      endpoint: getEndpoint(),
      installId,
      queuedBatches,
    };
  }

  return {
    enabled: true,
    mode: "normal",
    reason: config.telemetryEnabled ? "config_enabled" : "default",
    endpoint: getEndpoint(),
    installId,
    queuedBatches,
  };
}

function createEventFactory(
  context: TelemetryCommandContext,
  state: ResolvedTelemetryState,
) {
  const runId = randomId("run");
  const base = {
    installId: state.installId,
    runId,
    command: context.command,
    subcommand: context.subcommand ?? null,
    source: context.source ?? null,
    connectorVersion: null,
    authMode: null,
    platform: `${process.platform}-${os.arch()}`,
    os: process.platform,
    arch: os.arch(),
    cliVersion: context.cliVersion,
    channel: context.channel,
    installMethod: context.installMethod,
    ci: Boolean(process.env.CI),
    agent: Boolean(process.env.AGENT),
    interactive: getInteractive(context.options),
  } satisfies Omit<
    TelemetryStoredEvent,
    | "eventId"
    | "eventVersion"
    | "timestamp"
    | "eventName"
    | "outcome"
    | "errorClass"
    | "durationMs"
    | "storedScopeCount"
    | "failedScopeCount"
    | "metadata"
  >;

  return (
    eventName: string,
    patch: Partial<TelemetryStoredEvent> = {},
  ): TelemetryStoredEvent => ({
    eventId: randomId("evt"),
    eventVersion: EVENT_VERSION,
    timestamp: nowIso(),
    eventName,
    ...base,
    ...patch,
    outcome: patch.outcome ?? null,
    errorClass: patch.errorClass ?? null,
    durationMs: patch.durationMs ?? null,
    storedScopeCount: patch.storedScopeCount ?? null,
    failedScopeCount: patch.failedScopeCount ?? null,
    metadata: sanitizeMetadata(patch.metadata),
  });
}

function splitIntoEnvelopes(
  events: TelemetryStoredEvent[],
  cliVersion: string,
) {
  const envelopes: TelemetryEnvelope[] = [];
  let current: TelemetryStoredEvent[] = [];

  const flushCurrent = () => {
    if (current.length === 0) {
      return;
    }
    envelopes.push({
      batchId: randomId("batch"),
      sentAt: nowIso(),
      client: { name: "vana-cli", version: cliVersion },
      events: current,
    });
    current = [];
  };

  for (const event of events) {
    current.push(event);
    const candidate = {
      batchId: "batch_candidate",
      sentAt: nowIso(),
      client: { name: "vana-cli" as const, version: cliVersion },
      events: current,
    };
    const tooManyEvents = current.length > MAX_EVENTS_PER_BATCH;
    const tooLarge =
      Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_BATCH_BYTES;
    if (tooManyEvents || tooLarge) {
      const overflow = current.pop();
      flushCurrent();
      if (overflow) {
        current.push(overflow);
      }
    }
  }

  flushCurrent();
  return envelopes;
}

async function writeEnvelope(envelope: TelemetryEnvelope, runId: string) {
  await ensureOutboxDir();
  const filename = `${Date.now()}-${process.pid}-${runId}-${crypto.randomUUID()}.json`;
  const outboxPath = path.join(getTelemetryOutboxDir(), filename);
  await fs.writeFile(outboxPath, `${JSON.stringify(envelope)}\n`, "utf8");
}

export async function flushTelemetryOutbox() {
  const state = await resolveTelemetryState();
  if (!state.enabled || state.mode !== "normal") {
    return;
  }

  const files = (await listOutboxFiles()).slice(0, MAX_FILES_PER_FLUSH);
  for (const filePath of files) {
    let contents: string;
    try {
      contents = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    try {
      const response = await fetch(state.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `vana-cli/${JSON.parse(contents).client?.version ?? "unknown"}`,
        },
        body: contents,
        signal: AbortSignal.timeout(FLUSH_TIMEOUT_MS),
      });
      if (response.status === 202) {
        await fs.rm(filePath, { force: true });
      }
    } catch {
      // Keep file in outbox for retry.
    }
  }
}

export async function getTelemetryStatus(): Promise<TelemetryStatus> {
  const state = await resolveTelemetryState();
  return {
    enabled: state.enabled,
    mode: state.mode === "local_only" ? "disabled" : state.mode,
    reason: state.reason,
    installId: state.installId,
    endpoint: state.endpoint,
    queuedBatches: state.queuedBatches,
  };
}

export async function setTelemetryEnabled(enabled: boolean) {
  await updateCliConfig({ telemetryEnabled: enabled });
}

export function setActiveTelemetrySession(session: CliTelemetrySession | null) {
  activeSession = session;
}

export function getActiveTelemetrySession() {
  return activeSession;
}

export function trackActiveTelemetryEvent(
  eventName: string,
  patch?: Partial<TelemetryStoredEvent>,
) {
  activeSession?.trackCustomEvent(eventName, patch);
}

export async function createCliTelemetrySession(
  context: TelemetryCommandContext,
): Promise<CliTelemetrySession> {
  const state = await resolveTelemetryState(Boolean(context.localOnly));
  const buildEvent = createEventFactory(context, state);
  const startedAt = Date.now();
  const events: TelemetryStoredEvent[] = [];
  let latestOutcome: string | null = null;
  let latestErrorClass: string | null = null;
  let persisted = false;

  const push = (
    eventName: string,
    patch: Partial<TelemetryStoredEvent> = {},
  ) => {
    if (!state.enabled && state.mode !== "debug") {
      return;
    }
    const next = buildEvent(eventName, patch);
    events.push(next);
  };

  push("command_started", {
    metadata: sanitizeMetadata({
      launchMode: context.options.detach ? "detached" : "direct",
      inputMode: context.options.ipc
        ? "ipc"
        : context.options.noInput
          ? "no_input"
          : "interactive",
    }),
  });

  return {
    trackCliEvent(event) {
      const mapped = mapCliEventToTelemetry(event);
      if (!mapped) {
        if (event.type === "outcome") {
          latestOutcome = event.status ?? null;
          latestErrorClass = classifyError(event.reason) ?? latestErrorClass;
        }
        return;
      }
      push(mapped.eventName, {
        ...mapped.patch,
        source: event.source ?? context.source ?? null,
      });
    },
    trackCustomEvent(eventName, patch = {}) {
      push(eventName, patch);
    },
    markCommandResult(result) {
      latestOutcome = result.outcome ?? latestOutcome;
      latestErrorClass = result.errorClass ?? latestErrorClass;
      const durationMs = Date.now() - startedAt;
      if (result.exitCode === 0) {
        push("command_completed", {
          durationMs,
          outcome: latestOutcome,
          errorClass: null,
        });
        return;
      }
      push("command_failed", {
        durationMs,
        outcome: latestOutcome,
        errorClass: latestErrorClass ?? "unknown",
      });
    },
    async persist() {
      if (persisted) {
        return;
      }
      persisted = true;
      if (state.mode === "debug") {
        for (const envelope of splitIntoEnvelopes(events, context.cliVersion)) {
          process.stderr.write(`${JSON.stringify(envelope)}\n`);
        }
        return;
      }
      if (!state.enabled) {
        return;
      }
      const envelopes = splitIntoEnvelopes(events, context.cliVersion);
      const runId = events[0]?.runId ?? randomId("run");
      for (const envelope of envelopes) {
        await writeEnvelope(envelope, runId);
      }
    },
    async flush() {
      await flushTelemetryOutbox();
    },
  };
}
