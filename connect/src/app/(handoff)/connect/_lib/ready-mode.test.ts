import { describe, expect, it } from "vitest";
import { resolveConnectReadyMode } from "./ready-mode";

describe("resolveConnectReadyMode", () => {
  it("redirects OAuth/HTTPS flows regardless of device", () => {
    expect(
      resolveConnectReadyMode({
        isHttpsRedirect: true,
        isMobile: true,
        isLocalServerAuthFromDataConnect: false,
      }),
    ).toBe("https-redirect");
  });

  it("hands off on mobile for the vana:// path", () => {
    expect(
      resolveConnectReadyMode({
        isHttpsRedirect: false,
        isMobile: true,
        isLocalServerAuthFromDataConnect: false,
      }),
    ).toBe("mobile-handoff");
  });

  it("keeps the deep-link CTA on desktop", () => {
    expect(
      resolveConnectReadyMode({
        isHttpsRedirect: false,
        isMobile: false,
        isLocalServerAuthFromDataConnect: false,
      }),
    ).toBe("desktop-deep-link");
  });

  it("keeps the deep-link CTA for local-server-auth even on mobile (DataConnect owns vana://)", () => {
    expect(
      resolveConnectReadyMode({
        isHttpsRedirect: false,
        isMobile: true,
        isLocalServerAuthFromDataConnect: true,
      }),
    ).toBe("desktop-deep-link");
  });
});
