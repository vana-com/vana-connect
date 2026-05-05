import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAccessTokenCacheForTests,
  executeGrantViaPersonalServer,
  type ExecuteGrantInput,
} from "./execute-grant-via-personal-server";
import type { OauthClientRow } from "@/lib/db/oauth-clients";

const SERVER_URL = "https://0xfake.myvana.app";
const CONTROL_PLANE_SECRET = "vana_ps_supersecretcontrolplane";
const ACCESS_TOKEN = "vana_ps_issuedaccesstokenfortest";
const GRANT_ID = "0xgrant1234";

function builderClient(): OauthClientRow {
  return {
    client_id: "memory-app-dev",
    application_id: "memory-app",
    display_name: "Memory App",
    app_url: "https://memory-app.example",
    owner_address: "0xowneraddr",
    owner_vana_user_id: null,
    grantee_address: "0xbuilderaddress",
    builder_id: "0xbuilderid",
    public_key: "0x04abc",
    webhook_url: null,
    redirect_uris: [],
    registered_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  };
}

function identityOnlyClient(): OauthClientRow {
  return {
    ...builderClient(),
    grantee_address: null,
    builder_id: null,
    public_key: null,
  };
}

type FakeFetch = ReturnType<typeof createFakeFetch>;
function createFakeFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return handler(url, init);
  };
  // oauth4webapi feature-detects via Symbol; assign through Object.assign
  return Object.assign(fn as unknown as typeof fetch, { calls });
}

/**
 * oauth4webapi sends headers as a plain object with lowercase keys; our own
 * fetch call to /v1/grants uses TitleCase. Read both case-insensitively so
 * test handlers can validate auth without caring which side sent the request.
 */
