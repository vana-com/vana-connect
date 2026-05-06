import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signMessage: vi.fn(),
  walletsState: {
    ready: true,
    wallets: [
      {
        walletClientType: "privy",
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      },
    ],
  },
}));

vi.mock("@privy-io/react-auth", () => ({
  useSignMessage: () => ({ signMessage: mocks.signMessage }),
  useWallets: () => mocks.walletsState,
  usePrivy: () => ({ ready: true, authenticated: true, login: vi.fn() }),
  useIdentityToken: () => ({ identityToken: "fake-id-token" }),
}));

vi.mock("@/components/auth/use-confirmation", async () => {
  // Preserve the real `readVanaAccessCookie` — tests set document.cookie
  // directly (`vana_access=vana-access-tok`) so the bootstrap hook flips
  // to "ready" without needing a network round-trip mock.
  const actual = await vi.importActual<
    typeof import("@/components/auth/use-confirmation")
  >("@/components/auth/use-confirmation");
  return {
    ...actual,
    useConfirmation: () => ({
      pending: null,
      error: null,
      confirm: vi.fn(),
      dismiss: vi.fn(),
      handle401: vi.fn(async () => null),
    }),
  };
});

import { useServer } from "./use-server";

describe("useServer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.signMessage.mockReset();
    mocks.signMessage.mockResolvedValue({ signature: "sig-123" });
    vi.stubGlobal("fetch", vi.fn());
    // Vana access cookie — the new auth path. PR-X: use-server reads
    // vana_access from document.cookie and sends it as Bearer.
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "vana_access=vana-access-tok; other=value",
      set: () => {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls the per-server route while provisioning and transitions to running", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            object: "server",
            id: "srv_123",
            user_id: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
            provider: "gcp",
            provider_id: "gcp-123",
            url: "https://ps.example.com",
            mcp_endpoint: "https://ps.example.com/mcp",
            state: "provisioning",
            created_at: "2026-03-23T00:00:00.000Z",
            updated_at: "2026-03-23T00:00:00.000Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            object: "server",
            id: "srv_123",
            user_id: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
            provider: "gcp",
            provider_id: "gcp-123",
            url: "https://ps.example.com",
            mcp_endpoint: "https://ps.example.com/mcp",
            state: "running",
            created_at: "2026-03-23T00:00:00.000Z",
            updated_at: "2026-03-23T00:05:00.000Z",
          }),
          { status: 200 },
        ),
      );

    const { result } = renderHook(() => useServer());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/servers", {
      headers: { Authorization: "Bearer vana-access-tok" },
    });

    await act(async () => {
      await result.current.provision();
    });

    expect(result.current.status).toBe("provisioning");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/servers/srv_123", {
      headers: { Authorization: "Bearer vana-access-tok" },
    });
    expect(result.current.status).toBe("running");
  });
});
