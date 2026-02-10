export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "waiting"
  | "approved"
  | "denied"
  | "expired"
  | "error";

export interface SessionInitParams {
  scopes: string[];
  webhookUrl?: string;
  appUserId?: string;
}

export interface SessionInitResult {
  sessionId: string;
  deepLinkUrl: string;
  expiresAt: string;
}

export interface SessionPollResult {
  status: "pending" | "claimed" | "approved" | "denied" | "expired";
  grant?: GrantPayload;
  reason?: string;
}

export interface GrantPayload {
  grantId: string;
  userAddress: string;
  builderAddress: string;
  scopes: string[];
  serverAddress?: string;
  appUserId?: string;
}

export interface DataFetchParams {
  serverUrl: string;
  scope: string;
  grantId: string;
  fileId?: string;
  at?: string;
}

export interface RequestSignerConfig {
  privateKey: `0x${string}`;
}

export interface SessionRelayConfig {
  privateKey: `0x${string}`;
  granteeAddress: `0x${string}`;
  sessionRelayUrl: string;
}

export interface DataClientConfig {
  privateKey: `0x${string}`;
  gatewayUrl: string;
}

export interface ConnectConfig {
  privateKey: `0x${string}`;
  scopes: string[];
  webhookUrl?: string;
  appUserId?: string;
}

export interface GetDataConfig {
  privateKey: `0x${string}`;
  grant: GrantPayload;
}
