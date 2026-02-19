import { afterEach, describe, expect, it, vi } from "vitest";

const baseState = {
  view: "email" as const,
  error: null as string | null,
  email: "",
  code: "",
  isSendingEmail: false,
  isVerifyingCode: false,
  isGoogleLoading: false,
  isAppleLoading: false,
};

describe("resolveLoginPageUiDebugState", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.pushState({}, "", "/");
    vi.resetModules();
  });

  it("is disabled in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    window.history.pushState(
      {},
      "",
      "/login?authDebug=1&scenario=verify-loading",
    );

    const module = await import("./use-login-page.ui-debug");
    expect(module.resolveLoginPageUiDebugState(baseState)).toEqual(baseState);
  });

  it("is disabled in development without authDebug query flag", async () => {
    vi.stubEnv("NODE_ENV", "development");
    window.history.pushState({}, "", "/login?scenario=verify-loading");

    const module = await import("./use-login-page.ui-debug");
    expect(module.resolveLoginPageUiDebugState(baseState)).toEqual(baseState);
  });

  it("uses login-idle when authDebug=1 and scenario is omitted", async () => {
    vi.stubEnv("NODE_ENV", "development");
    window.history.pushState({}, "", "/login?authDebug=1");

    const module = await import("./use-login-page.ui-debug");
    expect(module.resolveLoginPageUiDebugState(baseState)).toEqual({
      ...baseState,
      view: "email",
      email: "jane@example.com",
    });
  });

  it("uses scenario from query when authDebug=1", async () => {
    vi.stubEnv("NODE_ENV", "development");
    window.history.pushState(
      {},
      "",
      "/login?authDebug=1&scenario=login-email-loading",
    );

    const module = await import("./use-login-page.ui-debug");
    expect(module.resolveLoginPageUiDebugState(baseState)).toEqual({
      ...baseState,
      view: "email",
      email: "jane@example.com",
      isSendingEmail: true,
    });
  });
});
