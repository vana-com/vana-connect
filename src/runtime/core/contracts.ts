export interface RuntimeNeedInputEvent {
  type: "needs-input";
  source: string;
  message: string;
  fields: string[];
  logPath: string;
  schema?: {
    properties?: Record<string, unknown>;
  };
  pendingInputPath?: string;
  responseInputPath?: string;
}

export interface RuntimeRunStartedEvent {
  type: "run-started";
  source: string;
  logPath: string;
}

export interface RuntimeLegacyAuthEvent {
  type: "legacy-auth";
  source: string;
  message: string;
  logPath: string;
}

export interface RuntimeHeadedRequiredEvent {
  type: "headed-required";
  source: string;
  message: string;
  logPath: string;
  url?: string;
}

export interface RuntimeCollectionCompleteEvent {
  type: "collection-complete";
  source: string;
  resultPath: string;
  logPath: string;
}

export interface RuntimeProgressEvent {
  type: "progress-update";
  source: string;
  logPath: string;
  message?: string;
  count?: number;
  phase?: unknown;
}

export interface RuntimeStatusEvent {
  type: "status-update";
  source: string;
  logPath: string;
  message: string;
}

export interface RuntimeErrorEvent {
  type: "runtime-error";
  source: string;
  message: string;
  logPath: string;
}

export type RuntimeEvent =
  | RuntimeRunStartedEvent
  | RuntimeNeedInputEvent
  | RuntimeHeadedRequiredEvent
  | RuntimeLegacyAuthEvent
  | RuntimeCollectionCompleteEvent
  | RuntimeProgressEvent
  | RuntimeStatusEvent
  | RuntimeErrorEvent;

export interface RuntimeInputRequest {
  message?: string;
  schema?: {
    properties?: Record<string, unknown>;
  };
  fields: string[];
  responseInputPath: string;
}

export interface ConnectorRunRequest {
  connectorPath: string;
  source: string;
  noInput?: boolean;
  signal?: AbortSignal;
  onNeedInput?: (event: RuntimeInputRequest) => Promise<Record<string, string>>;
}

export interface ConnectorRunHandle {
  readonly source: string;
  readonly logPath: string;
  events(): AsyncGenerator<RuntimeEvent, void, void>;
  stop(reason?: string): void;
}

export interface RuntimeCapabilities {
  supportsHeaded: boolean;
  supportsManagedProfiles: boolean;
  supportsScreenshots: boolean;
}
