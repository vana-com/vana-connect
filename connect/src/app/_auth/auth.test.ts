import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authModule from "./auth";

const mockPrivy = vi.hoisted(() => ({
  mockLoginWithCode: vi.fn(),
  mockLogout: vi.fn(),
  mockInitialize: vi.fn(),
  mockSetMessagePoster: vi.fn(),
  mockGetAccessToken: vi.fn(),
  mockGetURL: vi.fn(() => "https://wallet.example/"),
  mockGetProvider: vi.fn(),
  mockProviderRequest: vi.fn(),
  mockEmailSendCode: vi.fn(),
  mockEmailLoginWithCode: vi.fn(),
  mockGenerateURL: vi.fn(),
  mockEmbeddedWalletCreate: vi.fn(),
  mockEmbeddedWalletOnMessage: vi.fn(),
}));

vi.mock("@privy-io/js-sdk-core", () => {
  class MockPrivyClient {
    auth = {
      logout: mockPrivy.mockLogout,
      oauth: {
        loginWithCode: mockPrivy.mockLoginWithCode,
        generateURL: mockPrivy.mockGenerateURL,
      },
      email: {
        sendCode: mockPrivy.mockEmailSendCode,
        loginWithCode: mockPrivy.mockEmailLoginWithCode,
      },
    };

    embeddedWallet = {
      getURL: mockPrivy.mockGetURL,
      getProvider: mockPrivy.mockGetProvider,
      create: mockPrivy.mockEmbeddedWalletCreate,
      onMessage: mockPrivy.mockEmbeddedWalletOnMessage,
    };

    setMessagePoster = mockPrivy.mockSetMessagePoster;
    initialize = mockPrivy.mockInitialize;
    getAccessToken = mockPrivy.mockGetAccessToken;
  }

  class LocalStorage {}

  return { default: MockPrivyClient, LocalStorage };
});

const { useAuthPage } = authModule;

const createDeferred = <T>() => {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (!resolve || !reject) {
    throw new Error("Failed to initialize deferred promise handlers");
  }
  return { promise, resolve, reject };
};

