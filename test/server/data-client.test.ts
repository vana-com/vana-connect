import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDataClient } from "../../src/server/data-client.js";
import { ConnectError } from "../../src/core/errors.js";

const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const GATEWAY_URL = "https://gateway.example.com";
const SERVER_URL = "https://personal-server.example.com";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDataClient", () => {
  describe("resolveServerUrl", () => {
    it("returns serverUrl from gateway envelope", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            serverUrl: SERVER_URL,
            id: "server-1",
            ownerAddress: "0xuser",
            serverAddress: "0xserver",
            publicKey: "0x04...",
            addedAt: "2026-01-01T00:00:00Z",
          },
          proof: {},
        }),
      });

      const client = createDataClient({
        privateKey: TEST_PRIVATE_KEY,
        gatewayUrl: GATEWAY_URL,
      });

      const url = await client.resolveServerUrl("0xuser");
      expect(url).toBe(SERVER_URL);
      expect(mockFetch).toHaveBeenCalledWith(
        `${GATEWAY_URL}/v1/servers/0xuser`,
      );
    });

    it("throws SERVER_NOT_FOUND when gateway returns 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const client = createDataClient({
        privateKey: TEST_PRIVATE_KEY,
        gatewayUrl: GATEWAY_URL,
      });

      try {
        await client.resolveServerUrl("0xunknown");
        expect.fail("Expected ConnectError");
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectError);
        expect((err as ConnectError).code).toBe("SERVER_NOT_FOUND");
      }
    });
  });

  describe("fetchData", () => {
    it("sends GET with Web3Signed auth and grantId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { username: "alice" } }),
      });

      const client = createDataClient({
        privateKey: TEST_PRIVATE_KEY,
        gatewayUrl: GATEWAY_URL,
      });

      await client.fetchData({
        serverUrl: SERVER_URL,
        scope: "instagram.profile",
        grantId: "grant-123",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SERVER_URL}/v1/data/instagram.profile`);
      expect(opts.headers.Authorization).toMatch(/^Web3Signed /);

      // Verify grantId is in the payload
      const authHeader = opts.headers.Authorization as string;
      const payloadBase64 = authHeader.replace("Web3Signed ", "").split(".")[0];
      const payload = JSON.parse(
        Buffer.from(payloadBase64, "base64").toString("utf-8"),
      );
      expect(payload.grantId).toBe("grant-123");
    });

    it("includes query params for fileId and at", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      });

      const client = createDataClient({
        privateKey: TEST_PRIVATE_KEY,
        gatewayUrl: GATEWAY_URL,
      });

      await client.fetchData({
        serverUrl: SERVER_URL,
        scope: "instagram.profile",
        grantId: "grant-123",
        fileId: "file-456",
        at: "2026-01-01T00:00:00Z",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("fileId=file-456");
      expect(url).toContain(encodeURIComponent("2026-01-01T00:00:00Z"));
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const client = createDataClient({
        privateKey: TEST_PRIVATE_KEY,
        gatewayUrl: GATEWAY_URL,
      });

      await expect(
        client.fetchData({
          serverUrl: SERVER_URL,
          scope: "instagram.profile",
          grantId: "grant-123",
        }),
      ).rejects.toThrow(ConnectError);
    });
  });

  describe("listScopes", () => {
    it("sends GET with Web3Signed auth (no grantId)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scopes: [] }),
      });

      const client = createDataClient({
        privateKey: TEST_PRIVATE_KEY,
        gatewayUrl: GATEWAY_URL,
      });

      await client.listScopes({ serverUrl: SERVER_URL });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SERVER_URL}/v1/data`);

      const authHeader = opts.headers.Authorization as string;
      const payloadBase64 = authHeader.replace("Web3Signed ", "").split(".")[0];
      const payload = JSON.parse(
        Buffer.from(payloadBase64, "base64").toString("utf-8"),
      );
      expect(payload.grantId).toBeUndefined();
      expect(payload.uri).toBe("/v1/data");
    });
  });

  describe("listVersions", () => {
    it("sends GET to /v1/data/{scope}/versions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: [] }),
      });

      const client = createDataClient({
        privateKey: TEST_PRIVATE_KEY,
        gatewayUrl: GATEWAY_URL,
      });

      await client.listVersions({
        serverUrl: SERVER_URL,
        scope: "instagram.profile",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe(`${SERVER_URL}/v1/data/instagram.profile/versions`);
    });
  });
});