function getHeader(
  init: RequestInit | undefined,
  name: string,
): string | undefined {
  const h = init?.headers as Record<string, string> | undefined;
  if (!h) return undefined;
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === name.toLowerCase()) return v;
  }
  return undefined;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function happyHandler(): (url: string, init?: RequestInit) => Response {
  return (url, init) => {
    if (url.endsWith("/oauth/token")) {
      // Validate the request looks like a real client_credentials flow.
      const auth = getHeader(init, "authorization") ?? "";
      if (!auth.startsWith("Basic ")) {
        return jsonResponse(401, { error: "invalid_client" });
      }
      return jsonResponse(200, {
        access_token: ACCESS_TOKEN,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    if (url.endsWith("/v1/grants")) {
      const auth = getHeader(init, "authorization") ?? "";
      if (auth !== `Bearer ${ACCESS_TOKEN}`) {
        return jsonResponse(401, { error: { message: "Invalid token" } });
      }
      return jsonResponse(201, { grantId: GRANT_ID });
    }
    return jsonResponse(404, { error: "unexpected url: " + url });
  };
}

function makeInput(
  overrides?: Partial<ExecuteGrantInput>,
  fetchImpl?: FakeFetch,
): ExecuteGrantInput {
  return {
    vanaUserId: "vana_user_test",
    clientId: "memory-app-dev",
    scopes: ["chatgpt.memories"],
    expiresAt: 0,
    nonce: 1,
    resolvePersonalServer: async () => ({
      serverId: "srv_test",
      serverUrl: SERVER_URL,
      controlPlaneSecret: CONTROL_PLANE_SECRET,
    }),
    resolveOauthClient: async () => builderClient(),
    fetchImpl: fetchImpl ?? createFakeFetch(happyHandler()),
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(() => clearAccessTokenCacheForTests());
afterEach(() => clearAccessTokenCacheForTests());

describe("executeGrantViaPersonalServer", () => {
  it("happy path: obtains access_token, mints grant", async () => {
    const fetchImpl = createFakeFetch(happyHandler());
    const result = await executeGrantViaPersonalServer(
      makeInput(undefined, fetchImpl),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.grantId).toBe(GRANT_ID);
      expect(result.granteeAddress).toBe("0xbuilderaddress");
      expect(result.personalServer.serverUrl).toBe(SERVER_URL);
    }
    // Token endpoint hit once, grants endpoint hit once
    const tokenCalls = fetchImpl.calls.filter((c) =>
      c.url.endsWith("/oauth/token"),
    );
    const grantCalls = fetchImpl.calls.filter((c) =>
      c.url.endsWith("/v1/grants"),
    );
    expect(tokenCalls).toHaveLength(1);
    expect(grantCalls).toHaveLength(1);
    // Body of token call is form-encoded with grant_type=client_credentials
    const tokenBody = tokenCalls[0].init?.body?.toString() ?? "";
    expect(tokenBody).toContain("grant_type=client_credentials");
    // Body of grant call is JSON with the resolved granteeAddress
    const grantBody = JSON.parse(grantCalls[0].init?.body as string);
    expect(grantBody.granteeAddress).toBe("0xbuilderaddress");
    expect(grantBody.scopes).toEqual(["chatgpt.memories"]);
  });

  it("caches access_token across calls (single token request)", async () => {
    const fetchImpl = createFakeFetch(happyHandler());
    const a = await executeGrantViaPersonalServer(
      makeInput(undefined, fetchImpl),
    );
    const b = await executeGrantViaPersonalServer(
      makeInput(undefined, fetchImpl),
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const tokenCalls = fetchImpl.calls.filter((c) =>
      c.url.endsWith("/oauth/token"),
    );
    expect(tokenCalls).toHaveLength(1); // single token mint, reused for both grants
  });

  it("refreshes access_token on 401 from /v1/grants", async () => {
    let tokensIssued = 0;
    let grantAttempts = 0;
    const fetchImpl = createFakeFetch((url, init) => {
      if (url.endsWith("/oauth/token")) {
        tokensIssued += 1;
        return jsonResponse(200, {
          access_token: `vana_ps_token${tokensIssued}`,
          token_type: "Bearer",
          expires_in: 3600,
        });
      }
      if (url.endsWith("/v1/grants")) {
        grantAttempts += 1;
        const auth = getHeader(init, "authorization") ?? "";
        // First call (with token1) → 401, second call (with token2) → 201
        if (auth === "Bearer vana_ps_token1") {
          return jsonResponse(401, { error: { message: "expired" } });
        }
        return jsonResponse(201, { grantId: GRANT_ID });
      }
      return jsonResponse(404, { error: "unexpected" });
    });

    const result = await executeGrantViaPersonalServer(
      makeInput(undefined, fetchImpl),
    );
    expect(result.ok).toBe(true);
    expect(tokensIssued).toBe(2);
    expect(grantAttempts).toBe(2);
  });

  it("returns no_personal_server when PS resolver returns null", async () => {
    const result = await executeGrantViaPersonalServer(
      makeInput({ resolvePersonalServer: async () => null }),
    );
    expect(result).toEqual({
      ok: false,
      code: "no_personal_server",
      message: expect.any(String),
    });
  });

  it("returns client_not_found when OAuth client is unknown", async () => {
    const result = await executeGrantViaPersonalServer(
      makeInput({ resolveOauthClient: async () => null }),
    );
    expect(result).toEqual({
      ok: false,
      code: "client_not_found",
      message: expect.stringContaining("memory-app-dev"),
    });
  });

  it("returns client_no_builder when OAuth client lacks builder triple", async () => {
    const result = await executeGrantViaPersonalServer(
      makeInput({ resolveOauthClient: async () => identityOnlyClient() }),
    );
    expect(result).toEqual({
      ok: false,
      code: "client_no_builder",
      message: expect.stringContaining("builder identity"),
    });
  });

  it("returns ps_token_failed when /oauth/token returns invalid_client", async () => {
    const fetchImpl = createFakeFetch((url) => {
      if (url.endsWith("/oauth/token")) {
        return jsonResponse(401, { error: "invalid_client" });
      }
      return jsonResponse(404, { error: "unexpected" });
    });
    const result = await executeGrantViaPersonalServer(
      makeInput(undefined, fetchImpl),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ps_token_failed");
    }
  });

  it("returns ps_rejected when /v1/grants returns 4xx (not 401) with token in hand", async () => {
    const fetchImpl = createFakeFetch((url) => {
      if (url.endsWith("/oauth/token")) {
        return jsonResponse(200, {
          access_token: ACCESS_TOKEN,
          token_type: "Bearer",
          expires_in: 3600,
        });
      }
      return jsonResponse(400, {
        error: { message: "Builder not registered" },
      });
    });
    const result = await executeGrantViaPersonalServer(
      makeInput(undefined, fetchImpl),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ps_rejected");
      expect(result.message).toContain("Builder not registered");
    }
  });

  it("returns no_grant_id when PS responds 200 without grantId", async () => {
    const fetchImpl = createFakeFetch((url) => {
      if (url.endsWith("/oauth/token")) {
        return jsonResponse(200, {
          access_token: ACCESS_TOKEN,
          token_type: "Bearer",
          expires_in: 3600,
        });
      }
      return jsonResponse(201, { somethingElse: true });
    });
    const result = await executeGrantViaPersonalServer(
      makeInput(undefined, fetchImpl),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("no_grant_id");
  });
});
