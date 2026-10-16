import { describe, expect, it } from "vitest";
import { resolveConnectLaunchUrl } from "./launch-url";

describe("resolveConnectLaunchUrl", () => {
  it("returns null without a sessionId", () => {
    expect(
      resolveConnectLaunchUrl({
        masterKeySig: "0xabc",
      }),
    ).toBeNull();
  });

  it("returns null without a masterKeySig", () => {
    expect(
      resolveConnectLaunchUrl({
        sessionId: "sess-1",
      }),
    ).toBeNull();
  });

  it("builds a vana://connect URL with sessionId and signature", () => {
    const url = resolveConnectLaunchUrl({
      sessionId: "sess-1",
      masterKeySig: "0xdeadbeef",
    });

    expect(url).toBeTruthy();
    if (!url) throw new Error("expected a launch URL");
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("vana:");
    expect(parsed.host).toBe("connect");
    expect(parsed.searchParams.get("sessionId")).toBe("sess-1");
    expect(parsed.searchParams.get("masterKeySig")).toBe("0xdeadbeef");
  });

  it("never sends the signature to an https redirect_uri", () => {
    const url = resolveConnectLaunchUrl({
      sessionId: "sess-1",
      masterKeySig: "0xdeadbeef",
      redirectUri: "https://attacker.example/cb",
      oauthState: "st",
    });

    expect(url).toBeTruthy();
    if (!url) throw new Error("expected a launch URL");
    expect(url).not.toContain("attacker.example");
    expect(new URL(url).protocol).toBe("vana:");
  });

  it("includes secret when provided", () => {
    const url = resolveConnectLaunchUrl({
      sessionId: "sess-1",
      secret: "sec-1",
      masterKeySig: "0xdeadbeef",
    });

    expect(url).toBeTruthy();
    if (!url) throw new Error("expected a launch URL");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("secret")).toBe("sec-1");
  });
});
