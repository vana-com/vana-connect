import { z } from "zod";

export const CliOutcomeStatus = {
  CONNECTED_AND_INGESTED: "connected_and_ingested",
  CONNECTED_LOCAL_ONLY: "connected_local_only",
  NEEDS_INPUT: "needs_input",
  SETUP_REQUIRED: "setup_required",
  PERSONAL_SERVER_UNAVAILABLE: "personal_server_unavailable",
  AUTH_FAILED: "auth_failed",
  LEGACY_AUTH: "legacy_auth",
  CONNECTOR_UNAVAILABLE: "connector_unavailable",
  INGEST_FAILED: "ingest_failed",
  RUNTIME_ERROR: "runtime_error",
  INVALID_CONNECTOR: "invalid_connector",
  UNEXPECTED_INTERNAL_ERROR: "unexpected_internal_error",
} as const;

export type CliOutcomeStatus =
  (typeof CliOutcomeStatus)[keyof typeof CliOutcomeStatus];

export const runtimeStateSchema = z.enum(["installed", "missing", "unhealthy"]);
export type RuntimeState = z.infer<typeof runtimeStateSchema>;

export const personalServerStateSchema = z.enum([
  "available",
  "unavailable",
  "unknown",
]);
export type PersonalServerState = z.infer<typeof personalServerStateSchema>;

export const dataStateSchema = z.enum([
  "none",
  "collected_local",
  "ingested_personal_server",
  "ingest_unavailable",
  "ingest_failed",
]);
export type DataState = z.infer<typeof dataStateSchema>;

export const sourceStatusSchema = z.object({
  source: z.string(),
  name: z.string().optional(),
  company: z.string().optional(),
  description: z.string().optional(),
  authMode: z.enum(["automated", "interactive", "legacy"]).optional(),
  installed: z.boolean(),
  sessionPresent: z.boolean(),
  lastRunAt: z.string().nullable().optional(),
  lastRunOutcome: z.string().nullable().optional(),
  dataState: dataStateSchema.optional(),
  lastError: z.string().nullable().optional(),
});
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const cliStatusSchema = z.object({
  runtime: runtimeStateSchema,
  runtimePath: z.string().nullable(),
  personalServer: personalServerStateSchema,
  personalServerUrl: z.string().nullable(),
  sources: z.array(sourceStatusSchema),
});
export type CliStatus = z.infer<typeof cliStatusSchema>;

export const cliEventSchema = z.object({
  type: z.string(),
  source: z.string().optional(),
  message: z.string().optional(),
  status: z.string().optional(),
  resultPath: z.string().optional(),
  connectorPath: z.string().optional(),
  logPath: z.string().optional(),
  fields: z.array(z.string()).optional(),
  url: z.string().optional(),
  target: z.string().optional(),
  runtime: z.string().optional(),
  reason: z.string().optional(),
});
export type CliEvent = z.infer<typeof cliEventSchema>;

export interface CliOutcome extends Record<string, unknown> {
  type: "outcome";
  status: CliOutcomeStatus;
  source?: string;
  resultPath?: string;
  reason?: string;
}
