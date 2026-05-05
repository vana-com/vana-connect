import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVanaSession: vi.fn(),
  findLinkedWalletsByUser: vi.fn(),
  findServerById: vi.fn(),
  registerServerOnChain: vi.fn(),
}));

vi.mock("@/lib/auth/vana-session", () => ({
  getVanaSession: mocks.getVanaSession,
}));
vi.mock("@/lib/db/account", () => ({
  findLinkedWalletsByUser: mocks.findLinkedWalletsByUser,
}));
vi.mock("@/lib/db/neon", () => ({
  findServerById: mocks.findServerById,
}));
vi.mock("@/lib/server-provider/register-on-chain", () => ({
  registerServerOnChain: mocks.registerServerOnChain,
}));

async function importRoute() {
  return await import("./route");
}

const VANA_USER_ID = "vana_user_" + "0".repeat(32);
const HYDRA_SID = "hydra_sid";
const PRIMARY_WALLET_ADDR = "0xabcdef0123456789abcdef0123456789abcdef01";
const PRIMARY_WALLET_LOWER = PRIMARY_WALLET_ADDR.toLowerCase();

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

function makeReq(
  opts: {
    bearer?: string;
    confirmationId?: string;
    id?: string;
  } = {},
) {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${opts.bearer ?? "tok"}`);
  if (opts.confirmationId) {
    headers.set("x-vana-confirmation-id", opts.confirmationId);
  }
  return {
    request: new Request(
      `https://account.vana.org/api/servers/${opts.id ?? "srv_x"}/register-on-chain`,
      { method: "POST", headers },
    ),
    params: Promise.resolve({ id: opts.id ?? "srv_x" }),
  };
}

function defaultSession() {
  return {
    vanaUserId: VANA_USER_ID,
    hydraSessionId: HYDRA_SID,
    scope: ["openid", "offline"],
    audience: ["account.vana.org"],
  };
}