describe("useAuthPage", () => {
  beforeEach(() => {
    mockPrivy.mockLoginWithCode.mockReset();
    mockPrivy.mockLogout.mockReset();
    mockPrivy.mockInitialize.mockReset();
    mockPrivy.mockSetMessagePoster.mockReset();
    mockPrivy.mockGetAccessToken.mockReset();
    mockPrivy.mockGetURL.mockReset();
    mockPrivy.mockGetProvider.mockReset();
    mockPrivy.mockProviderRequest.mockReset();
    mockPrivy.mockEmailSendCode.mockReset();
    mockPrivy.mockEmailLoginWithCode.mockReset();
    mockPrivy.mockGenerateURL.mockReset();
    mockPrivy.mockEmbeddedWalletCreate.mockReset();
    mockPrivy.mockEmbeddedWalletOnMessage.mockReset();
    mockPrivy.mockGetURL.mockReturnValue("https://wallet.example/");
    mockPrivy.mockGetProvider.mockResolvedValue({
      request: mockPrivy.mockProviderRequest.mockResolvedValue("0xdeadbeef"),
    });
    mockPrivy.mockEmbeddedWalletCreate.mockResolvedValue({
      user: {
        linked_accounts: [
          { type: "wallet", address: "0xabc", walletClientType: "privy" },
        ],
      },
    });
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "app-id");
    vi.stubEnv("NEXT_PUBLIC_PRIVY_CLIENT_ID", "client-id");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  it("shows an error when auth callback fails", async () => {
    window.history.pushState(
      {},
      "",
      "/?privy_oauth_code=code&privy_oauth_state=state",
    );

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/auth-callback")) {
        return { ok: false, status: 500 } as Response;
      }
      return { ok: true, status: 200 } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const sessionDeferred = createDeferred<{
      user: {
        id: string;
        email?: { address?: string | null } | null;
        linked_accounts?: Array<{
          type: string;
          address?: string;
          walletClientType?: string;
        }>;
      };
    }>();
    mockPrivy.mockLoginWithCode.mockReturnValueOnce(sessionDeferred.promise);

    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(mockPrivy.mockLoginWithCode).toHaveBeenCalled();
    });

    act(() => {
      const iframe = {
        contentWindow: {} as Window,
        addEventListener: vi.fn(),
      } as unknown as HTMLIFrameElement;
      result.current.walletIframeRef.current = iframe;
    });

    await act(async () => {
      sessionDeferred.resolve({
        user: {
          id: "user-1",
          email: { address: "user@example.com" },
          linked_accounts: [
            { type: "wallet", address: "0xabc", walletClientType: "privy" },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Couldn't return to the app. Try again.",
      );
    });

    expect(result.current.view).toBe("login");
  });

  it("shows missing app config error", async () => {
    window.history.pushState({}, "", "/?mode=return_to_app");
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "");
    vi.stubEnv("NEXT_PUBLIC_PRIVY_CLIENT_ID", "client-id");

    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.error).toBe("Missing Privy app config.");
      expect(result.current.view).toBe("login");
    });
    expect(result.current.isDesktopHandoff).toBe(true);
  });

  it("validates empty email before sending code", async () => {
    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.view).toBe("login");
    });

    await act(async () => {
      await result.current.handleEmailSubmit();
    });

    expect(result.current.error).toBe("Enter your email.");
    expect(mockPrivy.mockEmailSendCode).not.toHaveBeenCalled();
  });

  it("sends OTP and verifies code through auth callback", async () => {
    mockPrivy.mockEmbeddedWalletCreate.mockResolvedValueOnce({
      user: { linked_accounts: [] },
    });
    mockPrivy.mockEmailLoginWithCode.mockResolvedValueOnce({
      accessToken: "token-123",
      user: {
        id: "user-2",
        email: { address: "user@example.com" },
      },
    });

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/auth-callback")) {
        return { ok: true, status: 200 } as Response;
      }
      return { ok: true, status: 200 } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.view).toBe("login");
    });

    act(() => {
      result.current.handleEmailChange(" user@example.com ");
    });

    await act(async () => {
      await result.current.handleEmailSubmit();
    });

    expect(mockPrivy.mockEmailSendCode).toHaveBeenCalledWith(
      "user@example.com",
    );
    expect(result.current.showCode).toBe(true);

    act(() => {
      const iframe = {
        contentWindow: {} as Window,
        addEventListener: vi.fn(),
      } as unknown as HTMLIFrameElement;
      result.current.walletIframeRef.current = iframe;
    });

    act(() => {
      result.current.handleCodeChange(" 123456 ");
    });

    await act(async () => {
      await result.current.handleVerifyCode();
    });

    expect(mockPrivy.mockEmailLoginWithCode).toHaveBeenCalledWith(
      "user@example.com",
      "123456",
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/auth-callback",
      expect.objectContaining({
        method: "POST",
      }),
    );

    await waitFor(() => {
      expect(result.current.view).toBe("success");
      expect(result.current.error).toBeNull();
    });
  });

  it("stays on success and does not redirect for desktop handoff mode", async () => {
    window.history.pushState({}, "", "/?mode=return_to_app");
    mockPrivy.mockEmbeddedWalletCreate.mockResolvedValueOnce({
      user: { linked_accounts: [] },
    });
    mockPrivy.mockEmailLoginWithCode.mockResolvedValueOnce({
      accessToken: "token-123",
      user: {
        id: "user-3",
        email: { address: "user@example.com" },
      },
    });

    const fetchSpy = vi.fn(async () => {
      return { ok: true, status: 200 } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.view).toBe("login");
      expect(result.current.isDesktopHandoff).toBe(true);
    });

    act(() => {
      result.current.handleEmailChange("user@example.com");
    });

    await act(async () => {
      await result.current.handleEmailSubmit();
    });

    act(() => {
      const iframe = {
        contentWindow: {} as Window,
        addEventListener: vi.fn(),
      } as unknown as HTMLIFrameElement;
      result.current.walletIframeRef.current = iframe;
      result.current.handleCodeChange("123456");
    });

    await act(async () => {
      await result.current.handleVerifyCode();
    });

    await waitFor(() => {
      expect(result.current.view).toBe("success");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1800));
    });

    expect(fetchSpy.mock.calls.some((call) => call[0] === "/close-tab")).toBe(
      false,
    );
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?mode=return_to_app");
  });

  it("marks desktop handoff mode from query params", async () => {
    window.history.pushState({}, "", "/?mode=return_to_app");

    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.view).toBe("login");
    });

    expect(result.current.isDesktopHandoff).toBe(true);
  });

  it("falls back to web mode for unknown arrival mode", async () => {
    window.history.pushState({}, "", "/?mode=unknown");

    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.view).toBe("login");
    });

    expect(result.current.isDesktopHandoff).toBe(false);
  });

  it("sets the wallet message poster on iframe load", async () => {
    window.history.pushState({}, "", "/");

    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.view).toBe("login");
    });

    const iframe = {
      contentWindow: {} as Window,
      addEventListener: vi.fn(),
    } as unknown as HTMLIFrameElement;

    act(() => {
      result.current.walletIframeRef.current = iframe;
      result.current.handleWalletIframeLoad();
    });

    expect(mockPrivy.mockSetMessagePoster).toHaveBeenCalledWith(
      iframe.contentWindow,
    );
  });

  it("clears only auth-scoped localStorage keys on fresh auth load", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("privy.session", "1");
    window.localStorage.setItem("vana.config", "1");
    window.localStorage.setItem("auth.state", "1");
    window.localStorage.setItem("app.theme", "dark");

    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.view).toBe("login");
    });

    expect(window.localStorage.getItem("privy.session")).toBeNull();
    expect(window.localStorage.getItem("vana.config")).toBeNull();
    expect(window.localStorage.getItem("auth.state")).toBeNull();
    expect(window.localStorage.getItem("app.theme")).toBe("dark");
  });

  it("encodes server address in check-server-url query", async () => {
    mockPrivy.mockEmailLoginWithCode.mockResolvedValueOnce({
      accessToken: "token-123",
      user: {
        id: "user-4",
        email: { address: "user@example.com" },
        linked_accounts: [
          { type: "wallet", address: "0xabc", walletClientType: "privy" },
        ],
      },
    });

    const specialAddress = "abc+def/ghi?j=1";
    const encodedAddress = encodeURIComponent(specialAddress);
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/auth-callback")) {
        return { ok: true, status: 200 } as Response;
      }
      if (url.includes("/server-identity")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            identity: {
              address: specialAddress,
              publicKey: "pub-key",
              serverId: "0xserver-id",
            },
          }),
        } as Response;
      }
      if (url.includes("/check-server-url")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { serverUrl: "https://wrong.server" } }),
        } as Response;
      }
      if (url.includes("/deregister-server")) {
        return { ok: true, status: 200 } as Response;
      }
      if (url.includes("/register-server")) {
        return { ok: true, status: 200 } as Response;
      }
      return { ok: true, status: 200 } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.view).toBe("login");
    });

    act(() => {
      const iframe = {
        contentWindow: {} as Window,
        addEventListener: vi.fn(),
      } as unknown as HTMLIFrameElement;
      result.current.walletIframeRef.current = iframe;
      result.current.handleEmailChange("user@example.com");
    });

    await act(async () => {
      await result.current.handleEmailSubmit();
    });

    act(() => {
      result.current.handleCodeChange("123456");
    });

    await act(async () => {
      await result.current.handleVerifyCode();
    });

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.some(([input]) =>
          input
            .toString()
            .includes(`/check-server-url?address=${encodedAddress}`),
        ),
      ).toBe(true);
    });
  });

  it("does not log auth token during auth callback flow", async () => {
    mockPrivy.mockEmbeddedWalletCreate.mockResolvedValueOnce({
      user: { linked_accounts: [] },
    });
    mockPrivy.mockEmailLoginWithCode.mockResolvedValueOnce({
      accessToken: "token-123",
      user: {
        id: "user-5",
        email: { address: "user@example.com" },
      },
    });

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/auth-callback")) {
        return { ok: true, status: 200 } as Response;
      }
      return { ok: true, status: 200 } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { result } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.view).toBe("login");
    });

    act(() => {
      const iframe = {
        contentWindow: {} as Window,
        addEventListener: vi.fn(),
      } as unknown as HTMLIFrameElement;
      result.current.walletIframeRef.current = iframe;
      result.current.handleEmailChange("user@example.com");
    });

    await act(async () => {
      await result.current.handleEmailSubmit();
    });

    act(() => {
      result.current.handleCodeChange("123456");
    });

    await act(async () => {
      await result.current.handleVerifyCode();
    });

    const logs = logSpy.mock.calls.map((args) => args.map(String).join(" "));
    expect(logs.some((entry) => entry.includes("token-123"))).toBe(false);
    expect(logs.some((entry) => entry.includes("Sending auth result:"))).toBe(
      false,
    );
  });

  it("removes wallet message listener on unmount", async () => {
    mockPrivy.mockEmailLoginWithCode.mockResolvedValueOnce({
      accessToken: "token-123",
      user: {
        id: "user-6",
        email: { address: "user@example.com" },
        linked_accounts: [
          { type: "wallet", address: "0xabc", walletClientType: "privy" },
        ],
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString().includes("/auth-callback")) {
          return { ok: false, status: 500 } as Response;
        }
        return { ok: true, status: 200 } as Response;
      }),
    );

    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const { result, unmount } = renderHook(() => useAuthPage());

    await waitFor(() => {
      expect(result.current.view).toBe("login");
    });

    act(() => {
      const iframe = {
        contentWindow: {} as Window,
        addEventListener: vi.fn(),
      } as unknown as HTMLIFrameElement;
      result.current.walletIframeRef.current = iframe;
      result.current.handleEmailChange("user@example.com");
    });

    await act(async () => {
      await result.current.handleEmailSubmit();
    });

    act(() => {
      result.current.handleCodeChange("123456");
    });

    await act(async () => {
      await result.current.handleVerifyCode();
    });

    const messageAddCall = addEventListenerSpy.mock.calls.find(
      ([type]) => type === "message",
    );
    expect(messageAddCall).toBeTruthy();
    const installedHandler = messageAddCall?.[1];
    expect(typeof installedHandler).toBe("function");

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "message",
      installedHandler as EventListener,
    );
  });
});
