import { createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { RequestSignerConfig } from "../core/types.js";

function base64urlEncode(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function canonicalizeJson(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalizeJson);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    if (key === "signature") continue;
    sorted[key] = canonicalizeJson((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

function computeBodyHash(body?: string): string {
  if (!body || body.length === 0) {
    return "";
  }
  const parsed = JSON.parse(body);
  const canonical = canonicalizeJson(parsed);
  const canonicalStr = JSON.stringify(canonical);
  return createHash("sha256").update(canonicalStr).digest("hex");
}

/**
 * Generates `Web3Signed` authorization headers for protocol requests.
 *
 * @see {@link createRequestSigner} to create an instance.
 */
export interface RequestSigner {
  /**
   * Signs a request and returns the `Authorization` header value.
   *
   * @param params - Request metadata (audience, method, URI, optional body and grantId).
   * @returns A `Web3Signed <payload>.<signature>` header string.
   */
  signRequest(params: {
    aud: string;
    method: string;
    uri: string;
    body?: string;
    grantId?: string;
  }): Promise<string>;
  /** The wallet address derived from the private key. */
  readonly address: `0x${string}`;
}

/**
 * Creates a request signer that generates `Web3Signed` authorization headers.
 *
 * @param config - Configuration containing the builder's private key.
 * @returns A {@link RequestSigner} instance.
 */
export function createRequestSigner(
  config: RequestSignerConfig,
): RequestSigner {
  const account = privateKeyToAccount(config.privateKey);

  return {
    address: account.address,

    async signRequest(params): Promise<string> {
      const now = Math.floor(Date.now() / 1000);

      const payload: Record<string, unknown> = {
        aud: params.aud,
        bodyHash: computeBodyHash(params.body),
        exp: now + 300,
        iat: now,
        method: params.method,
        uri: params.uri,
      };

      if (params.grantId !== undefined) {
        payload["grantId"] = params.grantId;
      }

      // Sort keys for deterministic serialization
      const sortedPayload = Object.keys(payload)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = payload[key];
          return acc;
        }, {});

      const payloadJson = JSON.stringify(sortedPayload);
      const payloadBase64 = base64urlEncode(payloadJson);

      const signature = await account.signMessage({ message: payloadBase64 });

      return `Web3Signed ${payloadBase64}.${signature}`;
    },
  };
}
