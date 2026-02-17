import { describe, expect, it } from "vitest";
import { resolveGrantAppRef } from "./app-query";
import { resolveGrantApp } from "./app-registry";

describe("resolveGrantApp", () => {
  it("defaults to discover-me when no app ref is provided", () => {
    const app = resolveGrantApp();
    expect(app.id).toBe("discover-me");
  });

  it("normalizes known app refs", () => {
    expect(resolveGrantApp("discover-me").id).toBe("discover-me");
    expect(resolveGrantApp("discover_me").id).toBe("discover-me");
    expect(resolveGrantApp("Discover Me").id).toBe("discover-me");
  });

  it("falls back for unknown app refs", () => {
    const app = resolveGrantApp("totally-unknown-app");
    expect(app.id).toBe("discover-me");
  });

  it("returns expected discover-me branding metadata", () => {
    const app = resolveGrantApp("discover-me");
    expect(app).toMatchObject({
      id: "discover-me",
      displayName: "Discover Me",
      iconBg: "#F28A07",
      iconFg: "#101114",
    });
  });
});

describe("resolveGrantAppRef", () => {
  it("uses app when present", () => {
    const searchParams = new URLSearchParams("app=discover-me&appId=foo");
    expect(resolveGrantAppRef(searchParams)).toBe("discover-me");
  });

  it("falls back to appId then appName", () => {
    expect(resolveGrantAppRef(new URLSearchParams("appId=discover_me"))).toBe(
      "discover_me",
    );
    expect(
      resolveGrantAppRef(new URLSearchParams("appName=Discover%20Me")),
    ).toBe("Discover Me");
  });

  it("returns null when no app ref query param exists", () => {
    expect(resolveGrantAppRef(new URLSearchParams("foo=bar"))).toBeNull();
  });
});
