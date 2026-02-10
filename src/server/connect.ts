import { SESSION_RELAY_URL, GATEWAY_URL } from "../core/constants.js";
import type {
  ConnectConfig,
  GetDataConfig,
  SessionInitResult,
} from "../core/types.js";
import { createRequestSigner } from "./request-signer.js";
import { createSessionRelay } from "./session-relay.js";
import { createDataClient } from "./data-client.js";

export async function connect(
  config: ConnectConfig,
): Promise<SessionInitResult> {
  const signer = createRequestSigner({ privateKey: config.privateKey });
  const granteeAddress = signer.address;

  const relay = createSessionRelay({
    privateKey: config.privateKey,
    granteeAddress,
    sessionRelayUrl: SESSION_RELAY_URL,
  });

  return relay.initSession({
    scopes: config.scopes,
    webhookUrl: config.webhookUrl,
    appUserId: config.appUserId,
  });
}

export async function getData(
  config: GetDataConfig,
): Promise<Map<string, unknown>> {
  const { grant } = config;

  const dataClient = createDataClient({
    privateKey: config.privateKey,
    gatewayUrl: GATEWAY_URL,
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

  const data = new Map<string, unknown>();
  for (const [scope, result] of results) {
    data.set(scope, result);
  }

  return data;
}
