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
    window.history.pushState({}, "", "/");
    vi.resetModules();
  });

  it("is disabled in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    window.history.pushState({}, "", "/connect?authDebug=1&scenario=ready");

    const module = await import("./use-connect-page.ui-debug");
    expect(module.resolveConnectPageUiDebugState(baseState)).toEqual(baseState);
  });

  it("is disabled in development without authDebug", async () => {
    vi.stubEnv("NODE_ENV", "development");
    window.history.pushState({}, "", "/connect?scenario=ready");

    const module = await import("./use-connect-page.ui-debug");
    expect(module.resolveConnectPageUiDebugState(baseState)).toEqual(baseState);
  });

  it("keeps real state when authDebug=1 and scenario is omitted", async () => {
    vi.stubEnv("NODE_ENV", "development");
    window.history.pushState({}, "", "/connect?authDebug=1");

    const module = await import("./use-connect-page.ui-debug");
    expect(module.resolveConnectPageUiDebugState(baseState)).toEqual(baseState);
  });

  it("uses scenario from query when authDebug=1", async () => {
    vi.stubEnv("NODE_ENV", "development");
    window.history.pushState(
      {},
      "",
      "/connect?authDebug=1&scenario=missing-session",
    );

    const module = await import("./use-connect-page.ui-debug");
    expect(module.resolveConnectPageUiDebugState(baseState)).toEqual({
      ...baseState,
      sessionId: null,
      deepLinkUrl: null,
      view: "loading",
    });
  });
});
