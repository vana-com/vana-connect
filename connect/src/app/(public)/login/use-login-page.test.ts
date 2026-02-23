import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  privyState: {
    ready: true,
    authenticated: false,
  },
  emailState: {
    status: "idle",
  },
  oauthState: {
    status: "idle",
  },
  initOAuth: vi.fn(),
  sendCode: vi.fn(),
  loginWithCode: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mocks.privyState,
  useLoginWithEmail: () => ({
    sendCode: mocks.sendCode,
    loginWithCode: mocks.loginWithCode,
    state: mocks.emailState,
  }),
  useLoginWithOAuth: () => ({
    initOAuth: mocks.initOAuth,
    state: mocks.oauthState,
  }),
}));

vi.mock("./use-login-page.ui-debug", () => ({
  resolveLoginPageUiDebugState: <T>(state: T): T => state,
}));

import { useLoginPage } from "./use-login-page";

describe("useLoginPage oauth loading behavior", () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams();
    mocks.privyState.ready = true;
    mocks.privyState.authenticated = false;
    mocks.emailState.status = "idle";
    mocks.oauthState.status = "idle";
    mocks.initOAuth.mockReset();
    mocks.sendCode.mockReset();
    mocks.loginWithCode.mockReset();
    localStorage.clear();
  });

  it("keeps entry view and shows only Google loading after Google click", async () => {
    mocks.searchParams = new URLSearchParams(
      "sessionId=session-123&secret=secret-abc",
    );

    const { result, rerender } = renderHook(() => useLoginPage());

    await waitFor(() => {
      expect(result.current.view).toBe("entry");
    });

    act(() => {
      result.current.handleGoogleLogin();
    });

    expect(mocks.initOAuth).toHaveBeenCalledWith({ provider: "google" });

    act(() => {
      mocks.oauthState.status = "loading";
      rerender();
    });

    expect(result.current.view).toBe("entry");
    expect(result.current.isGoogleLoading).toBe(true);
    expect(result.current.isAppleLoading).toBe(false);
  });

  it("shows completing view on OAuth return loading when session is persisted", async () => {
    localStorage.setItem(
      "vana_connect_session",
      JSON.stringify({ sessionId: "session-123", secret: "secret-abc" }),
    );
    mocks.searchParams = new URLSearchParams(
      "code=oauth-code&state=oauth-state",
    );
    mocks.oauthState.status = "loading";

    const { result } = renderHook(() => useLoginPage());

    await waitFor(() => {
      expect(result.current.view).toBe("completing");
    });

    expect(result.current.isGoogleLoading).toBe(false);
    expect(result.current.isAppleLoading).toBe(false);
  });

  it("does not enter completing view from stale storage without oauth callback params", async () => {
    localStorage.setItem(
      "vana_connect_session",
      JSON.stringify({ sessionId: "session-123", secret: "secret-abc" }),
    );
    mocks.oauthState.status = "loading";

    const { result } = renderHook(() => useLoginPage());

    await waitFor(() => {
      expect(result.current.view).toBe("entry");
    });
  });
});
