import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readCliConfig: vi.fn(),
  loadCredentials: vi.fn(),
}));

vi.mock("../../src/core/state-store.js", () => ({
  readCliConfig: mocks.readCliConfig,
}));

vi.mock("../../src/cli/auth.js", async () => {
  const actual = await vi.importActual<object>("../../src/cli/auth.js");
  return {
    ...actual,
    loadCredentials: mocks.loadCredentials,
  };
});

import {
  detectPersonalServerTarget,
  resolvePersonalServerAuthConfig,
} from "../../src/personal-server/index.js";

const originalEnv = { ...process.env };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  mocks.readCliConfig.mockReset();
  mocks.readCliConfig.mockResolvedValue({});
  mocks.loadCredentials.mockReset();
  mocks.loadCredentials.mockReturnValue(null);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("resolvePersonalServerAuthConfig", () => {
  it("uses VANA_PS_TOKEN for localhost servers", () => {
    process.env.VANA_PS_TOKEN = "ps-token";

    expect(resolvePersonalServerAuthConfig("http://localhost:8080")).toEqual({
      type: "bearerToken",
      token: "ps-token",
    });
  });

  it("uses VANA_PS_TOKEN for remote servers", () => {
    process.env.VANA_PS_TOKEN = "ps-token";

    expect(resolvePersonalServerAuthConfig("https://ps.example.com")).toEqual({
      type: "bearerToken",
      token: "ps-token",
    });
  });

  it("uses the saved personal server session token when the target URL matches", () => {
    mocks.loadCredentials.mockReturnValue({
      account: {
        address: "0x1234567890abcdef1234567890abcdef12345678",
        session_token: "",
        expires_at: "2026-04-22T00:00:00.000Z",
      },
      personal_server: {
        url: "http://localhost:8080/",
        session_token: "saved-ps-token",
        expires_at: "2026-04-22T00:00:00.000Z",
      },
    });

    expect(resolvePersonalServerAuthConfig("http://localhost:8080")).toEqual({
      type: "bearerToken",
      token: "saved-ps-token",
    });
  });

  it("does not reuse a saved personal server session token for a different URL", () => {
    mocks.loadCredentials.mockReturnValue({
      account: {
        address: "0x1234567890abcdef1234567890abcdef12345678",
        session_token: "",
        expires_at: "2026-04-22T00:00:00.000Z",
      },
      personal_server: {
        url: "https://ps.example.com",
        session_token: "saved-ps-token",
        expires_at: "2026-04-22T00:00:00.000Z",
      },
    });

    expect(
      resolvePersonalServerAuthConfig("https://other.example.com"),
    ).toBeUndefined();
  });
});

describe("detectPersonalServerTarget", () => {
  it("falls back from an unreachable saved URL to the authenticated personal server URL", async () => {
    mocks.readCliConfig.mockResolvedValue({
      personalServerUrl: "https://dead.example.com",
    });
    mocks.loadCredentials.mockReturnValue({
      account: {
        address: "0x1234567890abcdef1234567890abcdef12345678",
        session_token: "",
        expires_at: "2026-04-22T00:00:00.000Z",
      },
      personal_server: {
        url: "http://localhost:8080",
        session_token: "vana_ps_token",
        expires_at: "2026-04-22T00:00:00.000Z",
      },
    });

    fetchMock.mockRejectedValueOnce(new Error("dead")).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "healthy",
          version: "0.0.1",
          uptime: 1,
          owner: "0x1234567890abcdef1234567890abcdef12345678",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(detectPersonalServerTarget()).resolves.toEqual({
      state: "available",
      url: "http://localhost:8080",
      source: "auth",
      health: {
        status: "healthy",
        version: "0.0.1",
        uptime: 1,
        owner: "0x1234567890abcdef1234567890abcdef12345678",
      },
    });
  });
});
