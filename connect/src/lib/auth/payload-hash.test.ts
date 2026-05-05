import { describe, expect, it } from "vitest";
import { canonicalize, payloadHash } from "./payload-hash";

describe("canonicalize", () => {
  it("sorts object keys lexicographically", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("handles nested objects with sorted keys at every level", () => {
    expect(canonicalize({ b: { y: 1, x: 2 }, a: 3 })).toBe(
      '{"a":3,"b":{"x":2,"y":1}}',
    );
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("emits null/true/false literals", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
  });

  it("emits integers without decimal point", () => {
    expect(canonicalize(0)).toBe("0");
    expect(canonicalize(1480)).toBe("1480");
    expect(canonicalize(-1)).toBe("-1");
  });

  it("escapes strings per JSON rules", () => {
    expect(canonicalize("hello")).toBe('"hello"');
    expect(canonicalize('she said "hi"')).toBe('"she said \\"hi\\""');
  });

  it("omits undefined values from objects", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("throws on undefined at top level", () => {
    expect(() => canonicalize(undefined)).toThrow();
  });

  it("throws on BigInt", () => {
    expect(() => canonicalize(BigInt(1))).toThrow();
  });

  it("throws on non-finite numbers", () => {
    expect(() => canonicalize(Infinity)).toThrow();
    expect(() => canonicalize(NaN)).toThrow();
  });

  it("produces equal output for equal values regardless of key order", () => {
    const a = { a: 1, b: { c: 2, d: 3 } };
    const b = { b: { d: 3, c: 2 }, a: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });
});

describe("payloadHash", () => {
  it("produces a 64-char hex string", () => {
    const h = payloadHash({ foo: "bar" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("equal values produce equal hashes regardless of key order", () => {
    const a = payloadHash({ a: 1, b: 2 });
    const b = payloadHash({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("different values produce different hashes", () => {
    expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }));
  });
});
