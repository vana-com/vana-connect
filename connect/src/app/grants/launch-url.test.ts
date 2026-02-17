import { describe, expect, it } from "vitest";
import { resolveGrantLaunchUrl } from "./launch-url";

describe("resolveGrantLaunchUrl", () => {
  it("passes through relay deepLinkUrl unchanged", () => {
    const url = resolveGrantLaunchUrl({
      relayDeepLinkUrl: "vana://connect?sessionId=sess-1&secret=sec-1",
    });
    expect(url).toBe("vana://connect?sessionId=sess-1&secret=sec-1");
  });

  it("builds a vana://connect fallback URL with required params", () => {
    const url = resolveGrantLaunchUrl({
      sessionId: "sess-1",
      secret: "sec-1",
      appId: "discover-me",
      scopes: "read:chatgpt-conversations",
    });

    const parsed = new URL(url);
    expect(parsed.protocol).toBe("vana:");
    expect(parsed.host).toBe("connect");
    expect(parsed.searchParams.get("sessionId")).toBe("sess-1");
    expect(parsed.searchParams.get("secret")).toBe("sec-1");
    expect(parsed.searchParams.get("appId")).toBe("discover-me");
    expect(parsed.searchParams.get("scopes")).toBe(
      "read:chatgpt-conversations",
    );
  });

  it("uses test deep-link URL when relay URL is absent", () => {
    const url = resolveGrantLaunchUrl({
      testDeepLinkUrl: "vana://connect?sessionId=dev-smoke&secret=dev-smoke",
      sessionId: "sess-1",
      secret: "sec-1",
    });
    expect(url).toBe("vana://connect?sessionId=dev-smoke&secret=dev-smoke");
  });

  it("prefers relay URL over test deep-link URL", () => {
    const url = resolveGrantLaunchUrl({
      relayDeepLinkUrl: "vana://connect?sessionId=sess-1&secret=relay-secret",
      testDeepLinkUrl: "vana://connect?sessionId=dev-smoke&secret=dev-smoke",
    });
    expect(url).toBe("vana://connect?sessionId=sess-1&secret=relay-secret");
  });
});
