// ---------------------------------------------------------------------------
// Canonical telemetry contract — copied from context-gateway.
//
// SOURCE OF TRUTH:
//   https://github.com/vana-com/context-gateway/blob/main/packages/contracts/src/telemetry.ts
//   https://github.com/vana-com/context-gateway/blob/main/packages/contracts/TELEMETRY.md
//
// Context-gateway is a private monorepo, so this file is manually synced
// rather than imported from npm. When the canonical contract changes, this
// file MUST be updated to match. The server validates events against its
// own copy; a mismatch will cause events from this client to be rejected.
//
// See TELEMETRY.md in context-gateway for the state machine and the rollup
// rules. All type definitions below mirror the upstream contract exactly.
// ---------------------------------------------------------------------------

// ── Producers ───────────────────────────────────────────────────────────────

export const TELEMETRY_PRODUCERS = ["cli", "data_connect", "personal_server"] as const;
export type TelemetryProducer = (typeof TELEMETRY_PRODUCERS)[number];

// ── Error classes ───────────────────────────────────────────────────────────

export const TELEMETRY_ERROR_CLASSES = [
  "auth_failed",
  "personal_server_unavailable",
  "network_error",
  "timeout",
  "runtime_error",
  "unknown",
] as const;
export type TelemetryErrorClass = (typeof TELEMETRY_ERROR_CLASSES)[number];

// ── Cancellation reasons ────────────────────────────────────────────────────

export const TELEMETRY_CANCELLATION_REASONS = [
  "user_aborted",
  "abandoned",
  "timeout",
] as const;
export type TelemetryCancellationReason =
  (typeof TELEMETRY_CANCELLATION_REASONS)[number];

// ── Interaction kinds ───────────────────────────────────────────────────────

export const TELEMETRY_INTERACTION_KINDS = [
  "login",
  "otp",
  "captcha",
  "manual_action",
] as const;
export type TelemetryInteractionKind =
  (typeof TELEMETRY_INTERACTION_KINDS)[number];

// ── Sync skip reasons ───────────────────────────────────────────────────────

export const TELEMETRY_SYNC_SKIP_REASONS = [
  "server_unavailable",
  "not_requested",
] as const;
export type TelemetrySyncSkipReason =
  (typeof TELEMETRY_SYNC_SKIP_REASONS)[number];

// ── Host context enums ──────────────────────────────────────────────────────

export const TELEMETRY_OS_VALUES = ["linux", "macos", "windows"] as const;
export type TelemetryOs = (typeof TELEMETRY_OS_VALUES)[number];

export const TELEMETRY_ARCH_VALUES = ["x86_64", "arm64"] as const;
export type TelemetryArch = (typeof TELEMETRY_ARCH_VALUES)[number];

// ── Compartments ────────────────────────────────────────────────────────────

export interface TelemetryIdentity {
  eventId: string;
  eventVersion: number;
}

export interface TelemetryTime {
  occurredAt: string; // ISO 8601
  durationMs?: number;
}

export interface TelemetryAttribution {
  producer: TelemetryProducer;
  installId: string;
  appSessionId?: string;
}

export interface TelemetryContext {
  hostPlatform: string;
  os: TelemetryOs;
  arch: TelemetryArch;
  producerVersion: string;
  connectorVersion?: string;
  authMode?: string;
}

// ── Correlation ─────────────────────────────────────────────────────────────

export type TelemetryCorrelation =
  | { scope: "host"; hostRunId: string }
  | {
      scope: "collection";
      hostRunId: string;
      collectionRunId: string;
      source: string;
    }
  | {
      scope: "sync";
      hostRunId: string;
      syncRunId: string;
      source: string;
      collectionRunId?: string;
    }
  | { scope: "grant"; hostRunId: string; grantFlowId: string };

// ── Kind ────────────────────────────────────────────────────────────────────

export type TelemetryKind =
  // Host
  | { lifecycle: "host"; phase: "started" }
  | { lifecycle: "host"; phase: "terminal"; outcome: "success" }
  | {
      lifecycle: "host";
      phase: "terminal";
      outcome: "failure";
      errorClass: TelemetryErrorClass;
    }

  // Collection
  | { lifecycle: "collection"; phase: "started" }
  | {
      lifecycle: "collection";
      phase: "needs_input";
      interactionKind?: TelemetryInteractionKind;
    }
  | {
      lifecycle: "collection";
      phase: "terminal";
      outcome: "success";
      recordCount?: number;
    }
  | {
      lifecycle: "collection";
      phase: "terminal";
      outcome: "failure";
      errorClass: TelemetryErrorClass;
    }
  | {
      lifecycle: "collection";
      phase: "terminal";
      outcome: "cancelled";
      reason?: TelemetryCancellationReason;
    }

  // Sync
  | { lifecycle: "sync"; phase: "started" }
  | {
      lifecycle: "sync";
      phase: "terminal";
      outcome: "success";
      storedScopeCount: number;
      failedScopeCount: number;
    }
  | {
      lifecycle: "sync";
      phase: "terminal";
      outcome: "failure";
      errorClass: TelemetryErrorClass;
    }
  | {
      lifecycle: "sync";
      phase: "skipped";
      reason: TelemetrySyncSkipReason;
    }

  // Grant
  | { lifecycle: "grant"; phase: "started" }
  | { lifecycle: "grant"; phase: "terminal"; outcome: "approved" }
  | { lifecycle: "grant"; phase: "terminal"; outcome: "denied" }
  | { lifecycle: "grant"; phase: "terminal"; outcome: "expired" }
  | {
      lifecycle: "grant";
      phase: "terminal";
      outcome: "failure";
      errorClass: TelemetryErrorClass;
    };

// ── Event ───────────────────────────────────────────────────────────────────

export interface TelemetryEvent {
  identity: TelemetryIdentity;
  time: TelemetryTime;
  attribution: TelemetryAttribution;
  context: TelemetryContext;
  correlation: TelemetryCorrelation;
  kind: TelemetryKind;
  debug?: string;
  extensions?: Record<string, unknown>;
}

// ── Batch ───────────────────────────────────────────────────────────────────

export interface TelemetryBatch {
  batchId: string;
  sentAt: string;
  events: TelemetryEvent[];
}

// ── Endpoint ────────────────────────────────────────────────────────────────

export const TELEMETRY_ENDPOINT = "https://telemetry.opendatalabs.com/v1/telemetry/events";
export const TELEMETRY_EVENT_VERSION = 1;
export const TELEMETRY_PRODUCER_NAME: TelemetryProducer = "cli";
