import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOidcReturnTo,
  persistOidcReturnTo,
  readOidcReturnTo,
  resolveOidcReturnTo,
} from "./oidc-continuation";

describe("oidc-continuation", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists and reads safe OIDC return_to", () => {
    persistOidcReturnTo("/auth/oidc/login?login_challenge=abc");
    expect(readOidcReturnTo()).toBe("/auth/oidc/login?login_challenge=abc");
  });

  it("ignores unsafe return_to values", () => {
    persistOidcReturnTo(null);
    expect(readOidcReturnTo()).toBeNull();

    persistOidcReturnTo("https://evil.example.com/auth/oidc/login");
    expect(readOidcReturnTo()).toBeNull();

    persistOidcReturnTo("/admin");
    expect(readOidcReturnTo()).toBeNull();

    persistOidcReturnTo("//evil.example.com/auth/oidc/login");
    expect(readOidcReturnTo()).toBeNull();
  });

  it("clears persisted value", () => {
    persistOidcReturnTo("/auth/oidc/consent?consent_challenge=z");
    clearOidcReturnTo();
    expect(readOidcReturnTo()).toBeNull();
  });

  it("resolveOidcReturnTo prefers URL over persisted storage", () => {
    persistOidcReturnTo("/auth/oidc/consent?consent_challenge=stored");
    const params = new URLSearchParams(
      "return_to=" +
        encodeURIComponent("/auth/oidc/login?login_challenge=fresh"),
    );
    expect(resolveOidcReturnTo(params)).toBe(
      "/auth/oidc/login?login_challenge=fresh",
    );
  });

  it("resolveOidcReturnTo falls back to storage when URL omits return_to", () => {
    persistOidcReturnTo("/auth/oidc/login?login_challenge=stored");
    const params = new URLSearchParams();
    expect(resolveOidcReturnTo(params)).toBe(
      "/auth/oidc/login?login_challenge=stored",
    );
  });

  it("resolveOidcReturnTo clears stale storage when URL has unsafe return_to", () => {
    persistOidcReturnTo("/auth/oidc/login?login_challenge=stored");
    const params = new URLSearchParams("return_to=/admin");
    expect(resolveOidcReturnTo(params)).toBeNull();
    expect(readOidcReturnTo()).toBeNull();
  });

  it("resolveOidcReturnTo returns null when neither URL nor storage is safe", () => {
    expect(resolveOidcReturnTo(new URLSearchParams())).toBeNull();
  });
});
