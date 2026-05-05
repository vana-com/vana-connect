import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, renderOidcErrorPage } from "./route";

function makeRequest(query: Record<string, string>): NextRequest {
  const url = new URL("https://account.vana.test/auth/oidc/error");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

describe("GET /auth/oidc/error", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 200 with the error code and description", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const response = await GET(
      makeRequest({
        error: "invalid_client",
        error_description: "The OAuth client could not be found.",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("invalid_client");
    expect(body).toContain("The OAuth client could not be found.");
  });

  it("renders error_hint when present", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const response = await GET(
      makeRequest({
        error: "invalid_request",
        error_description: "Bad request.",
        error_hint: "The login_challenge has expired.",
      }),
    );

    const body = await response.text();
    expect(body).toContain("The login_challenge has expired.");
  });

  it("hides error_debug in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await GET(
      makeRequest({
        error: "server_error",
        error_description: "Internal failure.",
        error_debug: "stack trace at handler.ts:42",
      }),
    );

    const body = await response.text();
    expect(body).toContain("server_error");
    expect(body).not.toContain("stack trace at handler.ts:42");
  });

  it("shows error_debug outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await GET(
      makeRequest({
        error: "server_error",
        error_description: "Internal failure.",
        error_debug: "stack trace at handler.ts:42",
      }),
    );

    const body = await response.text();
    expect(body).toContain("stack trace at handler.ts:42");
  });

  it("falls back to a generic description when none is provided", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const response = await GET(makeRequest({}));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("unknown_error");
  });
});

describe("renderOidcErrorPage", () => {
  it("escapes HTML in user-controlled fields", () => {
    const html = renderOidcErrorPage({
      error: "<script>alert(1)</script>",
      errorDescription: "<img src=x onerror=alert(1)>",
      errorHint: null,
      errorDebug: null,
      showDebug: false,
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });
});
