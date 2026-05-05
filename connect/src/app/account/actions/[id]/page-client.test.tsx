import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  privy: {
    ready: true,
    authenticated: false,
    login: vi.fn(),
  },
  identityToken: "fake-privy-id-token",
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mocks.privy,
  useIdentityToken: () => ({ identityToken: mocks.identityToken }),
}));

// Pre-seed vana_access cookie so the page's session-status state machine
// flips to "ready" without hitting the bootstrap path. The bootstrap path
// is exercised via integration; unit tests mock the BFF cookie directly.
function setVanaAccessCookie(value: string | null) {
  if (typeof document === "undefined") return;
  if (value === null) {
    document.cookie = "vana_access=; max-age=0; path=/";
  } else {
    document.cookie = `vana_access=${encodeURIComponent(value)}; path=/`;
  }
}

import { ActionRequestPageClient } from "./page-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ActionRequestPageClient", () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams();
    mocks.privy.ready = true;
    mocks.privy.authenticated = false;
    mocks.privy.login.mockReset();
    setVanaAccessCookie("fake-vana-access");
    vi.unstubAllGlobals();
  });

  it("requires login before showing action details", () => {
    render(<ActionRequestPageClient actionRequestId="vana_areq_test" />);

    fireEvent.click(screen.getByRole("button", { name: /sign in to review/i }));

    expect(mocks.privy.login).toHaveBeenCalledTimes(1);
  });

  it("loads action details and submits an approval with state", async () => {
    mocks.privy.authenticated = true;
    mocks.searchParams = new URLSearchParams("state=client-state");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          action_request_id: "vana_areq_test",
          status: "pending",
          client: {
            client_id: "memory-app-dev",
            display_name: "Memory App (dev)",
          },
          action_type: "mock.echo",
          execution_mode: "mock",
          result_mode: "mock",
          requested_data: { connector: "mock", scopes: ["read"] },
          display_metadata: {
            title: "Read memory data",
            description: "Memory App wants to read a mock connector scope.",
          },
          expires_at: "2099-04-29T12:10:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          action_request_id: "vana_areq_test",
          decision: "approved",
          redirect_url: null,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ActionRequestPageClient actionRequestId="vana_areq_test" />);

    expect(await screen.findByText("Memory App (dev)")).toBeTruthy();
    expect(
      await screen.findByText(
        "Memory App wants to read a mock connector scope.",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Mock Echo")).toBeTruthy();
    expect(await screen.findByText("Mock")).toBeTruthy();
    expect(await screen.findByText("Read")).toBeTruthy();
    expect(await screen.findByText("No reason provided")).toBeTruthy();
    expect(await screen.findByText("Purpose")).toBeTruthy();
    expect(
      await screen.findByText("Provided by Memory App (dev)."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/account/actions/vana_areq_test",
    );
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      authorization: "Bearer fake-vana-access",
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/account/actions/vana_areq_test/decision",
    );
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      authorization: "Bearer fake-vana-access",
      "content-type": "application/json",
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      decision: "approved",
      state: "client-state",
    });
  });
});
