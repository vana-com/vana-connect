/** Possible states of a Vana Connect session from the client's perspective. */
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "waiting"
  | "approved"
  | "denied"
  | "expired"
  | "error";

/** Parameters for creating a new session on the Session Relay. */
export interface SessionInitParams {
  /** Data scopes to request (e.g. `["chatgpt.conversations"]`). */
  scopes: string[];
  /** Public HTTPS URL for grant event notifications. Localhost is rejected. */
  webhookUrl?: string;
  /** Your app's user ID for correlation. */
  appUserId?: string;
}

/** Result returned by {@link SessionRelay.initSession}. */
export interface SessionInitResult {
  /** Unique session identifier used for polling. */
  sessionId: string;
  /** URL to account.vana.org where the user signs in and launches Data Connect. */
  connectUrl: string;
  /** ISO 8601 expiration timestamp for the session. */
  expiresAt: string;
}

/** Result returned by {@link SessionRelay.pollSession}. */
export interface SessionPollResult {
  /** Current session status. */
  status: "pending" | "claimed" | "approved" | "denied" | "expired";
  /** Grant payload, present when status is `"approved"`. */
  grant?: GrantPayload;
  /** Reason for denial, present when status is `"denied"`. */
  reason?: string;
}

/** Payload describing a user's approved data grant. */
export interface GrantPayload {
  /** On-chain permission ID. */
  grantId: string;
  /** User's wallet address. */
  userAddress: string;
  /** Builder's registered wallet address. */
  builderAddress: string;
  /** Approved data scopes. */
  scopes: string[];
  /** User's Personal Server address, if known. */
  serverAddress?: string;
  /** Your app's user ID, if provided during session init. */
  appUserId?: string;
}

/** Parameters for fetching data from a Personal Server. */
export interface DataFetchParams {
  /** Base URL of the user's Personal Server. */
  serverUrl: string;
  /** Data scope to fetch (e.g. `"instagram.profile"`). */
  scope: string;
  /** Grant ID authorizing the data access. */
  grantId: string;
  /** Optional file ID for a specific file within the scope. */
  fileId?: string;
  /** Optional ISO 8601 timestamp to fetch data at a specific point in time. */
  at?: string;
}

/** Configuration for {@link createRequestSigner}. */
export interface RequestSignerConfig {
  /** Builder private key in hex format. */
  privateKey: `0x${string}`;
}

/** Configuration for {@link createSessionRelay}. */
export interface SessionRelayConfig {
  /** Builder private key in hex format. */
  privateKey: `0x${string}`;
  /** Builder's wallet address derived from the private key. */
  granteeAddress: `0x${string}`;
  /** Base URL of the Session Relay service. */
  sessionRelayUrl: string;
}

/** Configuration for {@link createDataClient}. */
export interface DataClientConfig {
  /** Builder private key in hex format. */
  privateKey: `0x${string}`;
  /** Base URL of the Data Portability Gateway. */
  gatewayUrl: string;
}

/** Configuration for the high-level {@link connect} function. */
export interface ConnectConfig {
  /** Builder private key in hex format. */
  privateKey: `0x${string}`;
  /** Data scopes to request. */
  scopes: string[];
  /** Public app URL used by Connect UI to resolve favicon branding. */
  appUrl?: string;
  /** Human-readable label for the requested data source shown in Connect UI. */
  dataSource?: string;
  /** Public HTTPS URL for grant event notifications. */
  webhookUrl?: string;
  /** Your app's user ID for correlation. */
  appUserId?: string;
  /** SDK environment (`"dev"` or `"prod"`). Defaults to `"prod"`. */
  environment?: "dev" | "prod";
}

/** Configuration for the high-level {@link getData} function. */
export interface GetDataConfig {
  /** Builder private key in hex format. */
  privateKey: `0x${string}`;
  /** Grant from the approval step. */
  grant: GrantPayload;
  /** SDK environment (`"dev"` or `"prod"`). Defaults to `"prod"`. */
  environment?: "dev" | "prod";
}

/** Configuration for {@link signVanaManifest}. */
export interface VanaManifestConfig {
  /** Builder private key in hex format. */
  privateKey: `0x${string}`;
  /** Canonical URL of your application. */
  appUrl: string;
  /** URL to your privacy policy. */
  privacyPolicyUrl: string;
  /** URL to your terms of service. */
  termsUrl: string;
  /** URL for user support. */
  supportUrl: string;
  /** Public webhook URL for grant notifications. */
  webhookUrl: string;
}

/** Signed manifest block included in your web app manifest under the `vana` key. */
export interface VanaManifestBlock {
  /** Canonical URL of your application. */
  appUrl: string;
  /** URL to your privacy policy. */
  privacyPolicyUrl: string;
  /** URL to your terms of service. */
  termsUrl: string;
  /** URL for user support. */
  supportUrl: string;
  /** Public webhook URL for grant notifications. */
  webhookUrl: string;
  /** Cryptographic signature of the manifest block. */
  signature: string;
}
