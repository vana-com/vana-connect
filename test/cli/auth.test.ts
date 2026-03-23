import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: mocks.spawnSync,
}));

import {
  getAuthTarget,
  loadCredentials,
  runDeviceCodeFlow,
  runSelfHostedLoginFlow,
} from "../../src/cli/auth.js";

describe("getAuthTarget", () => {
  it("treats localhost personal servers as self-hosted", () => {
    expect(getAuthTarget("http://localhost:8080")).toBe("self-hosted");
    expect(getAuthTarget("http://127.0.0.1:8080")).toBe("self-hosted");
  });

  it("treats arbitrary external personal server URLs as self-hosted", () => {
    expect(getAuthTarget("https://ps.alice.com")).toBe("self-hosted");
  });

  it("treats myvana hosted URLs as cloud", () => {
    expect(getAuthTarget("https://0xabc.myvana.app")).toBe("cloud");
  });
});

describe("runSelfHostedLoginFlow", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("resolves relative approval and poll endpoints against the personal server origin", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            login: "/auth/device/approve?session=abc",
            poll: {
              endpoint: "/auth/device/poll",
              token: "token-123",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "pending" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "authorized",
            server: "https://ps.example",
            address: "0xabc123",
            access_token: "vana_ps_token",
            expires_at: "2026-04-22T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const onLoginUrl = vi.fn();
    const promise = runSelfHostedLoginFlow("https://ps.example", onLoginUrl);

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toEqual({
      server: "https://ps.example",
      address: "0xabc123",
      session_token: "vana_ps_token",
      expires_at: "2026-04-22T00:00:00.000Z",
    });
    expect(onLoginUrl).toHaveBeenCalledWith(
      "https://ps.example/auth/device/approve?session=abc",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://ps.example/auth/device/poll?token=token-123",
    );
  });

  it("preserves absolute approval URLs returned by the personal server", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            login: "https://ps.example/auth/device/approve?session=abc",
            poll: {
              endpoint: "/auth/device/poll",
              token: "token-123",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "authorized",
            server: "https://ps.example",
            address: "0xabc123",
            access_token: "vana_ps_token",
            expires_at: "2026-04-22T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const onLoginUrl = vi.fn();
    const promise = runSelfHostedLoginFlow("https://ps.example", onLoginUrl);

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(promise).resolves.toEqual({
      server: "https://ps.example",
      address: "0xabc123",
      session_token: "vana_ps_token",
      expires_at: "2026-04-22T00:00:00.000Z",
    });
    expect(onLoginUrl).toHaveBeenCalledWith(
      "https://ps.example/auth/device/approve?session=abc",
    );
  });

  it("fails fast when the personal server reports an expired login session", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            login: "https://ps.example/auth/device/approve?session=abc",
            poll: {
              endpoint: "/auth/device/poll",
              token: "token-123",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "expired" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const expectation = expect(
      runSelfHostedLoginFlow("https://ps.example", vi.fn()),
    ).rejects.toThrow("Authorization expired. Please try again.");

    await vi.advanceTimersByTimeAsync(5_000);

    await expectation;
  });
});

describe("runDeviceCodeFlow", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    mocks.spawnSync.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("prefers server-issued expires_at over locally invented expiry", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            device_code: "device-123",
            user_code: "ABCD-EFGH",
            verification_uri: "https://account.vana.org/auth/device",
            expires_in: 300,
            interval: 5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "authorized",
            address: "0xabc123",
            session_token: "vana_sess_123",
            personal_server_url: "https://ps.example",
            personal_server_session_token: "vana_ps_token",
            expires_at: "2026-04-22T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const onCode = vi.fn();
    const onWaiting = vi.fn();
    const onAuthorized = vi.fn();
    const onExpired = vi.fn();
    const onError = vi.fn();

    const promise = runDeviceCodeFlow({
      onCode,
      onWaiting,
      onAuthorized,
      onExpired,
      onError,
    });

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(promise).resolves.toEqual({
      account: {
        address: "0xabc123",
        session_token: "vana_sess_123",
        expires_at: "2026-04-22T00:00:00.000Z",
      },
      personal_server: {
        url: "https://ps.example",
        session_token: "vana_ps_token",
        expires_at: "2026-04-22T00:00:00.000Z",
      },
    });
    expect(onAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({
          expires_at: "2026-04-22T00:00:00.000Z",
        }),
      }),
    );
    expect(onExpired).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("accepts legacy ps_access_token responses from account login polling", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            device_code: "device-123",
            user_code: "ABCD-EFGH",
            verification_uri: "https://account.vana.org/auth/device",
            expires_in: 300,
            interval: 5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "authorized",
            address: "0xabc123",
            session_token: "vana_sess_123",
            personal_server_url: "https://ps.example",
            ps_access_token: "vana_ps_token",
            expires_at: "2026-04-22T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const promise = runDeviceCodeFlow({
      onCode: vi.fn(),
      onWaiting: vi.fn(),
      onAuthorized: vi.fn(),
      onExpired: vi.fn(),
      onError: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(promise).resolves.toMatchObject({
      personal_server: {
        url: "https://ps.example",
        session_token: "vana_ps_token",
      },
    });
  });

  it("continues polling when the account service asks the CLI to slow down", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            device_code: "device-123",
            user_code: "ABCD-EFGH",
            verification_uri: "https://account.vana.org/auth/device",
            expires_in: 300,
            interval: 5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "slow_down" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "authorized",
            address: "0xabc123",
            session_token: "vana_sess_123",
            personal_server_url: "https://ps.example",
            personal_server_session_token: "vana_ps_token",
            expires_at: "2026-04-22T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const promise = runDeviceCodeFlow({
      onCode: vi.fn(),
      onWaiting: vi.fn(),
      onAuthorized: vi.fn(),
      onExpired: vi.fn(),
      onError: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(promise).resolves.toMatchObject({
      account: {
        address: "0xabc123",
        session_token: "vana_sess_123",
      },
      personal_server: {
        url: "https://ps.example",
        session_token: "vana_ps_token",
      },
    });
  });
});

describe("loadCredentials", () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "vana-auth-"));
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  it("reads legacy personal_server.access_token files as session_token", async () => {
    const authDir = join(tempHome, ".vana");
    await mkdir(authDir, { recursive: true });
    await writeFile(
      join(authDir, "auth.json"),
      JSON.stringify(
        {
          account: {
            address: "0xabc123",
            session_token: "vana_sess_123",
            expires_at: "2099-01-01T00:00:00.000Z",
          },
          personal_server: {
            url: "https://ps.example",
            access_token: "vana_ps_token",
            expires_at: "2099-01-01T00:00:00.000Z",
          },
        },
        null,
        2,
      ),
    );

    const creds = loadCredentials();

    expect(creds).toEqual({
      account: {
        address: "0xabc123",
        session_token: "vana_sess_123",
        expires_at: "2099-01-01T00:00:00.000Z",
      },
      personal_server: {
        url: "https://ps.example",
        session_token: "vana_ps_token",
        expires_at: "2099-01-01T00:00:00.000Z",
      },
    });
  });
});
