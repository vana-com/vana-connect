import { describe, expect, it } from "vitest";
import { resolveConnectAppRef } from "./app-query";
import { resolveConnectApp } from "./app-registry";

describe("resolveConnectApp", () => {
  it("defaults to discover-me when no app ref is provided", () => {
    const app = resolveConnectApp();
    expect(app.id).toBe("discover-me");
  });

  it("normalizes known app refs", () => {
    expect(resolveConnectApp("discover-me").id).toBe("discover-me");
    expect(resolveConnectApp("discover_me").id).toBe("discover-me");
    expect(resolveConnectApp("Discover Me").id).toBe("discover-me");
  });

  it("falls back for unknown app refs", () => {
    const app = resolveConnectApp("totally-unknown-app");
    expect(app.id).toBe("discover-me");
  });

  it("returns expected discover-me branding metadata", () => {
    const app = resolveConnectApp("discover-me");
    expect(app).toMatchObject({
      id: "discover-me",
      displayName: "Discover Me",
      iconBg: "#F28A07",
      iconFg: "#101114",
    });
  });
});

describe("resolveConnectAppRef", () => {
  it("uses app when present", () => {
    const searchParams = new URLSearchParams("app=discover-me&appId=foo");
    expect(resolveConnectAppRef(searchParams)).toBe("discover-me");
  });

  it("falls back to appId then appName", () => {
    expect(resolveConnectAppRef(new URLSearchParams("appId=discover_me"))).toBe(
      "discover_me",
    );
    expect(
      resolveConnectAppRef(new URLSearchParams("appName=Discover%20Me")),
    ).toBe("Discover Me");
  });

  it("returns null when no app ref query param exists", () => {
    expect(resolveConnectAppRef(new URLSearchParams("foo=bar"))).toBeNull();
  });
});
