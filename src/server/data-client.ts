import { ConnectError, ConnectErrorCode } from "../core/errors.js";
import type { DataClientConfig, DataFetchParams } from "../core/types.js";
import { createRequestSigner } from "./request-signer.js";

/**
 * Low-level client for the Data Portability Gateway and Personal Servers.
 *
 * @see {@link createDataClient} to create an instance.
 */
export interface DataClient {
  /** Resolves a user's Personal Server URL via the gateway. */
  resolveServerUrl(userAddress: string): Promise<string>;
  /** Fetches data for a single scope from a Personal Server. */
  fetchData(params: DataFetchParams): Promise<unknown>;
  /** Lists available scopes on a Personal Server. */
  listScopes(params: { serverUrl: string }): Promise<unknown>;
  /** Lists available versions for a scope on a Personal Server. */
  listVersions(params: { serverUrl: string; scope: string }): Promise<unknown>;
}

/**
 * Creates a low-level Data Gateway / Personal Server client.
 *
 * Prefer the high-level {@link getData} function for most use cases.
 *
 * @param config - Data client configuration.
 * @returns A {@link DataClient} instance.
 */
export function createDataClient(config: DataClientConfig): DataClient {
  const gatewayBase = config.gatewayUrl.replace(/\/+$/, "");
  const signer = createRequestSigner({ privateKey: config.privateKey });

  return {
    async resolveServerUrl(userAddress: string): Promise<string> {
      const res = await fetch(`${gatewayBase}/v1/servers/${userAddress}`);

      if (res.status === 404) {
        throw new ConnectError(
          `No server registered for ${userAddress}`,
          ConnectErrorCode.SERVER_NOT_FOUND,
          404,
        );
      }

      if (!res.ok) {
        throw new ConnectError(
          `Gateway error: ${res.status}`,
          ConnectErrorCode.GATEWAY_ERROR,
          res.status,
        );
      }

      const envelope = (await res.json()) as {
        data: { serverUrl: string };
      };
      return envelope.data.serverUrl;
    },

    async fetchData(params: DataFetchParams): Promise<unknown> {
      const base = params.serverUrl.replace(/\/+$/, "");
      const queryParams = new URLSearchParams();
      if (params.fileId) queryParams.set("fileId", params.fileId);
      if (params.at) queryParams.set("at", params.at);
      const qs = queryParams.toString();
      const uri = `/v1/data/${params.scope}${qs ? `?${qs}` : ""}`;

      const authHeader = await signer.signRequest({
        aud: base,
        method: "GET",
        uri,
        grantId: params.grantId,
      });

      const url = `${base}${uri}`;
      const res = await fetch(url, {
        headers: { Authorization: authHeader },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "(unreadable)");
        console.error("[data-client] fetchData failed", {
          status: res.status,
          url,
          scope: params.scope,
          grantId: params.grantId,
          body,
        });
        throw new ConnectError(
          `Data fetch failed: ${res.status}`,
          ConnectErrorCode.DATA_FETCH_FAILED,
          res.status,
        );
      }

      return res.json();
    },

    async listScopes(params: { serverUrl: string }): Promise<unknown> {
      const base = params.serverUrl.replace(/\/+$/, "");
      const uri = "/v1/data";

      const authHeader = await signer.signRequest({
        aud: base,
        method: "GET",
        uri,
      });

      const res = await fetch(`${base}${uri}`, {
        headers: { Authorization: authHeader },
      });

      if (!res.ok) {
        throw new ConnectError(
          `List scopes failed: ${res.status}`,
          ConnectErrorCode.LIST_SCOPES_FAILED,
          res.status,
        );
      }

      return res.json();
    },

    async listVersions(params: {
      serverUrl: string;
      scope: string;
    }): Promise<unknown> {
      const base = params.serverUrl.replace(/\/+$/, "");
      const uri = `/v1/data/${params.scope}/versions`;

      const authHeader = await signer.signRequest({
        aud: base,
        method: "GET",
        uri,
      });

      const res = await fetch(`${base}${uri}`, {
        headers: { Authorization: authHeader },
      });

      if (!res.ok) {
        throw new ConnectError(
          `List versions failed: ${res.status}`,
          ConnectErrorCode.LIST_VERSIONS_FAILED,
          res.status,
        );
      }

      return res.json();
    },
  };
}
