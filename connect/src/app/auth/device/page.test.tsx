import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  deviceAuthState: {
    isReady: true,
    isLoggedIn: false,
    status: "idle" as "idle" | "signing" | "approving" | "approved" | "error",
    error: null as string | null,
    approve: vi.fn(),
    login: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("./use-device-auth", () => ({
  useDeviceAuth: () => mocks.deviceAuthState,
}));

import DeviceAuthPage from "./page";

describe("DeviceAuthPage", () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams();
    mocks.deviceAuthState.isReady = true;
    mocks.deviceAuthState.isLoggedIn = false;
    mocks.deviceAuthState.status = "idle";
    mocks.deviceAuthState.error = null;
    mocks.deviceAuthState.approve.mockReset();
    mocks.deviceAuthState.login.mockReset();
    window.sessionStorage.clear();
  });

  it("accepts typed hyphens in the device code input", () => {
    render(<DeviceAuthPage />);

    const input = screen.getByPlaceholderText("XXXX-XXXX");
    fireEvent.change(input, { target: { value: "abcd-efgh" } });

    expect((input as HTMLInputElement).value).toBe("ABCD-EFGH");
  });

  it("persists a typed code through login and resumes approval after authentication", async () => {
    const { rerender } = render(<DeviceAuthPage />);

    const input = screen.getByPlaceholderText("XXXX-XXXX");
    fireEvent.change(input, { target: { value: "abcd-efgh" } });
    fireEvent.submit(
      screen.getByRole("button", { name: /sign in to authorize/i }),
    );

    expect(mocks.deviceAuthState.login).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("vana_pending_device_code")).toBe(
      "ABCDEFGH",
    );
    expect(window.sessionStorage.getItem("vana_pending_device_approval")).toBe(
      "1",
    );

    mocks.deviceAuthState.isLoggedIn = true;
    rerender(<DeviceAuthPage />);

    await waitFor(() => {
      expect(mocks.deviceAuthState.approve).toHaveBeenCalledWith("ABCD-EFGH");
    });
    expect(window.sessionStorage.getItem("vana_pending_device_approval")).toBe(
      null,
    );
  });
});
