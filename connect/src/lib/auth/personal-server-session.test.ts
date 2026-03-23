import { describe, expect, it, vi } from "vitest";
import {
  generatePersonalServerSessionToken,
  provisionPersonalServerSessionToken,
} from "./personal-server-session";

describe("generatePersonalServerSessionToken", () => {
  it("returns a vana_ps_-prefixed random token", () => {
    const token = generatePersonalServerSessionToken();
    expect(token).toMatch(/^vana_ps_[a-f0-9]{64}$/);
  });
});

describe("provisionPersonalServerSessionToken", () => {
  it("adds a session token to the running Personal Server with expiry metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "created" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const expiresAt = new Date("2026-04-22T00:00:00.000Z");

    await expect(
      provisionPersonalServerSessionToken({
        serverUrl: "https://ps.example/",
        controlPlaneToken: "vana_ps_control_plane",
        issuedToken: "vana_ps_cli_token",
        expiresAt,
        fetchImpl,
      }),
    ).resolves.toBe("vana_ps_cli_token");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ps.example/auth/device/token",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer vana_ps_control_plane",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: "vana_ps_cli_token",
          expires_at: expiresAt.toISOString(),
        }),
      },
    );
  });
});
