import { ConnectError } from "../core/errors.js";
import type { DataClientConfig, DataFetchParams } from "../core/types.js";
import { createRequestSigner } from "./request-signer.js";

export interface DataClient {
  resolveServerUrl(userAddress: string): Promise<string>;
  fetchData(params: DataFetchParams): Promise<unknown>;
  listScopes(params: { serverUrl: string }): Promise<unknown>;
  listVersions(params: { serverUrl: string; scope: string }): Promise<unknown>;
}

export function createDataClient(config: DataClientConfig): DataClient {
  const gatewayBase = config.gatewayUrl.replace(/\/+$/, "");
  const signer = createRequestSigner({ privateKey: config.privateKey });

  return {
    async resolveServerUrl(userAddress: string): Promise<string> {
      const res = await fetch(`${gatewayBase}/v1/servers/${userAddress}`);

      if (res.status === 404) {
        throw new ConnectError(
          `No server registered for ${userAddress}`,
          "SERVER_NOT_FOUND",
          404,
        );
      }

      if (!res.ok) {
        throw new ConnectError(
          `Gateway error: ${res.status}`,
          "GATEWAY_ERROR",
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

      const res = await fetch(`${base}${uri}`, {
        headers: { Authorization: authHeader },
      });

      if (!res.ok) {
        throw new ConnectError(
          `Data fetch failed: ${res.status}`,
          "DATA_FETCH_FAILED",
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
          "LIST_SCOPES_FAILED",
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
          "LIST_VERSIONS_FAILED",
          res.status,
        );
      }

      return res.json();
    },
  };
}
