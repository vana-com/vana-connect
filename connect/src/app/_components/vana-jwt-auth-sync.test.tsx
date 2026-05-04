import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VANA_ACCOUNT_SESSION_CHANGED_EVENT,
  VanaJwtAuthSync,
} from "./vana-jwt-auth-sync";

const mocks = vi.hoisted(() => ({
  useSyncJwtBasedAuthState: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  useSyncJwtBasedAuthState: mocks.useSyncJwtBasedAuthState,
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  mocks.useSyncJwtBasedAuthState.mockClear();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ token: "vana.jwt" }), { status: 200 }),
      ),
  );
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function renderSync() {
  render(<VanaJwtAuthSync />);
  return mocks.useSyncJwtBasedAuthState.mock.calls.at(-1)?.[0] as {
    enabled: boolean;
    getExternalJwt: () => Promise<string | undefined>;
    subscribe: (callback: () => void) => () => void;
  };
}

describe("VanaJwtAuthSync", () => {
  it("is disabled unless the public feature flag is true", () => {
    process.env.NEXT_PUBLIC_PRIVY_JWT_AUTH_SYNC_ENABLED = "false";

    expect(renderSync().enabled).toBe(false);

    process.env.NEXT_PUBLIC_PRIVY_JWT_AUTH_SYNC_ENABLED = "true";
    expect(renderSync().enabled).toBe(true);
  });

  it("fetches the Vana JWT from the account endpoint", async () => {
    const input = renderSync();

    await expect(input.getExternalJwt()).resolves.toBe("vana.jwt");
    expect(fetch).toHaveBeenCalledWith("/api/auth/privy-custom-auth-jwt", {
      cache: "no-store",
      credentials: "same-origin",
    });
  });

  it("returns undefined for non-200 or malformed responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("nope", { status: 401 }),
    );
    await expect(renderSync().getExternalJwt()).resolves.toBeUndefined();

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 123 }), { status: 200 }),
    );
    await expect(renderSync().getExternalJwt()).resolves.toBeUndefined();

    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await expect(renderSync().getExternalJwt()).resolves.toBeUndefined();
  });

  it("subscribes to account-session events and browser resume signals", () => {
    const input = renderSync();
    const onChange = vi.fn();
    const unsubscribe = input.subscribe(onChange);

    window.dispatchEvent(new Event(VANA_ACCOUNT_SESSION_CHANGED_EVENT));
    window.dispatchEvent(new Event("focus"));

    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(new Event(VANA_ACCOUNT_SESSION_CHANGED_EVENT));

    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
