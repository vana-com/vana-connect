import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

// ---------------------------------------------------------------------------
// EIP-712 constants (mirrors scripts/register-builder.ts)
// ---------------------------------------------------------------------------

const BUILDERS_DOMAIN = {
  name: "Vana Data Portability",
  version: "1",
  chainId: BigInt(1480),
  verifyingContract: "0x8325C0A0948483EdA023A1A2Fd895e62C5131234" as Address,
} as const;

const BUILDER_REGISTRATION_TYPES = {
  BuilderRegistration: [
    { name: "ownerAddress", type: "address" },
    { name: "granteeAddress", type: "address" },
    { name: "publicKey", type: "string" },
    { name: "appUrl", type: "string" },
  ],
} as const;

const GATEWAY_URL = "https://data-gateway.vana.org";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

type RegisterBuilderErrorCode =
  | "ALREADY_REGISTERED"
  | "VALIDATION_ERROR"
  | "NETWORK_ERROR"
  | "UNEXPECTED_ERROR";

type RegisterBuilderSuccess = {
  ok: true;
  data: {
    privateKey: Hex;
    builderId: string;
    ownerAddress: string;
  };
};

type RegisterBuilderFailure = {
  ok: false;
  error: {
    code: RegisterBuilderErrorCode;
    message: string;
  };
};

export type RegisterBuilderResult =
  | RegisterBuilderSuccess
  | RegisterBuilderFailure;

// ---------------------------------------------------------------------------
// registerBuilder
// ---------------------------------------------------------------------------

export async function registerBuilder(
  appUrl: string,
): Promise<RegisterBuilderResult> {
  try {
    // 1. Generate a fresh private key and derive account
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    // account.publicKey is already uncompressed (0x04 + 128 hex chars)
    const publicKey = account.publicKey;
    const ownerAddress = account.address;
    const granteeAddress = account.address;

    // 2. Sign EIP-712 BuilderRegistration
    const signature = await account.signTypedData({
      domain: BUILDERS_DOMAIN,
      types: BUILDER_REGISTRATION_TYPES,
      primaryType: "BuilderRegistration",
      message: {
        ownerAddress,
        granteeAddress,
        publicKey,
        appUrl,
      },
    });

    // 3. POST to gateway
    const response = await fetch(`${GATEWAY_URL}/v1/builders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Web3Signed ${signature}`,
      },
      body: JSON.stringify({
        ownerAddress,
        granteeAddress,
        publicKey,
        appUrl,
      }),
    });

    // 4. Handle response
    if (response.status === 201) {
      const data = (await response.json()) as { builderId?: string };
      return {
        ok: true,
        data: {
          privateKey,
          builderId: data.builderId ?? "",
          ownerAddress,
        },
      };
    }

    if (response.status === 409) {
      return {
        ok: false,
        error: {
          code: "ALREADY_REGISTERED",
          message:
            "A builder is already registered for this URL. A new key pair was generated — try again to register with the new key.",
        },
      };
    }

    if (response.status === 400) {
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: data.message ?? "The gateway rejected the request.",
        },
      };
    }

    // Any other non-success status
    return {
      ok: false,
      error: {
        code: "UNEXPECTED_ERROR",
        message: `Gateway returned status ${response.status}.`,
      },
    };
  } catch (error) {
    const isNetworkError =
      error instanceof TypeError && /fetch|network/i.test(error.message);

    return {
      ok: false,
      error: {
        code: isNetworkError ? "NETWORK_ERROR" : "UNEXPECTED_ERROR",
        message: isNetworkError
          ? "Could not reach the gateway. Check your network connection and try again."
          : error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
    };
  }
}
