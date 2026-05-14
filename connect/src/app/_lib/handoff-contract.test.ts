import { describe, expect, it } from "vitest";
import {
  HANDOFF_CONTEXT_TTL_MS,
  HANDOFF_COOKIE_KEY,
  HANDOFF_RETURN_TO_DEFAULT,
  HANDOFF_STORAGE_KEY,
  parseFromCookie,
  resolveHandoffContext,
  resolvePostAuthDestination,
  parseFromSearchParams,
  parseFromStorage,
  resolveByPrecedence,
  serializeHandoffContext,
  toConnectUrl,
  toDownloadDataConnectUrl,
  toLoginUrl,
  type ConnectHandoffContext,
} from "./handoff-contract";
import { APP_ROUTES } from "@/app/routes";

const NOW = 1_700_000_000_000;

function createContext(
  overrides: Partial<ConnectHandoffContext> = {},
): ConnectHandoffContext {
  return {
    version: 1,
    sessionId: "sess-1",
    secret: "sec-1",
    mode: null,
    relayUrl: null,
    appUrl: null,
    dataSource: null,
    app: "discover-me",
    appId: "app-1",
    appName: "Discover Me",
    redirectUri: null,
    oauthState: null,
    returnTo: "/connect",
    createdAt: NOW,
    ...overrides,
  };
}

