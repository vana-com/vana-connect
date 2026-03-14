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

export const cliChannelSchema = z.enum(["stable", "canary"]);
export type CliChannel = z.infer<typeof cliChannelSchema>;

export const cliInstallMethodSchema = z.enum([
  "homebrew",
  "installer",
  "development",
  "unknown",
]);
export type CliInstallMethod = z.infer<typeof cliInstallMethodSchema>;

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
  lastResultPath: z.string().nullable().optional(),
});
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const listedSourceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    company: z.string().optional(),
    description: z.string().optional(),
    authMode: z.enum(["automated", "interactive", "legacy"]).optional(),
    installed: z.boolean(),
  })
  .passthrough();
export type ListedSource = z.infer<typeof listedSourceSchema>;

export const cliStatusSchema = z.object({
  cliVersion: z.string().optional(),
  channel: cliChannelSchema.optional(),
  installMethod: cliInstallMethodSchema.optional(),
  runtime: runtimeStateSchema,
  runtimePath: z.string().nullable(),
  personalServer: personalServerStateSchema,
  personalServerUrl: z.string().nullable(),
  summary: z
    .object({
      sourceCount: z.number(),
      needsAttentionCount: z.number(),
      connectedCount: z.number(),
      installedCount: z.number(),
    })
    .optional(),
  nextSteps: z.array(z.string()).optional(),
  sources: z.array(sourceStatusSchema),
});
export type CliStatus = z.infer<typeof cliStatusSchema>;

export const cliDoctorCheckSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(["ok", "warn", "error"]),
  detail: z.string(),
});
export type CliDoctorCheck = z.infer<typeof cliDoctorCheckSchema>;

export const cliDoctorSchema = z.object({
  cliVersion: z.string(),
  channel: cliChannelSchema,
  installMethod: cliInstallMethodSchema,
  runtime: runtimeStateSchema,
  runtimePath: z.string().nullable(),
  personalServer: personalServerStateSchema,
  personalServerUrl: z.string().nullable(),
  paths: z.object({
    executable: z.string(),
    appRoot: z.string(),
    dataHome: z.string(),
    stateFile: z.string(),
    connectorCache: z.string(),
    browserProfiles: z.string(),
    logs: z.string(),
  }),
  lifecycle: z.object({
    upgrade: z.string(),
    uninstall: z.string(),
  }),
  checks: z.array(cliDoctorCheckSchema),
  nextSteps: z.array(z.string()),
});
export type CliDoctor = z.infer<typeof cliDoctorSchema>;

export const cliSourcesSchema = z.object({
  count: z.number(),
  recommendedSource: listedSourceSchema.nullable(),
  summary: z
    .object({
      readyCount: z.number(),
      manualCount: z.number(),
      installedCount: z.number(),
    })
    .optional(),
  sources: z.array(listedSourceSchema),
});
export type CliSources = z.infer<typeof cliSourcesSchema>;

export const datasetSummarySchema = z.object({
  lines: z.array(z.string()),
});
export type DatasetSummary = z.infer<typeof datasetSummarySchema>;

export const datasetRecordSchema = z.object({
  source: z.string(),
  name: z.string().nullable().optional(),
  authMode: z
    .enum(["automated", "interactive", "legacy"])
    .nullable()
    .optional(),
  dataState: dataStateSchema.optional(),
  lastRunAt: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  summary: datasetSummarySchema.nullable().optional(),
});
export type DatasetRecord = z.infer<typeof datasetRecordSchema>;

export const cliDataListSchema = z.object({
  count: z.number(),
  latestDataset: datasetRecordSchema.nullable(),
  datasets: z.array(datasetRecordSchema),
});
export type CliDataList = z.infer<typeof cliDataListSchema>;

export const cliDataPathSchema = z.object({
  source: z.string(),
  name: z.string(),
  path: z.string(),
  lastRunAt: z.string().nullable(),
  dataState: dataStateSchema.nullable(),
});
export type CliDataPath = z.infer<typeof cliDataPathSchema>;

export const cliDataShowSchema = z.object({
  source: z.string(),
  name: z.string(),
  path: z.string(),
  summary: datasetSummarySchema.nullable(),
  lastRunAt: z.string().nullable(),
  dataState: dataStateSchema.nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type CliDataShow = z.infer<typeof cliDataShowSchema>;

export const progressPhaseSchema = z.object({
  step: z.number(),
  total: z.number(),
  label: z.string(),
});
export type ProgressPhase = z.infer<typeof progressPhaseSchema>;

export const sourceRequiredErrorSchema = z.object({
  error: z.literal("source_required"),
  message: z.string(),
  suggestedSource: z
    .object({
      id: z.string(),
      name: z.string(),
      authMode: z.enum(["automated", "interactive", "legacy"]).optional(),
    })
    .optional(),
});
export type SourceRequiredError = z.infer<typeof sourceRequiredErrorSchema>;

export const datasetNotFoundErrorSchema = z.object({
  error: z.literal("dataset_not_found"),
  source: z.string(),
  name: z.string().optional(),
  message: z.string(),
  nextSteps: z.array(z.string()).optional(),
});
export type DatasetNotFoundError = z.infer<typeof datasetNotFoundErrorSchema>;

export const datasetReadFailedErrorSchema = z.object({
  error: z.literal("dataset_read_failed"),
  source: z.string(),
  path: z.string(),
  message: z.string(),
});
export type DatasetReadFailedError = z.infer<
  typeof datasetReadFailedErrorSchema
>;

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
  count: z.number().optional(),
  phase: progressPhaseSchema.optional(),
});
export type CliEvent = z.infer<typeof cliEventSchema>;

export interface CliOutcome extends Record<string, unknown> {
  type: "outcome";
  status: CliOutcomeStatus;
  source?: string;
  resultPath?: string;
  reason?: string;
}
