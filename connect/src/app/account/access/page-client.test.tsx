import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountAccessPageClient } from "./page-client";

const privyMock = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  identityToken: null as string | null,
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    ready: privyMock.ready,
    authenticated: privyMock.authenticated,
  }),
  useIdentityToken: () => ({ identityToken: privyMock.identityToken }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/_components/logout-action-button", () => ({
  LogoutActionButton: ({
    href,
    children,
  }: {
    href: string;
    children: ReactNode;
  }) => <a href={href}>{children}</a>,
}));

function setVanaAccessCookie(value: string | null) {
  if (typeof document === "undefined") return;
  if (value === null) {
    document.cookie = "vana_access=; max-age=0; path=/";
  } else {
    document.cookie = `vana_access=${encodeURIComponent(value)}; path=/`;
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  privyMock.ready = true;
  privyMock.authenticated = false;
  privyMock.identityToken = null;
  setVanaAccessCookie(null);
});

const chatgptRequestedDataDisplay = {
  data_source: "ChatGPT",
  data_types: "memories and conversation history",
  purpose:
    "Let Memory App build memory from your ChatGPT memories and conversation history.",
  access_duration: "Until you revoke access",
  summary:
    "ChatGPT: memories and conversation history. Let Memory App build memory from your ChatGPT memories and conversation history. Access: Until you revoke access.",
};

