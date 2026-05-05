import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVanaSession: vi.fn(),
  fetchGoogleIdTokenForAudience: vi.fn(),
  deleteActiveSessionsBySid: vi.fn(),
}));

vi.mock("@/lib/auth/vana-session", () => ({
  getVanaSession: mocks.getVanaSession,
}));

vi.mock("@/lib/auth/google-id-token", () => ({
  fetchGoogleIdTokenForAudience: mocks.fetchGoogleIdTokenForAudience,
}));

vi.mock("@/lib/db/sessions", () => ({
  deleteActiveSessionsBySid: mocks.deleteActiveSessionsBySid,
}));

async function importRoute() {
  return await import("./route");
}

const VALID_VANA_USER_ID = "vana_user_" + "0".repeat(32);
const HYDRA_SESSION_ID = "hydra_sid_abc123";

let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function makeRequest(): Request {
  return new Request("https://account.vana.org/api/auth/logout", {
    method: "POST",
    headers: { authorization: "Bearer some-access-token" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.HYDRA_ADMIN_URL = "https://hydra-admin.example.com";
  process.env.HYDRA_ADMIN_AUDIENCE = "https://hydra-admin.example.com";
  // Don't touch NODE_ENV (read-only in this tsconfig). Default test env is fine.

  mocks.fetchGoogleIdTokenForAudience.mockResolvedValue("google-id-token-xyz");
  mocks.deleteActiveSessionsBySid.mockResolvedValue(1);

  fetchMock = vi.fn();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  consoleErrorSpy.mockRestore();
});

describe("POST /api/auth/logout (authenticated)", () => {
  it("calls Hydra admin DELETE with subject + Bearer, deletes the active session, clears cookies, returns 200", async () => {
    mocks.getVanaSession.mockResolvedValue({
      vanaUserId: VALID_VANA_USER_ID,
      hydraSessionId: HYDRA_SESSION_ID,
      scope: ["openid"],
      audience: ["account.vana.org"],
    });
    fetchMock.mockResolvedValue(
      new Response(null, { status: 204 }) as unknown as Response,
    );

    const { POST } = await importRoute();
    const response = await POST(makeRequest() as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);

    // Hydra admin called once with the right URL + Bearer.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toBe(
      `https://hydra-admin.example.com/admin/oauth2/auth/sessions/login?subject=${encodeURIComponent(
        VALID_VANA_USER_ID,
      )}`,
    );
    expect(calledInit?.method).toBe("DELETE");
    expect((calledInit?.headers as Record<string, string>).authorization).toBe(
      "Bearer google-id-token-xyz",
    );

    // Google ID-token fetched with the admin audience.
    expect(mocks.fetchGoogleIdTokenForAudience).toHaveBeenCalledWith(
      "https://hydra-admin.example.com",
    );

    // Active session row dropped by sid.
    expect(mocks.deleteActiveSessionsBySid).toHaveBeenCalledWith(
      HYDRA_SESSION_ID,
    );

    // Cookies cleared.
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("vana_session=");
    expect(setCookie).toContain("vana_access=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("treats Hydra 404 as success and still drops the active-session row", async () => {
    mocks.getVanaSession.mockResolvedValue({
      vanaUserId: VALID_VANA_USER_ID,
      hydraSessionId: HYDRA_SESSION_ID,
      scope: [],
      audience: ["account.vana.org"],
    });
    fetchMock.mockResolvedValue(
      new Response("not found", { status: 404 }) as unknown as Response,
    );

    const { POST } = await importRoute();
    const response = await POST(makeRequest() as never);

    expect(response.status).toBe(200);
    expect(mocks.deleteActiveSessionsBySid).toHaveBeenCalledWith(
      HYDRA_SESSION_ID,
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/logout (unauthenticated)", () => {
  it("clears cookies, makes no Hydra/DB calls, returns 200", async () => {
    mocks.getVanaSession.mockResolvedValue(null);

    const { POST } = await importRoute();
    const response = await POST(makeRequest() as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.fetchGoogleIdTokenForAudience).not.toHaveBeenCalled();
    expect(mocks.deleteActiveSessionsBySid).not.toHaveBeenCalled();

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("vana_session=");
    expect(setCookie).toContain("vana_access=");
    expect(setCookie).toContain("Max-Age=0");
  });
});

describe("POST /api/auth/logout (Hydra failure)", () => {
  it("logs and still clears cookies + returns 200 when Hydra admin returns 5xx", async () => {
    mocks.getVanaSession.mockResolvedValue({
      vanaUserId: VALID_VANA_USER_ID,
      hydraSessionId: HYDRA_SESSION_ID,
      scope: [],
      audience: ["account.vana.org"],
    });
    fetchMock.mockResolvedValue(
      new Response("kaboom", { status: 503 }) as unknown as Response,
    );

    const { POST } = await importRoute();
    const response = await POST(makeRequest() as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);

    // The active-session row is still dropped — failure of Hydra doesn't
    // block local revocation.
    expect(mocks.deleteActiveSessionsBySid).toHaveBeenCalledWith(
      HYDRA_SESSION_ID,
    );

    // Error was logged.
    expect(consoleErrorSpy).toHaveBeenCalled();
    const errMsg = String(consoleErrorSpy.mock.calls[0]?.[0] ?? "");
    expect(errMsg).toContain("[logout] hydra admin revoke failed");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("vana_session=");
    expect(setCookie).toContain("vana_access=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("logs and still returns 200 when fetch itself throws", async () => {
    mocks.getVanaSession.mockResolvedValue({
      vanaUserId: VALID_VANA_USER_ID,
      hydraSessionId: HYDRA_SESSION_ID,
      scope: [],
      audience: ["account.vana.org"],
    });
    fetchMock.mockRejectedValue(new Error("network down"));

    const { POST } = await importRoute();
    const response = await POST(makeRequest() as never);

    expect(response.status).toBe(200);
    expect(mocks.deleteActiveSessionsBySid).toHaveBeenCalledWith(
      HYDRA_SESSION_ID,
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
