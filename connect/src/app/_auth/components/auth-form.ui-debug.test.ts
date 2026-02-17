import { afterEach, describe, expect, it, vi } from "vitest";

const baseState = {
  view: "login" as const,
  loadingText: "Starting...",
  error: null as string | null,
  email: "",
  code: "",
  showCode: false,
  isSendingEmail: false,
  isVerifyingCode: false,
  isGoogleLoading: false,
  isAppleLoading: false,
};

describe("AUTH_FORM_UI_DEBUG", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.pushState({}, "", "/");
    vi.resetModules();
  });

  it("is disabled in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    window.history.pushState({}, "", "/?authDebug=1");

    const module = await import("./auth-form.ui-debug");
    expect(module.AUTH_FORM_UI_DEBUG.enabled).toBe(false);
    expect(module.resolveAuthFormUiDebugState(baseState)).toEqual(baseState);
  });

  it("is disabled in development without authDebug query flag", async () => {
    vi.stubEnv("NODE_ENV", "development");
    window.history.pushState({}, "", "/");

    const module = await import("./auth-form.ui-debug");
    expect(module.AUTH_FORM_UI_DEBUG.enabled).toBe(false);
    expect(module.resolveAuthFormUiDebugState(baseState)).toEqual(baseState);
  });

  it("is enabled in development with authDebug=1", async () => {
    vi.stubEnv("NODE_ENV", "development");
    window.history.pushState({}, "", "/?authDebug=1");

    const module = await import("./auth-form.ui-debug");
    expect(module.AUTH_FORM_UI_DEBUG.enabled).toBe(true);
  });
});
