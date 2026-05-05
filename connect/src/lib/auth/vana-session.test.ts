// @vitest-environment node

import { describe, expect, it, beforeEach } from "vitest";
import {
  clearVanaSessionCaches,
  getVanaSession,
  type GetVanaSessionDeps,
} from "./vana-session";

const VALID_SUB = "vana_user_" + "0".repeat(32);
const HYDRA_SID = "hydra_session_abc";

function makeIntrospectResponse(
  overrides: Record<string, unknown> = {},
): Response {
  const body = {
    active: true,
    sub: VALID_SUB,
    aud: ["account.vana.org"],
    exp: Math.floor(Date.now() / 1000) + 600,
    iss: "https://hydra.test",
    scope: "openid offline",
    sid: HYDRA_SID,
    ...overrides,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makeReq(
  opts: {
    method?: string;
    bearer?: string;
    cookie?: string;
  } = {},
): Request {
  const headers = new Headers();
  if (opts.bearer) headers.set("authorization", `Bearer ${opts.bearer}`);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  return new Request("https://account.vana.org/test", {
    method: opts.method ?? "GET",
    headers,
  });
}

function makeDeps(
  overrides: Partial<GetVanaSessionDeps> = {},
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>,
): GetVanaSessionDeps {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (input: string, init?: RequestInit) => {
    calls.push({
      url: typeof input === "string" ? input : String(input),
      init,
    });
    if (fetchImpl) return fetchImpl(input, init);
    return makeIntrospectResponse();
  }) as unknown as typeof fetch;
  // Attach calls for assertions on the returned deps.
  (fn as unknown as { calls: typeof calls }).calls = calls;
  return {
    fetch: fn,
    hydraAdminUrl: "https://hydra-admin.test",
    hydraAdminAudience: "https://hydra-admin.test",
    hydraPublicUrl: "https://hydra.test",
    expectedAudience: "account.vana.org",
    isSessionTombstoned: async () => false,
    now: () => Date.now(),
    ...overrides,
  };
}

beforeEach(() => clearVanaSessionCaches());

describe("getVanaSession token extraction", () => {
  it("returns null when no auth header and no cookie", async () => {
    const session = await getVanaSession(makeReq(), makeDeps());
    expect(session).toBeNull();
  });

  it("accepts Bearer for state-mutating methods", async () => {
    const session = await getVanaSession(
      makeReq({ method: "POST", bearer: "tok_a" }),
      makeDeps(),
    );
    expect(session?.vanaUserId).toBe(VALID_SUB);
  });

  it("rejects cookie auth on POST (CSRF defense)", async () => {
    const session = await getVanaSession(
      makeReq({ method: "POST", cookie: "vana_session=tok_a" }),
      makeDeps(),
    );
    expect(session).toBeNull();
  });

  it("accepts cookie auth on GET", async () => {
    const session = await getVanaSession(
      makeReq({ method: "GET", cookie: "vana_session=tok_a" }),
      makeDeps(),
    );
    expect(session?.vanaUserId).toBe(VALID_SUB);
  });

  it("rejects on PUT/PATCH/DELETE without Bearer", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const session = await getVanaSession(
        makeReq({ method, cookie: "vana_session=tok_a" }),
        makeDeps(),
      );
      expect(session).toBeNull();
    }
  });
});