describe("handoff-contract", () => {
  it("parses valid query params into handoff context", () => {
    const params = new URLSearchParams(
      "sessionId=sess-123&secret=sec-abc&appUrl=https%3A%2F%2Ffoo-bar.com%2Fapp&dataSource=Instagram&app=discover-me&appId=foo&appName=Foo",
    );

    const parsed = parseFromSearchParams(params, NOW);

    expect(parsed).toEqual(
      createContext({
        sessionId: "sess-123",
        secret: "sec-abc",
        appUrl: "https://foo-bar.com/app",
        dataSource: "Instagram",
        appId: "foo",
        appName: "Foo",
      }),
    );
  });

  it("returns null when query params do not include sessionId", () => {
    const parsed = parseFromSearchParams(
      new URLSearchParams("secret=sec-abc"),
      NOW,
    );
    expect(parsed).toBeNull();
  });

  it("falls back to default returnTo when protocol-relative returnTo is provided", () => {
    const parsed = parseFromSearchParams(
      new URLSearchParams("sessionId=sess-123&returnTo=%2F%2Fevil.test"),
      NOW,
    );
    expect(parsed?.returnTo).toBe(HANDOFF_RETURN_TO_DEFAULT);
  });

  it("parses handoff context from cookie header", () => {
    const payload = encodeURIComponent(
      serializeHandoffContext(createContext()),
    );
    const cookieHeader = `foo=bar; ${HANDOFF_COOKIE_KEY}=${payload}; other=baz`;

    const parsed = parseFromCookie(cookieHeader, NOW);

    expect(parsed).toEqual(createContext());
  });

  it("returns null for unversioned storage payloads", () => {
    const parsed = parseFromStorage(
      JSON.stringify({ sessionId: "sess-legacy", secret: null }),
      NOW,
    );
    expect(parsed).toBeNull();
  });

  it("exposes storage key used by handoff flow", () => {
    expect(HANDOFF_STORAGE_KEY).toBe("vana_connect_session");
  });

  it("resolves first valid candidate by source precedence", () => {
    const selected = resolveByPrecedence(
      {
        storage: createContext({ sessionId: "sess-storage" }),
        cookie: createContext({ sessionId: "sess-cookie" }),
        url: createContext({ sessionId: "sess-url" }),
      },
      NOW,
    );

    expect(selected?.sessionId).toBe("sess-url");
  });

  it("skips expired context candidates", () => {
    const expiredContext = createContext({
      sessionId: "sess-expired",
      createdAt: NOW - HANDOFF_CONTEXT_TTL_MS - 1,
    });
    const freshStorage = createContext({ sessionId: "sess-storage" });

    const selected = resolveByPrecedence(
      {
        url: expiredContext,
        storage: freshStorage,
      },
      NOW,
    );

    expect(selected?.sessionId).toBe("sess-storage");
  });

  it("builds canonical connect URL from context", () => {
    const url = toConnectUrl(
      createContext({
        sessionId: "sess-xyz",
        secret: null,
        appUrl: "https://foo-bar.com",
        dataSource: "Instagram",
      }),
    );
    expect(url).toBe(
      "/connect?sessionId=sess-xyz&appUrl=https%3A%2F%2Ffoo-bar.com&dataSource=Instagram&app=discover-me&appId=app-1&appName=Discover+Me",
    );
  });

  it("builds canonical login URL from context", () => {
    const url = toLoginUrl(
      createContext({
        sessionId: "sess-xyz",
        secret: null,
        appUrl: "https://foo-bar.com",
        dataSource: "Instagram",
      }),
    );
    expect(url).toBe(
      "/login?sessionId=sess-xyz&appUrl=https%3A%2F%2Ffoo-bar.com&dataSource=Instagram&app=discover-me&appId=app-1&appName=Discover+Me",
    );
  });

  it("resolves unified context from url/cookie/storage candidates", () => {
    const selected = resolveHandoffContext({
      searchParams: new URLSearchParams("sessionId=sess-url"),
      cookieHeader: `${HANDOFF_COOKIE_KEY}=${encodeURIComponent(serializeHandoffContext(createContext({ sessionId: "sess-cookie" })))}`,
      rawStorageValue: serializeHandoffContext(
        createContext({ sessionId: "sess-storage", secret: null }),
      ),
      now: NOW,
    });

    expect(selected?.sessionId).toBe("sess-url");
  });

  it("can ignore cookie/storage fallbacks when query is missing", () => {
    const cookieContext = createContext({ sessionId: "sess-cookie" });
    const storageContext = createContext({ sessionId: "sess-storage" });
    const selected = resolveHandoffContext({
      searchParams: new URLSearchParams(""),
      cookieHeader: `${HANDOFF_COOKIE_KEY}=${encodeURIComponent(serializeHandoffContext(cookieContext))}`,
      rawStorageValue: serializeHandoffContext(storageContext),
      includeCookie: false,
      includeStorage: false,
      now: NOW,
    });

    expect(selected).toBeNull();
  });

  it("can ignore URL context when escape hatch requests a hard reset", () => {
    const selected = resolveHandoffContext({
      searchParams: new URLSearchParams("sessionId=sess-url&secret=sec-url"),
      includeUrl: false,
      includeCookie: false,
      includeStorage: false,
      now: NOW,
    });

    expect(selected).toBeNull();
  });

  it("recovers context from storage when query is missing (oauth return)", () => {
    const selected = resolveHandoffContext({
      searchParams: new URLSearchParams(""),
      rawStorageValue: serializeHandoffContext(
        createContext({ sessionId: "sess-storage" }),
      ),
      now: NOW,
    });

    expect(selected?.sessionId).toBe("sess-storage");
    expect(resolvePostAuthDestination(selected)).toContain(
      "sessionId=sess-storage",
    );
  });

  it("uses cookie when storage context is expired", () => {
    const expiredStorage = createContext({
      sessionId: "sess-storage-expired",
      createdAt: NOW - HANDOFF_CONTEXT_TTL_MS - 1000,
    });
    const cookieContext = createContext({ sessionId: "sess-cookie-fresh" });

    const selected = resolveHandoffContext({
      searchParams: new URLSearchParams(""),
      cookieHeader: `${HANDOFF_COOKIE_KEY}=${encodeURIComponent(serializeHandoffContext(cookieContext))}`,
      rawStorageValue: serializeHandoffContext(expiredStorage),
      now: NOW,
    });

    expect(selected?.sessionId).toBe("sess-cookie-fresh");
  });

  it("rehydrates secret from storage when cookie omits it", () => {
    const cookieContext = createContext({
      sessionId: "sess-1",
      secret: null,
    });
    const storageContext = createContext({
      sessionId: "sess-1",
      secret: "sec-storage",
    });

    const selected = resolveHandoffContext({
      searchParams: new URLSearchParams(""),
      cookieHeader: `${HANDOFF_COOKIE_KEY}=${encodeURIComponent(serializeHandoffContext(cookieContext))}`,
      rawStorageValue: serializeHandoffContext(storageContext),
      now: NOW,
    });

    expect(selected?.sessionId).toBe("sess-1");
    expect(selected?.secret).toBe("sec-storage");
  });

  it("resolves post-auth fallback when no context", () => {
    expect(resolvePostAuthDestination(null)).toBe("/admin");
    expect(resolvePostAuthDestination(createContext())).toContain("/connect?");
  });

  it("resolves post-auth destination to download route when requested", () => {
    const destination = resolvePostAuthDestination(
      createContext({
        returnTo: APP_ROUTES.downloadDataConnect,
        secret: null,
        appUrl: "https://foo-bar.com",
        dataSource: "Instagram",
      }),
    );
    expect(destination).toBe(
      "/download-data-connect?sessionId=sess-1&appUrl=https%3A%2F%2Ffoo-bar.com&dataSource=Instagram&app=discover-me&appId=app-1&appName=Discover+Me",
    );
  });

  it("resolves post-auth destination to custom internal path", () => {
    const destination = resolvePostAuthDestination(
      createContext({ returnTo: "/custom-destination" }),
    );
    expect(destination).toBe("/custom-destination");
  });

  it("builds canonical download URL from context", () => {
    const href = toDownloadDataConnectUrl(
      createContext({
        secret: null,
        appUrl: "https://foo-bar.com",
        dataSource: "Instagram",
      }),
    );
    expect(href).toBe(
      "/download-data-connect?sessionId=sess-1&appUrl=https%3A%2F%2Ffoo-bar.com&dataSource=Instagram&app=discover-me&appId=app-1&appName=Discover+Me",
    );
  });
});
