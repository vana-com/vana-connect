import { afterEach, describe, expect, it, vi } from "vitest";

const baseState = {
  view: "loading" as const,
  error: null as string | null,
  sessionId: "sess-real",
  deepLinkUrl: null as string | null,
};

describe("resolveConnectPageUiDebugState", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const module = await import("./use-connect-page.ui-debug");
    const debug = module.resolveConnectPageUiDebugConfig(
      new URLSearchParams("authDebug=1&scenario=ready"),
    );
    expect(module.resolveConnectPageUiDebugState(baseState, debug)).toEqual(
      baseState,
    );
  });

  it("is disabled in development without authDebug", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const module = await import("./use-connect-page.ui-debug");
    const debug = module.resolveConnectPageUiDebugConfig(
      new URLSearchParams("scenario=ready"),
    );
    expect(module.resolveConnectPageUiDebugState(baseState, debug)).toEqual(
      baseState,
    );
  });

  it("keeps real state when authDebug=1 and scenario is omitted", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const module = await import("./use-connect-page.ui-debug");
    const debug = module.resolveConnectPageUiDebugConfig(
      new URLSearchParams("authDebug=1"),
    );
    expect(module.resolveConnectPageUiDebugState(baseState, debug)).toEqual(
      baseState,
    );
  });

  it("uses scenario from query when authDebug=1", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const module = await import("./use-connect-page.ui-debug");
    const debug = module.resolveConnectPageUiDebugConfig(
      new URLSearchParams("authDebug=1&scenario=missing-session"),
    );
    expect(module.resolveConnectPageUiDebugState(baseState, debug)).toEqual({
      ...baseState,
      sessionId: null,
      deepLinkUrl: null,
      view: "loading",
    });
  });

  it("uses error scenario from query when authDebug=1", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const module = await import("./use-connect-page.ui-debug");
    const debug = module.resolveConnectPageUiDebugConfig(
      new URLSearchParams("authDebug=1&scenario=error"),
    );
    expect(module.resolveConnectPageUiDebugState(baseState, debug)).toEqual({
      ...baseState,
      sessionId: "sess-debug",
      deepLinkUrl: null,
      view: "error",
      error: "Failed to sign master key. Please try again.",
    });
  });
});
