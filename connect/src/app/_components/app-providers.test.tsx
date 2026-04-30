import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_APP_ID = "clu1234567890abcdef123456";
const VALID_CLIENT_ID = "client-abcdef1234567890";

const mocks = vi.hoisted(() => ({
  useSyncJwtBasedAuthState: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({
    appId,
    clientId,
    children,
  }: {
    appId: string;
    clientId: string;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="privy-provider"
      data-app-id={appId}
      data-client-id={clientId}
    >
      {children}
    </div>
  ),
  useSyncJwtBasedAuthState: mocks.useSyncJwtBasedAuthState,
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  mocks.useSyncJwtBasedAuthState.mockClear();
  mocks.useSyncJwtBasedAuthState.mockReturnValue({
    state: { status: "initial" },
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("AppProviders", () => {
  it("mounts PrivyProvider with resolved env when valid", async () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = VALID_APP_ID;
    process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID = VALID_CLIENT_ID;
    const { AppProviders } = await import("./app-providers");

    const { getByTestId } = render(
      <AppProviders>
        <span data-testid="child" />
      </AppProviders>,
    );

    const provider = getByTestId("privy-provider");
    expect(provider.getAttribute("data-app-id")).toBe(VALID_APP_ID);
    expect(provider.getAttribute("data-client-id")).toBe(VALID_CLIENT_ID);
    expect(getByTestId("child")).toBeTruthy();
    expect(mocks.useSyncJwtBasedAuthState).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("enables Vana JWT sync only behind the public feature flag", async () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = VALID_APP_ID;
    process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID = VALID_CLIENT_ID;
    process.env.NEXT_PUBLIC_PRIVY_JWT_AUTH_SYNC_ENABLED = "true";
    const { AppProviders } = await import("./app-providers");

    render(
      <AppProviders>
        <span data-testid="child" />
      </AppProviders>,
    );

    expect(mocks.useSyncJwtBasedAuthState).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("throws a Vana-owned error when env is missing", async () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = undefined;
    process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID = undefined;
    const { AppProviders } = await import("./app-providers");

    // Suppress React's expected error log for this render.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      render(
        <AppProviders>
          <span />
        </AppProviders>,
      ),
    ).toThrowError(/Privy auth is not configured/);

    errorSpy.mockRestore();
  });

  it("throws when env is set to an obvious placeholder", async () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "your-privy-app-id";
    process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID = "your-privy-client-id";
    const { AppProviders } = await import("./app-providers");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      render(
        <AppProviders>
          <span />
        </AppProviders>,
      ),
    ).toThrowError(/Privy auth is not configured/);

    errorSpy.mockRestore();
  });
});
