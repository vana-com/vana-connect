import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  router: {
    replace: vi.fn(),
  },
  handoffContext: null as {
    sessionId: string;
    secret: string;
    redirectUri: string | null;
    oauthState: string | null;
    appUrl: string | null;
    dataSource: string | null;
    app: string | null;
    appId: string | null;
    appName: string | null;
  } | null,
  privyState: {
    ready: true,
    authenticated: false,
  },
  walletsState: {
    wallets: [] as Array<{ walletClientType?: string; address?: string }>,
    ready: true,
  },
  signMessage: vi.fn(),
  addSigners: vi.fn(),
  createWallet: vi.fn(),
  persistHandoffContext: vi.fn(),
  clearHandoffContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => mocks.router,
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mocks.privyState,
  useSignMessage: () => ({
    signMessage: mocks.signMessage,
  }),
  useSigners: () => ({
    addSigners: mocks.addSigners,
  }),
  useWallets: () => mocks.walletsState,
  useCreateWallet: () => ({
    createWallet: mocks.createWallet,
  }),
}));

vi.mock("@/app/_lib/use-handoff-resolution", () => ({
  useHandoffResolution: () => ({
    handoffContext: mocks.handoffContext,
  }),
}));

vi.mock("@/app/_lib/handoff-contract", () => ({
  clearHandoffContext: mocks.clearHandoffContext,
  persistHandoffContext: mocks.persistHandoffContext,
  toDownloadDataConnectUrl: () => "/download-data-connect",
  toLoginUrl: () => "/login?sessionId=sess-live",
}));

import { useConnectPage } from "./use-connect-page";

describe("useConnectPage debug scenarios", () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams();
    mocks.router.replace.mockReset();
    mocks.handoffContext = null;
    mocks.privyState.ready = true;
    mocks.privyState.authenticated = false;
    mocks.walletsState.wallets = [];
    mocks.walletsState.ready = true;
    mocks.signMessage.mockReset();
    mocks.addSigners.mockReset();
    mocks.createWallet.mockReset();
    mocks.persistHandoffContext.mockReset();
    mocks.clearHandoffContext.mockReset();
  });

  it("renders debug error UI without redirecting to login", async () => {
    mocks.searchParams = new URLSearchParams("authDebug=1&scenario=error");

    const { result } = renderHook(() => useConnectPage());

    await waitFor(() => {
      expect(result.current.view).toBe("error");
    });

    expect(result.current.sessionId).toBe("sess-debug");
    expect(result.current.error).toBe(
      "Failed to sign master key. Please try again.",
    );
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("does not persist handoff context or create a wallet during debug scenarios", async () => {
    mocks.searchParams = new URLSearchParams("authDebug=1&scenario=ready");
    mocks.handoffContext = {
      sessionId: "sess-live",
      secret: "sec-live",
      redirectUri: null,
      oauthState: null,
      appUrl: "https://promptgallery.org",
      dataSource: "posts",
      app: "prompt-gallery",
      appId: "app-1",
      appName: "Prompt Gallery",
    };
    mocks.privyState.authenticated = true;

    const { result } = renderHook(() => useConnectPage());

    await waitFor(() => {
      expect(result.current.view).toBe("ready");
    });

    expect(mocks.persistHandoffContext).not.toHaveBeenCalled();
    expect(mocks.clearHandoffContext).not.toHaveBeenCalled();
    expect(mocks.createWallet).not.toHaveBeenCalled();
  });

  it("does not add signers or sign when debug scenario is active", async () => {
    mocks.searchParams = new URLSearchParams("authDebug=1&scenario=ready");
    mocks.handoffContext = {
      sessionId: "sess-live",
      secret: "sec-live",
      redirectUri: null,
      oauthState: null,
      appUrl: "https://promptgallery.org",
      dataSource: "posts",
      app: "prompt-gallery",
      appId: "app-1",
      appName: "Prompt Gallery",
    };
    mocks.privyState.authenticated = true;
    mocks.walletsState.wallets = [
      {
        walletClientType: "privy",
        address: "0xabc",
      },
    ];

    const { result } = renderHook(() => useConnectPage());

    await waitFor(() => {
      expect(result.current.view).toBe("ready");
    });

    expect(mocks.addSigners).not.toHaveBeenCalled();
    expect(mocks.signMessage).not.toHaveBeenCalled();
  });
});