describe("AccountAccessPageClient", () => {
  it("shows logged-out sign-in state without fake access rows or logout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401, ok: false }),
    );

    render(<AccountAccessPageClient />);

    expect(
      await screen.findByText("Sign in to view account access"),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
    ).toBe("/login");
    expect(screen.queryByText("RPC-mocked chatgpt grant")).toBeNull();
    expect(screen.queryByText("Logout")).toBeNull();
  });

  it("renders real account access rows returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          account: {
            vana_user_id: "vana_user_1",
            display_name: "Tim",
            created_at: "2026-04-29T11:00:00.000Z",
          },
          provider_links: [
            {
              provider: "privy",
              email: "tim@example.com",
              provider_subject: "did:privy:user-1",
              created_at: "2026-04-29T11:00:00.000Z",
            },
          ],
          linked_wallets: [
            {
              chain: "evm",
              address: "0xabc",
              provider: "privy",
              primary: true,
              verified_at: "2026-04-29T11:00:00.000Z",
            },
          ],
          connected_apps: [
            {
              client_id: "memory-app-dev",
              display_name: "Memory App (dev)",
              active_grant_count: 1,
              total_request_count: 1,
              event_count: 1,
              last_seen_at: "2026-04-29T12:01:00.000Z",
              last_grant_at: "2026-04-29T12:01:00.000Z",
              last_revoked_at: null,
              can_disconnect: true,
            },
          ],
          access_requests: [
            {
              id: "vana_areq_1",
              client_id: "memory-app-dev",
              app_name: "Memory App (dev)",
              action_type: "data.read.chatgpt",
              action_label: "Read ChatGPT data",
              execution_mode: "mock",
              result_mode: "mock",
              requested_data_summary: chatgptRequestedDataDisplay.summary,
              requested_data_display: chatgptRequestedDataDisplay,
              status: "approved",
              created_at: "2026-04-29T12:00:00.000Z",
              decided_at: "2026-04-29T12:01:00.000Z",
              expires_at: "2026-04-29T12:10:00.000Z",
              revoked_at: null,
              result_state: "Exchange available",
              can_revoke: true,
              revocation_note: null,
              revoke_note:
                "RPC revocation is mocked; local grant state will be revoked.",
            },
          ],
          activity: [
            {
              id: "vana_evt_1",
              event_type: "action.approved",
              occurred_at: "2026-04-29T12:01:00.000Z",
              client_id: "memory-app-dev",
              app_name: "Memory App (dev)",
              action_type: "data.read.chatgpt",
              action_label: "Read ChatGPT data",
              decision: "approved",
              requested_data_summary: chatgptRequestedDataDisplay.summary,
              requested_data_display: chatgptRequestedDataDisplay,
              revocation_note: null,
            },
          ],
        }),
      }),
    );

    render(<AccountAccessPageClient />);

    expect(await screen.findByText("vana_user_1")).toBeTruthy();
    expect(screen.getAllByText("Memory App (dev)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Read ChatGPT data").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("memories and conversation history").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Purpose").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Provided by Memory App (dev).").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Revoke grant" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect app" })).toBeTruthy();
    expect(screen.getByText("Approved access | Memory App (dev)")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Logout")).toBeTruthy();
    });
  });

  it("updates after successful revoke using returned summary", async () => {
    // Mutation needs Bearer; pre-seed the JS-readable session cookie so
    // vanaFetch attaches it without bootstrapping.
    setVanaAccessCookie("fake-vana-access");
    const initialSummary = {
      account: {
        vana_user_id: "vana_user_1",
        display_name: "Tim",
        created_at: "2026-04-29T11:00:00.000Z",
      },
      provider_links: [],
      linked_wallets: [],
      connected_apps: [
        {
          client_id: "memory-app-dev",
          display_name: "Memory App (dev)",
          active_grant_count: 1,
          total_request_count: 1,
          event_count: 1,
          last_seen_at: "2026-04-29T12:01:00.000Z",
          last_grant_at: "2026-04-29T12:01:00.000Z",
          last_revoked_at: null,
          can_disconnect: true,
        },
      ],
      access_requests: [
        {
          id: "vana_areq_1",
          client_id: "memory-app-dev",
          app_name: "Memory App (dev)",
          action_type: "data.read.chatgpt",
          action_label: "Read ChatGPT data",
          execution_mode: "mock",
          result_mode: "mock",
          requested_data_summary: chatgptRequestedDataDisplay.summary,
          requested_data_display: chatgptRequestedDataDisplay,
          status: "approved",
          created_at: "2026-04-29T12:00:00.000Z",
          decided_at: "2026-04-29T12:01:00.000Z",
          expires_at: "2026-04-29T12:10:00.000Z",
          revoked_at: null,
          result_state: "Exchange available",
          can_revoke: true,
          revocation_note: null,
          revoke_note:
            "RPC revocation is mocked; local grant state will be revoked.",
        },
      ],
      activity: [],
    };
    const revokedSummary = {
      ...initialSummary,
      connected_apps: [
        {
          ...initialSummary.connected_apps[0],
          active_grant_count: 0,
          last_revoked_at: "2026-04-29T12:02:00.000Z",
          can_disconnect: false,
        },
      ],
      access_requests: [
        {
          ...initialSummary.access_requests[0],
          status: "revoked",
          revoked_at: "2026-04-29T12:02:00.000Z",
          can_revoke: false,
          revocation_note:
            "Revoked locally; RPC/on-chain revocation is mocked.",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => initialSummary,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ summary: revokedSummary }),
        }),
    );

    render(<AccountAccessPageClient />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Revoke grant" }),
    );

    expect(
      await screen.findByText(
        "Revoked locally; RPC/on-chain revocation is mocked.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revoke grant" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disconnect app" })).toBeNull();
  });

  it("updates after successful disconnect using returned summary", async () => {
    // Mutation needs Bearer; pre-seed the JS-readable session cookie so
    // vanaFetch attaches it without bootstrapping.
    setVanaAccessCookie("fake-vana-access");
    const initialSummary = {
      account: {
        vana_user_id: "vana_user_1",
        display_name: "Tim",
        created_at: "2026-04-29T11:00:00.000Z",
      },
      provider_links: [],
      linked_wallets: [],
      connected_apps: [
        {
          client_id: "memory-app-dev",
          display_name: "Memory App (dev)",
          active_grant_count: 2,
          total_request_count: 2,
          event_count: 2,
          last_seen_at: "2026-04-29T12:01:00.000Z",
          last_grant_at: "2026-04-29T12:01:00.000Z",
          last_revoked_at: null,
          can_disconnect: true,
        },
      ],
      access_requests: [],
      activity: [],
    };
    const disconnectedSummary = {
      ...initialSummary,
      connected_apps: [
        {
          ...initialSummary.connected_apps[0],
          active_grant_count: 0,
          last_revoked_at: "2026-04-29T12:02:00.000Z",
          can_disconnect: false,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => initialSummary,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ summary: disconnectedSummary }),
        }),
    );

    render(<AccountAccessPageClient />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Disconnect app" }),
    );

    expect(await screen.findByText(/No active grants/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Disconnect app" })).toBeNull();
  });

  it("establishes a Vana account session when Privy is already authenticated", async () => {
    privyMock.authenticated = true;
    privyMock.identityToken = "test-identity-token";

    const summary = {
      account: {
        vana_user_id: "vana_user_2",
        display_name: "Tim",
        created_at: "2026-04-29T11:00:00.000Z",
      },
      provider_links: [],
      linked_wallets: [],
      connected_apps: [],
      access_requests: [],
      activity: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => summary,
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountAccessPageClient />);

    expect(await screen.findByText("vana_user_2")).toBeTruthy();
    expect(fetchMock.mock.calls).toHaveLength(3);
    // Call 1 + 3: vanaFetch normalizes init.headers to a Headers instance.
    expect(fetchMock.mock.calls[0][0]).toBe("/api/account/access");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
    });
    // No vana_access cookie, so vanaFetch issues the read-only GET without
    // an Authorization header (the server's vana_session cookie path covers
    // reads).
    expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBeNull();
    // Call 2 is the manual bootstrap — direct fetch, plain object headers.
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/session", {
      method: "POST",
      headers: { authorization: "Bearer test-identity-token" },
      cache: "no-store",
    });
    expect(fetchMock.mock.calls[2][0]).toBe("/api/account/access");
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
    });
  });
});
