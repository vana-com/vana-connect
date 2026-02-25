import { getEnvConfig } from "../core/constants.js";
import type {
  ConnectConfig,
  GetDataConfig,
  SessionInitResult,
} from "../core/types.js";
import { createRequestSigner } from "./request-signer.js";
import { createSessionRelay } from "./session-relay.js";
import { createDataClient } from "./data-client.js";

/**
 * Creates a session on the Session Relay and returns the session ID, connect URL, and deep link URL.
 *
 * This is the entry point for the Vana Connect flow. The returned `connectUrl`
 * should be presented to the user to sign in on account.vana.org and launch Data Connect.
 *
 * @param config - Connection configuration including private key and scopes.
 * @returns Session ID, connect URL, and expiration timestamp.
 * @throws {@link ConnectError} with code `SESSION_INIT_FAILED` if the relay rejects the request.
 *
 * @example
 * ```typescript
 * const session = await connect({
 *   privateKey: process.env.VANA_PRIVATE_KEY as `0x${string}`,
 *   scopes: ["chatgpt.conversations"],
 * });
 * // session.sessionId, session.connectUrl, session.expiresAt
 * ```
 */
export async function connect(
  config: ConnectConfig,
): Promise<SessionInitResult> {
  const { sessionRelayUrl, accountUrl } = getEnvConfig();
  const signer = createRequestSigner({ privateKey: config.privateKey });
  const granteeAddress = signer.address;

  const relay = createSessionRelay({
    privateKey: config.privateKey,
    granteeAddress,
    sessionRelayUrl,
  });

  const relayResult = await relay.initSession({
    scopes: config.scopes,
    webhookUrl: config.webhookUrl,
    appUserId: config.appUserId,
  });

  // Build the account.vana.org connect URL from the relay response
  const connectUrl = new URL("/connect", accountUrl);
  connectUrl.searchParams.set("sessionId", relayResult.sessionId);
  if (typeof config.appUrl === "string" && config.appUrl.trim().length > 0) {
    connectUrl.searchParams.set("appUrl", config.appUrl.trim());
  }
  try {
    const deepLinkParams = new URL(relayResult.deepLinkUrl);
    const secret = deepLinkParams.searchParams.get("secret");
    if (secret) connectUrl.searchParams.set("secret", secret);
  } catch {
    // deepLinkUrl may not be a valid URL; proceed without secret
  }

  return {
    sessionId: relayResult.sessionId,
    connectUrl: connectUrl.toString(),
    expiresAt: relayResult.expiresAt,
  };
}

/**
 * Fetches user data from their Personal Server using a signed grant.
 *
 * Resolves the server URL via the Data Portability Gateway, then fetches
 * data for each scope in the grant concurrently.
 *
 * @param config - Data fetch configuration including private key and grant.
 * @returns A `Record` keyed by scope name with the fetched data as values.
 * @throws {@link ConnectError} with code `SERVER_NOT_FOUND` if no server is registered.
 * @throws {@link ConnectError} with code `DATA_FETCH_FAILED` if a scope fetch fails.
 *
 * @example
 * ```typescript
 * const data = await getData({
 *   privateKey: process.env.VANA_PRIVATE_KEY as `0x${string}`,
 *   grant,
 * });
 * const conversations = data["chatgpt.conversations"];
 * ```
 */
export async function getData(
  config: GetDataConfig,
): Promise<Record<string, unknown>> {
  const { gatewayUrl } = getEnvConfig();
  const { grant } = config;

  const dataClient = createDataClient({
    privateKey: config.privateKey,
    gatewayUrl,
  });

  const serverUrl = await dataClient.resolveServerUrl(
    grant.serverAddress ?? grant.userAddress,
  );

  const results = await Promise.all(
    grant.scopes.map(async (scope) => {
      const result = await dataClient.fetchData({
        serverUrl,
        scope,
        grantId: grant.grantId,
      });
      return [scope, result] as const;
    }),
  );

  const data: Record<string, unknown> = {};
  for (const [scope, result] of results) {
    data[scope] = result;
  }

  return data;
}
