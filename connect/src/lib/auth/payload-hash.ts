/**
 * JCS canonicalization (RFC 8785) + sha256 for typed-data payloads.
 *
 * See docs/auth-redesign/01-architecture.md §2.3.
 *
 * The same canonicalize+hash function is used by:
 *   - wallet.signTypedData when computing payload_hash for the authority row
 *   - the validator that rejects mismatched payloads on retry
 *   - interactive_confirmations issuance (binds confirmation to authority)
 *
 * Why JCS rather than JSON.stringify-with-sorted-keys: JCS specifies number
 * serialization (no leading zeros, no trailing zeros, etc.) and string
 * escaping precisely. JSON.stringify diverges on numbers between engines.
 *
 * The implementation here covers the subset we use: nested objects, arrays,
 * strings, numbers (integers + safe floats), booleans, null. It does NOT
 * cover BigInt or non-finite numbers; callers that need those must serialize
 * to strings before hashing.
 */

import { createHash } from "node:crypto";

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) {
    throw new Error("canonicalize: undefined is not JSON-representable");
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(`canonicalize: non-finite number: ${value}`);
      }
      return canonicalizeNumber(value);
    case "string":
      return canonicalizeString(value);
    case "bigint":
      throw new Error(
        "canonicalize: BigInt not supported; serialize to string first",
      );
    case "object":
      if (Array.isArray(value)) {
        return canonicalizeArray(value);
      }
      return canonicalizeObject(value as Record<string, unknown>);
    default:
      throw new Error(`canonicalize: unsupported type: ${typeof value}`);
  }
}

/**
 * Number serialization per RFC 8785 §3.2.2.3 (ECMAScript 2018 §6.1.6.1.13
 * Number::toString). For our use case (typed-data ints up to 2**53-1, EVM
 * chainIds, expiry timestamps, nonces) JS native toString is conformant.
 */
function canonicalizeNumber(n: number): string {
  if (Number.isInteger(n)) return n.toString(10);
  return n.toString(); // ECMAScript Number::toString
}

/**
 * String serialization per RFC 8785 §3.2.2.2 / RFC 8259. Use JSON.stringify
 * which already produces RFC 8259-conformant output for strings; JCS adds
 * stricter rules about which Unicode code points must be escaped vs left
 * raw, and JSON.stringify's defaults are JCS-compatible for code points
 * U+0020 and above except U+0022 and U+005C, which it escapes correctly.
 */
function canonicalizeString(s: string): string {
  return JSON.stringify(s);
}

function canonicalizeArray(arr: unknown[]): string {
  const parts = arr.map((v) => canonicalize(v));
  return `[${parts.join(",")}]`;
}

function canonicalizeObject(obj: Record<string, unknown>): string {
  // Sort keys lexicographically by UTF-16 code-unit order — the same order
  // String.prototype.localeCompare with the default sensitivity uses, and
  // the order Array.prototype.sort uses.
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const parts = keys.map(
    (k) => `${canonicalizeString(k)}:${canonicalize(obj[k])}`,
  );
  return `{${parts.join(",")}}`;
}

export function payloadHash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}
