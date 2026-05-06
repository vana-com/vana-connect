import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetVanaFetchForTests,
  setPrivyIdentityTokenGetter,
  vanaFetch,
  VanaSessionUnavailableError,
} from "./vana-fetch";

const ACCESS_COOKIE = "vana_access";

/** Wipe document.cookie. jsdom expires cookies whose value is set with
 * `expires` in the past. */
function clearCookies(): void {
  // Get every cookie name currently visible and expire it.
  const raw = document.cookie;
  if (!raw) return;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    const name = (eq === -1 ? part : part.slice(0, eq)).trim();
    if (!name) continue;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

function setAccessCookie(value: string): void {
  document.cookie = `${ACCESS_COOKIE}=${encodeURIComponent(value)}; path=/`;
}

/**
 * Build a Response with a JSON body. `body` defaults to an empty object so
 * `response.clone().json()` succeeds.
 */
function jsonResponse(
  status: number,
  body: unknown = {},
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function getAuthHeader(call: unknown): string | null {
  // `fetch` mock receives (input, init?) — we only inspect init.headers.
  const args = call as [unknown, RequestInit | undefined];
  const init = args[1];
  if (!init?.headers) return null;
  const headers = new Headers(init.headers);
  return headers.get("Authorization");
}

describe("vanaFetch", () => {
  beforeEach(() => {
    clearCookies();
    __resetVanaFetchForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearCookies();
    __resetVanaFetchForTests();
  });

  it("attaches Bearer header on GET when cookie is present and does not bootstrap", async () => {
    setAccessCookie("tok-abc");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await vanaFetch("/api/me");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAuthHeader(fetchMock.mock.calls[0])).toBe("Bearer tok-abc");
  });

  it("attaches Bearer header on POST when cookie is present and does not bootstrap", async () => {
    setAccessCookie("tok-xyz");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    await vanaFetch("/api/foo", { method: "POST", body: '{"a":1}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [unknown, RequestInit];
    expect(call[1].method).toBe("POST");
    expect(getAuthHeader(call)).toBe("Bearer tok-xyz");
  });

  it("on GET with no cookie, fires fetch without Authorization (cookie-path read)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    await vanaFetch("/api/me");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAuthHeader(fetchMock.mock.calls[0])).toBeNull();
  });

  it("on POST with no cookie, bootstraps via /api/auth/session, then issues request with Bearer", async () => {
    setPrivyIdentityTokenGetter(() => "id-token-1");

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("/api/auth/session");
        // Server "set" the cookie:
        setAccessCookie("tok-fresh");
        return jsonResponse(200, { ok: true });
      })
      .mockImplementationOnce(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await vanaFetch("/api/foo", { method: "POST" });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAuthHeader(fetchMock.mock.calls[1])).toBe("Bearer tok-fresh");
  });

  it("on POST with no cookie and bootstrap 5xx, throws and never issues the original fetch", async () => {
    setPrivyIdentityTokenGetter(() => "id-token-1");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: "boom" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      vanaFetch("/api/foo", { method: "POST" }),
    ).rejects.toBeInstanceOf(VanaSessionUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/auth/session");
  });

  it("on POST with no cookie and no getter registered, throws and never issues fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      vanaFetch("/api/foo", { method: "POST" }),
    ).rejects.toBeInstanceOf(VanaSessionUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries once on 401 authentication_error after a successful bootstrap", async () => {
    setAccessCookie("tok-old");
    setPrivyIdentityTokenGetter(() => "id-token-2");

    const fetchMock = vi
      .fn()
      // First app call: 401 with auth_error body
      .mockImplementationOnce(async () =>
        jsonResponse(401, { error: { type: "authentication_error" } }),
      )
      // Bootstrap call: success, sets a new cookie
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("/api/auth/session");
        // Replace cookie with a fresh value
        setAccessCookie("tok-new");
        return jsonResponse(200);
      })
      // Retry app call: success
      .mockImplementationOnce(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await vanaFetch("/api/foo", { method: "POST" });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // First call used the old cookie; retry used the new one.
    expect(getAuthHeader(fetchMock.mock.calls[0])).toBe("Bearer tok-old");
    expect(getAuthHeader(fetchMock.mock.calls[2])).toBe("Bearer tok-new");
  });

  it("returns the original 401 response when the bootstrap retry also fails", async () => {
    setAccessCookie("tok-old");
    setPrivyIdentityTokenGetter(() => "id-token-3");

    const original = jsonResponse(401, {
      error: { type: "authentication_error" },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(jsonResponse(500)); // bootstrap fails
    vi.stubGlobal("fetch", fetchMock);

    const res = await vanaFetch("/api/foo", { method: "POST" });
    expect(res).toBe(original);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not loop: a 401 after bootstrap-on-this-call is final", async () => {
    setPrivyIdentityTokenGetter(() => "id-token-4");

    const fetchMock = vi
      .fn()
      // Bootstrap (cookie missing → bootstrap first)
      .mockImplementationOnce(async () => {
        setAccessCookie("tok-1");
        return jsonResponse(200);
      })
      // Original request returns 401
      .mockImplementationOnce(async () =>
        jsonResponse(401, { error: { type: "authentication_error" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await vanaFetch("/api/foo", { method: "POST" });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("replaces caller-provided Authorization header with the cookie-derived one", async () => {
    setAccessCookie("tok-from-cookie");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    await vanaFetch("/api/foo", {
      method: "POST",
      headers: { Authorization: "Bearer attacker-supplied" },
    });
    expect(getAuthHeader(fetchMock.mock.calls[0])).toBe(
      "Bearer tok-from-cookie",
    );
  });

  it("preserves caller-supplied non-Authorization headers", async () => {
    setAccessCookie("tok-1");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    await vanaFetch("/api/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vana-confirmation-id": "conf-123",
      },
    });
    const call = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const headers = new Headers(call[1].headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("x-vana-confirmation-id")).toBe("conf-123");
    expect(headers.get("Authorization")).toBe("Bearer tok-1");
  });

  it("dedupes concurrent bootstraps when two mutating calls race with no cookie", async () => {
    setPrivyIdentityTokenGetter(() => "id-token-shared");

    let bootstrapCalls = 0;
    let resolveBootstrap: (() => void) | null = null;
    const bootstrapStarted = new Promise<void>((resolve) => {
      // Capture so we can wait for the first call to be in-flight before
      // firing the second.
      resolveBootstrap = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/session") {
          bootstrapCalls += 1;
          // Signal that the bootstrap call has started; let the second
          // vanaFetch piggyback on it.
          resolveBootstrap?.();
          // Yield a few microtasks so the second caller actually reaches
          // ensureBootstrap before we resolve.
          await new Promise((r) => setTimeout(r, 10));
          setAccessCookie("tok-shared");
          return jsonResponse(200);
        }
        return jsonResponse(200, { url });
      });
    vi.stubGlobal("fetch", fetchMock);

    const a = vanaFetch("/api/a", { method: "POST" });
    await bootstrapStarted; // ensure bootstrap is in flight
    const b = vanaFetch("/api/b", { method: "POST" });

    const [resA, resB] = await Promise.all([a, b]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(bootstrapCalls).toBe(1);
    // Total calls: 1 bootstrap + 2 app calls = 3
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws when called without a document (SSR guard)", async () => {
    const originalDocument = globalThis.document;
    // jsdom's document is non-configurable on globalThis in some setups; use
    // delete + restore via Object.defineProperty for safety.
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined,
    });
    try {
      await expect(vanaFetch("/api/foo")).rejects.toBeInstanceOf(
        VanaSessionUnavailableError,
      );
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  });
});