describe("POST /api/servers/[id]/register-on-chain", () => {
  it("returns 401 when no Vana session", async () => {
    mocks.getVanaSession.mockResolvedValue(null);
    const { POST } = await importRoute();
    const { request, params } = makeReq();
    const res = await POST(request as never, { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when user has no EVM wallet linked", async () => {
    mocks.getVanaSession.mockResolvedValue(defaultSession());
    mocks.findLinkedWalletsByUser.mockResolvedValue([]);
    const { POST } = await importRoute();
    const { request, params } = makeReq();
    const res = await POST(request as never, { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when server not found", async () => {
    mocks.getVanaSession.mockResolvedValue(defaultSession());
    mocks.findLinkedWalletsByUser.mockResolvedValue([
      {
        id: "vana_wallet_x",
        chain_type: "evm",
        address: PRIMARY_WALLET_LOWER,
        is_primary: true,
      },
    ]);
    mocks.findServerById.mockResolvedValue(null);
    const { POST } = await importRoute();
    const { request, params } = makeReq();
    const res = await POST(request as never, { params });
    expect(res.status).toBe(404);
  });

  it("returns 404 when server.user_id does not match user (legacy or new)", async () => {
    mocks.getVanaSession.mockResolvedValue(defaultSession());
    mocks.findLinkedWalletsByUser.mockResolvedValue([
      {
        id: "vana_wallet_x",
        chain_type: "evm",
        address: PRIMARY_WALLET_LOWER,
        is_primary: true,
      },
    ]);
    mocks.findServerById.mockResolvedValue({
      id: "srv_x",
      user_id: "0xsomeoneelse",
      url: "https://0xfoo.myvana.app",
    });
    const { POST } = await importRoute();
    const { request, params } = makeReq();
    const res = await POST(request as never, { params });
    expect(res.status).toBe(404);
  });

  it("accepts server.user_id matching the legacy lowercased address", async () => {
    mocks.getVanaSession.mockResolvedValue(defaultSession());
    mocks.findLinkedWalletsByUser.mockResolvedValue([
      {
        id: "vana_wallet_x",
        chain_type: "evm",
        address: PRIMARY_WALLET_LOWER,
        is_primary: true,
      },
    ]);
    mocks.findServerById.mockResolvedValue({
      id: "srv_x",
      user_id: PRIMARY_WALLET_LOWER, // legacy
      url: "https://0xfoo.myvana.app",
    });
    mocks.registerServerOnChain.mockResolvedValue({
      ok: true,
      data: { serverId: "srv_chain_id", serverAddress: "0xC3" },
    });
    const { POST } = await importRoute();
    const { request, params } = makeReq();
    const res = await POST(request as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serverId).toBe("srv_chain_id");
  });

  it("accepts server.user_id matching the new vanaUserId", async () => {
    mocks.getVanaSession.mockResolvedValue(defaultSession());
    mocks.findLinkedWalletsByUser.mockResolvedValue([
      {
        id: "vana_wallet_x",
        chain_type: "evm",
        address: PRIMARY_WALLET_LOWER,
        is_primary: true,
      },
    ]);
    mocks.findServerById.mockResolvedValue({
      id: "srv_x",
      user_id: VANA_USER_ID, // new semantics
      url: "https://0xfoo.myvana.app",
    });
    mocks.registerServerOnChain.mockResolvedValue({
      ok: true,
      data: { serverId: "srv_chain_id", serverAddress: "0xC3" },
    });
    const { POST } = await importRoute();
    const { request, params } = makeReq();
    const res = await POST(request as never, { params });
    expect(res.status).toBe(200);
  });

  it("returns 400 when server has no url yet", async () => {
    mocks.getVanaSession.mockResolvedValue(defaultSession());
    mocks.findLinkedWalletsByUser.mockResolvedValue([
      {
        id: "vana_wallet_x",
        chain_type: "evm",
        address: PRIMARY_WALLET_LOWER,
        is_primary: true,
      },
    ]);
    mocks.findServerById.mockResolvedValue({
      id: "srv_x",
      user_id: PRIMARY_WALLET_LOWER,
      url: null,
    });
    const { POST } = await importRoute();
    const { request, params } = makeReq();
    const res = await POST(request as never, { params });
    expect(res.status).toBe(400);
  });

  it("returns 401 confirmation_required envelope when wallet API requires confirmation", async () => {
    mocks.getVanaSession.mockResolvedValue(defaultSession());
    mocks.findLinkedWalletsByUser.mockResolvedValue([
      {
        id: "vana_wallet_x",
        chain_type: "evm",
        address: PRIMARY_WALLET_LOWER,
        is_primary: true,
      },
    ]);
    mocks.findServerById.mockResolvedValue({
      id: "srv_x",
      user_id: PRIMARY_WALLET_LOWER,
      url: "https://0xfoo.myvana.app",
    });
    mocks.registerServerOnChain.mockResolvedValue({
      ok: false,
      error: {
        code: "CONFIRMATION_REQUIRED",
        message: "User confirmation required",
        confirmationId: "vana_confirm_abc",
        payloadSummary: { purpose: "register_personal_server" },
        expiresAt: "2030-01-01T00:00:00Z",
      },
    });
    const { POST } = await importRoute();
    const { request, params } = makeReq();
    const res = await POST(request as never, { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("confirmation_required");
    expect(body.confirmation_id).toBe("vana_confirm_abc");
    expect(body.payload_summary).toEqual({
      purpose: "register_personal_server",
    });
    expect(body.expires_at).toBe("2030-01-01T00:00:00Z");
  });

  it("forwards x-vana-confirmation-id when client retries", async () => {
    mocks.getVanaSession.mockResolvedValue(defaultSession());
    mocks.findLinkedWalletsByUser.mockResolvedValue([
      {
        id: "vana_wallet_x",
        chain_type: "evm",
        address: PRIMARY_WALLET_LOWER,
        is_primary: true,
      },
    ]);
    mocks.findServerById.mockResolvedValue({
      id: "srv_x",
      user_id: PRIMARY_WALLET_LOWER,
      url: "https://0xfoo.myvana.app",
    });
    mocks.registerServerOnChain.mockResolvedValue({
      ok: true,
      data: { serverId: "srv_x", serverAddress: "0xC3" },
    });
    const { POST } = await importRoute();
    const { request, params } = makeReq({ confirmationId: "vana_confirm_xyz" });
    await POST(request as never, { params });
    expect(mocks.registerServerOnChain).toHaveBeenCalledWith(
      expect.objectContaining({ confirmationId: "vana_confirm_xyz" }),
    );
  });

  it("returns 400 for WALLET_NOT_SUPPORTED", async () => {
    mocks.getVanaSession.mockResolvedValue(defaultSession());
    mocks.findLinkedWalletsByUser.mockResolvedValue([
      {
        id: "vana_wallet_x",
        chain_type: "evm",
        address: PRIMARY_WALLET_LOWER,
        is_primary: true,
      },
    ]);
    mocks.findServerById.mockResolvedValue({
      id: "srv_x",
      user_id: PRIMARY_WALLET_LOWER,
      url: "https://0xfoo.myvana.app",
    });
    mocks.registerServerOnChain.mockResolvedValue({
      ok: false,
      error: {
        code: "WALLET_NOT_SUPPORTED",
        message: "user_controlled_eoa not supported",
      },
    });
    const { POST } = await importRoute();
    const { request, params } = makeReq();
    const res = await POST(request as never, { params });
    expect(res.status).toBe(400);
  });

  it("returns 500 for generic register failures", async () => {
    mocks.getVanaSession.mockResolvedValue(defaultSession());
    mocks.findLinkedWalletsByUser.mockResolvedValue([
      {
        id: "vana_wallet_x",
        chain_type: "evm",
        address: PRIMARY_WALLET_LOWER,
        is_primary: true,
      },
    ]);
    mocks.findServerById.mockResolvedValue({
      id: "srv_x",
      user_id: PRIMARY_WALLET_LOWER,
      url: "https://0xfoo.myvana.app",
    });
    mocks.registerServerOnChain.mockResolvedValue({
      ok: false,
      error: { code: "HEALTH_FETCH_FAILED", message: "PS unreachable" },
    });
    const { POST } = await importRoute();
    const { request, params } = makeReq();
    const res = await POST(request as never, { params });
    expect(res.status).toBe(500);
  });
});
