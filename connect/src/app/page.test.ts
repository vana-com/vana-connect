import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn<(url: string) => never>(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import Page from "./page";

describe("root page routing", () => {
  beforeEach(() => {
    mocks.redirect.mockReset();
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  it("redirects to canonical connect URL when session params are present", async () => {
    await expect(
      Page({
        searchParams: Promise.resolve({
          sessionId: "sess-123",
          secret: "sec-abc",
          app: "discover-me",
        }),
      }),
    ).rejects.toThrow(
      "REDIRECT:/connect?sessionId=sess-123&secret=sec-abc&app=discover-me",
    );
  });

  it("redirects to login for direct visits without handoff context", async () => {
    await expect(
      Page({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("REDIRECT:/login");
  });
});
