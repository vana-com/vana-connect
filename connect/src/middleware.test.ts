import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

describe("middleware root handoff canonicalization", () => {
  it("redirects root handoff URLs to canonical /connect with whitelisted params", () => {
    const request = new NextRequest(
      "https://account.vana.org/?sessionId=sess-1&secret=sec-1&app=discover-me&authDebug=1",
    );

    const response = middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://account.vana.org/connect?sessionId=sess-1&secret=sec-1&app=discover-me",
    );
  });

  it("passes through root requests without handoff context", () => {
    const request = new NextRequest("https://account.vana.org/");
    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("passes through root requests with whitespace-only sessionId", () => {
    const request = new NextRequest(
      "https://account.vana.org/?sessionId=%20%20%20",
    );
    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("passes through non-root routes", () => {
    const request = new NextRequest(
      "https://account.vana.org/connect?sessionId=sess-1",
    );
    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