describe("getVanaSession introspection validation", () => {
  it("returns null when active=false", async () => {
    const session = await getVanaSession(
      makeReq({ bearer: "tok" }),
      makeDeps(
        {},
        async () =>
          new Response(JSON.stringify({ active: false }), { status: 200 }),
      ),
    );
    expect(session).toBeNull();
  });

  it("returns null when audience mismatch", async () => {
    const session = await getVanaSession(
      makeReq({ bearer: "tok" }),
      makeDeps({}, async () =>
        makeIntrospectResponse({ aud: ["some-other-app"] }),
      ),
    );
    expect(session).toBeNull();
  });

  it("returns null when issuer mismatch", async () => {
    const session = await getVanaSession(
      makeReq({ bearer: "tok" }),
      makeDeps({}, async () =>
        makeIntrospectResponse({ iss: "https://wrong-hydra.test" }),
      ),
    );
    expect(session).toBeNull();
  });

  it("returns null when sub is not a vana_user_<32hex>", async () => {
    const session = await getVanaSession(
      makeReq({ bearer: "tok" }),
      makeDeps({}, async () =>
        makeIntrospectResponse({ sub: "did:privy:abc123" }),
      ),
    );
    expect(session).toBeNull();
  });

  it("returns null when token_use is refresh", async () => {
    const session = await getVanaSession(
      makeReq({ bearer: "tok" }),
      makeDeps({}, async () =>
        makeIntrospectResponse({ token_use: "refresh_token" }),
      ),
    );
    expect(session).toBeNull();
  });

  it("returns null when expired beyond clock skew", async () => {
    const session = await getVanaSession(
      makeReq({ bearer: "tok" }),
      makeDeps({}, async () =>
        makeIntrospectResponse({
          exp: Math.floor(Date.now() / 1000) - 600,
        }),
      ),
    );
    expect(session).toBeNull();
  });

  it("accepts a token within 60s past exp (clock skew tolerance)", async () => {
    const session = await getVanaSession(
      makeReq({ bearer: "tok" }),
      makeDeps({}, async () =>
        makeIntrospectResponse({
          exp: Math.floor(Date.now() / 1000) - 30, // 30s past
        }),
      ),
    );
    expect(session?.vanaUserId).toBe(VALID_SUB);
  });

  it("returns null when Hydra introspection responds non-200", async () => {
    const session = await getVanaSession(
      makeReq({ bearer: "tok" }),
      makeDeps({}, async () => new Response("nope", { status: 500 })),
    );
    expect(session).toBeNull();
  });
});

describe("getVanaSession tombstone integration", () => {
  it("returns null when session is tombstoned", async () => {
    const session = await getVanaSession(
      makeReq({ bearer: "tok" }),
      makeDeps({ isSessionTombstoned: async () => true }),
    );
    expect(session).toBeNull();
  });

  it("calls tombstone check exactly once per session within 5s cache window", async () => {
    let tombstoneCalls = 0;
    const deps = makeDeps({
      isSessionTombstoned: async () => {
        tombstoneCalls++;
        return false;
      },
    });

    await getVanaSession(makeReq({ bearer: "tok" }), deps);
    await getVanaSession(makeReq({ bearer: "tok" }), deps);
    await getVanaSession(makeReq({ bearer: "tok" }), deps);
    expect(tombstoneCalls).toBe(1);
  });
});

describe("getVanaSession introspection cache", () => {
  it("calls Hydra exactly once for the same token within 30s window", async () => {
    let hydraCalls = 0;
    const deps = makeDeps({}, async () => {
      hydraCalls++;
      return makeIntrospectResponse();
    });
    await getVanaSession(makeReq({ bearer: "tok" }), deps);
    await getVanaSession(makeReq({ bearer: "tok" }), deps);
    expect(hydraCalls).toBe(1);
  });

  it("calls Hydra again after the cache expires (using injected clock)", async () => {
    let hydraCalls = 0;
    let now = Date.now();
    const deps = makeDeps({ now: () => now }, async () => {
      hydraCalls++;
      return makeIntrospectResponse();
    });
    await getVanaSession(makeReq({ bearer: "tok" }), deps);
    expect(hydraCalls).toBe(1);
    // Advance past the 30s cache.
    now += 31_000;
    await getVanaSession(makeReq({ bearer: "tok" }), deps);
    expect(hydraCalls).toBe(2);
  });
});

describe("getVanaSession returns canonical session", () => {
  it("yields vanaUserId, hydraSessionId, scope, audience", async () => {
    const session = await getVanaSession(
      makeReq({ bearer: "tok" }),
      makeDeps(),
    );
    expect(session).toEqual({
      vanaUserId: VALID_SUB,
      hydraSessionId: HYDRA_SID,
      scope: ["openid", "offline"],
      audience: ["account.vana.org"],
    });
  });
});
