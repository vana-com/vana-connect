import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVanaSession: vi.fn(),
  acceptDeviceUserCodeRequest: vi.fn(),
}));

vi.mock("@/lib/auth/vana-session", () => ({
  getVanaSession: mocks.getVanaSession,
}));

vi.mock("@/lib/auth/hydra-admin", () => ({
  createHydraAdminClient: () => ({
    acceptDeviceUserCodeRequest: mocks.acceptDeviceUserCodeRequest,
  }),
}));

async function importRoute() {
  return await import("./route");
}

function makeRequest(body: unknown, opts: { bearer?: string } = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.bearer) headers.set("authorization", `Bearer ${opts.bearer}`);
  return new Request("https://account.vana.test/api/auth/oidc/device-accept", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_SESSION = {
  vanaUserId: "vana_user_0123456789abcdef0123456789abcdef",
  hydraSessionId: "hydra_session_abc",
  scope: ["openid"],
  audience: ["account.vana.org"],
};

describe("POST /api/auth/oidc/device-accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when Vana session is missing", async () => {
    mocks.getVanaSession.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ device_challenge: "x", user_code: "y" }) as never,
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { type?: string } };
    expect(body.error?.type).toBe("authentication_error");
    expect(mocks.acceptDeviceUserCodeRequest).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    mocks.getVanaSession.mockResolvedValue(VALID_SESSION);
    const { POST } = await importRoute();
    const malformed = new Request(
      "https://account.vana.test/api/auth/oidc/device-accept",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      },
    );
    const res = await POST(malformed as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when device_challenge is missing", async () => {
    mocks.getVanaSession.mockResolvedValue(VALID_SESSION);
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ user_code: "ABCD-EFGH" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when user_code is missing", async () => {
    mocks.getVanaSession.mockResolvedValue(VALID_SESSION);
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ device_challenge: "abc" }) as never);
    expect(res.status).toBe(400);
  });

  it("calls Hydra admin with the inputs and returns redirect_to", async () => {
    mocks.getVanaSession.mockResolvedValue(VALID_SESSION);
    mocks.acceptDeviceUserCodeRequest.mockResolvedValue({
      redirect_to: "https://hydra.example.com/oauth2/auth?ok=device",
    });
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        device_challenge: "dev-chal-1",
        user_code: "ABCD-EFGH",
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { redirect_to?: string };
    expect(body.redirect_to).toBe(
      "https://hydra.example.com/oauth2/auth?ok=device",
    );
    expect(mocks.acceptDeviceUserCodeRequest).toHaveBeenCalledWith(
      "dev-chal-1",
      { userCode: "ABCD-EFGH" },
    );
  });

  it("returns 502 when Hydra admin throws", async () => {
    mocks.getVanaSession.mockResolvedValue(VALID_SESSION);
    mocks.acceptDeviceUserCodeRequest.mockRejectedValue(
      new Error("hydra unreachable"),
    );
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        device_challenge: "dev-chal-1",
        user_code: "ABCD-EFGH",
      }) as never,
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: { type?: string } };
    expect(body.error?.type).toBe("upstream_error");
  });
});
