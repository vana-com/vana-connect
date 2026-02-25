import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connect, getData } from "../../src/server/connect.js";
import { getEnvConfig } from "../../src/core/constants.js";
import type { GrantPayload } from "../../src/core/types.js";

const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TEST_GRANTEE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

const SERVER_URL = "https://personal-server.example.com";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockInitSession() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      sessionId: "sess-123",
      deepLinkUrl: "vana://connect?sessionId=sess-123&secret=abc",
      expiresAt: "2026-02-09T12:00:00Z",
    }),
  });
}

function mockResolveServerUrl() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: { serverUrl: SERVER_URL },
    }),
  });
}

function mockFetchData(scope: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: { scope, username: "alice" } }),
  });
}

const TEST_GRANT: GrantPayload = {
  grantId: "grant-1",
  userAddress: "0xuser",
  builderAddress: TEST_GRANTEE,
  scopes: ["instagram.dpv1"],
  serverAddress: "0xserver",
};

describe("connect", () => {
  it("derives grantee address from private key", async () => {
    mockInitSession();

    await connect({
      privateKey: TEST_PRIVATE_KEY,
      scopes: ["instagram.dpv1"],
    });

    const initCall = mockFetch.mock.calls[0];
    const body = JSON.parse(initCall[1].body);
    expect(body.granteeAddress).toBe(TEST_GRANTEE);
  });

  it("uses default session relay URL", async () => {
    mockInitSession();

    await connect({
      privateKey: TEST_PRIVATE_KEY,
      scopes: ["instagram.dpv1"],
    });

    const initUrl = mockFetch.mock.calls[0][0] as string;
    const { sessionRelayUrl } = getEnvConfig();
    expect(initUrl).toBe(`${sessionRelayUrl}/v1/session/init`);
  });

  it("returns session init result with connectUrl", async () => {
    mockInitSession();

    const result = await connect({
      privateKey: TEST_PRIVATE_KEY,
      scopes: ["instagram.dpv1"],
    });

    expect(result.sessionId).toBe("sess-123");
    expect(result.expiresAt).toBe("2026-02-09T12:00:00Z");

    // connectUrl points to account.vana.org with sessionId and secret
    const { accountUrl } = getEnvConfig();
    const url = new URL(result.connectUrl);
    expect(url.origin).toBe(accountUrl);
    expect(url.pathname).toBe("/connect");
    expect(url.searchParams.get("sessionId")).toBe("sess-123");
    expect(url.searchParams.get("secret")).toBe("abc");
  });

  it("includes appUrl in connectUrl when provided", async () => {
    mockInitSession();

    const result = await connect({
      privateKey: TEST_PRIVATE_KEY,
      scopes: ["instagram.dpv1"],
      appUrl: "https://foo-bar.com",
    });

    const url = new URL(result.connectUrl);
    expect(url.searchParams.get("sessionId")).toBe("sess-123");
    expect(url.searchParams.get("appUrl")).toBe("https://foo-bar.com");
  });

  it("returns connectUrl without secret when deepLinkUrl has no secret", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sessionId: "sess-456",
        deepLinkUrl: "vana://connect?sessionId=sess-456",
        expiresAt: "2026-02-09T12:00:00Z",
      }),
    });

    const result = await connect({
      privateKey: TEST_PRIVATE_KEY,
      scopes: ["instagram.dpv1"],
    });

    const url = new URL(result.connectUrl);
    expect(url.searchParams.get("sessionId")).toBe("sess-456");
    expect(url.searchParams.has("secret")).toBe(false);
  });

  it("passes through webhookUrl and appUserId", async () => {
    mockInitSession();

    await connect({
      privateKey: TEST_PRIVATE_KEY,
      scopes: ["instagram.dpv1"],
      webhookUrl: "https://webhook.example.com",
      appUserId: "user-42",
    });

    const initBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(initBody.webhookUrl).toBe("https://webhook.example.com");
    expect(initBody.app_user_id).toBe("user-42");
  });

  it("only makes one fetch call (no polling or data fetch)", async () => {
    mockInitSession();

    await connect({
      privateKey: TEST_PRIVATE_KEY,
      scopes: ["instagram.dpv1"],
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("getData", () => {
  it("uses default gateway URL to resolve server URL", async () => {
    mockResolveServerUrl();
    mockFetchData("instagram.dpv1");

    await getData({
      privateKey: TEST_PRIVATE_KEY,
      grant: TEST_GRANT,
    });

    const fetchedUrl = mockFetch.mock.calls[0][0] as string;
    const { gatewayUrl } = getEnvConfig();
    expect(fetchedUrl).toContain(gatewayUrl);
  });

  it("resolves server URL from grant.serverAddress", async () => {
    mockResolveServerUrl();
    mockFetchData("instagram.dpv1");

    await getData({
      privateKey: TEST_PRIVATE_KEY,
      grant: TEST_GRANT,
    });

    const resolveUrl = mockFetch.mock.calls[0][0] as string;
    expect(resolveUrl).toContain("0xserver");
  });

  it("falls back to grant.userAddress when no serverAddress", async () => {
    mockResolveServerUrl();
    mockFetchData("instagram.dpv1");

    const grantWithoutServer = { ...TEST_GRANT, serverAddress: undefined };

    await getData({
      privateKey: TEST_PRIVATE_KEY,
      grant: grantWithoutServer,
    });

    const resolveUrl = mockFetch.mock.calls[0][0] as string;
    expect(resolveUrl).toContain("0xuser");
  });

  it("fetches data for all scopes and returns a Record", async () => {
    const multiScopeGrant: GrantPayload = {
      ...TEST_GRANT,
      scopes: ["instagram.dpv1", "twitter.dpv1"],
    };

    mockResolveServerUrl();
    mockFetchData("instagram.dpv1");
    mockFetchData("twitter.dpv1");

    const data = await getData({
      privateKey: TEST_PRIVATE_KEY,
      grant: multiScopeGrant,
    });

    expect(typeof data).toBe("object");
    expect(Object.keys(data)).toHaveLength(2);
    expect(data["instagram.dpv1"]).toEqual({
      data: { scope: "instagram.dpv1", username: "alice" },
    });
    expect(data["twitter.dpv1"]).toEqual({
      data: { scope: "twitter.dpv1", username: "alice" },
    });
  });

  it("returns single-scope data", async () => {
    mockResolveServerUrl();
    mockFetchData("instagram.dpv1");

    const data = await getData({
      privateKey: TEST_PRIVATE_KEY,
      grant: TEST_GRANT,
    });

    expect(Object.keys(data)).toHaveLength(1);
    expect("instagram.dpv1" in data).toBe(true);
  });
});
