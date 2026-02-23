import { describe, expect, it } from "vitest";
import { resolveConnectAppQuery } from "./app-query";
import { resolveConnectApp } from "./app-registry";

describe("resolveConnectApp", () => {
  it("defaults to neutral fallback metadata when no app params are provided", () => {
    const app = resolveConnectApp();
    expect(app).toEqual({
      displayName: "App",
      iconUrl: null,
      fallbackLabel: "A",
      iconBg: "#E8EBF0",
      iconFg: "#101114",
    });
  });

  it("derives favicon URL and display name from appUrl hostname", () => {
    const app = resolveConnectApp({ appUrl: "https://www.foo-bar.com/path" });
    expect(app.iconUrl).toBe("https://www.foo-bar.com/favicon.ico");
    expect(app.displayName).toBe("Foo Bar");
    expect(app.fallbackLabel).toBe("F");
  });

  it("prefers appName for display label while keeping favicon source from appUrl", () => {
    const app = resolveConnectApp({
      appUrl: "https://vana.ai",
      appName: "Discover Me",
    });
    expect(app.displayName).toBe("Discover Me");
    expect(app.iconUrl).toBe("https://vana.ai/favicon.ico");
    expect(app.fallbackLabel).toBe("D");
  });

  it("falls back to default label when appName has no alphanumeric chars", () => {
    const app = resolveConnectApp({ appName: "___" });
    expect(app.fallbackLabel).toBe("A");
  });

  it("ignores invalid appUrl values", () => {
    const app = resolveConnectApp({ appUrl: "not-a-url" });
    expect(app.iconUrl).toBeNull();
    expect(app.displayName).toBe("App");
  });
});

describe("resolveConnectAppQuery", () => {
  it("returns appUrl and appName fields", () => {
    const query = resolveConnectAppQuery(
      new URLSearchParams(
        "sessionId=sess-1&appUrl=https%3A%2F%2Ffoo-bar.com&appName=Foo",
      ),
    );
    expect(query).toEqual({
      appUrl: "https://foo-bar.com",
      appName: "Foo",
    });
  });

  it("returns null values when no branding params exist", () => {
    expect(resolveConnectAppQuery(new URLSearchParams("foo=bar"))).toEqual({
      appUrl: null,
      appName: null,
    });
  });
});
