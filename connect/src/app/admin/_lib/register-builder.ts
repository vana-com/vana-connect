import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

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

/**
 * Gateway URL for builder registration. Falls back to prod for backwards
 * compatibility with existing prod deployments; non-prod environments
 * should set NEXT_PUBLIC_DATA_GATEWAY_URL on Vercel to keep registrations
 * scoped to the matching gateway env (PS reads its gateway from server
 * config and dev/prod gateways are distinct deployments).
 */
const GATEWAY_URL =
  process.env.NEXT_PUBLIC_DATA_GATEWAY_URL ?? "https://data-gateway.vana.org";

export type RegisterBuilderErrorCode =
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
    publicKey: string;
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

export async function registerBuilder(
  appUrl: string,
): Promise<RegisterBuilderResult> {
  try {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    const publicKey = account.publicKey;
    const ownerAddress = account.address;
    const granteeAddress = account.address;

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

    if (response.status === 201) {
      const data = (await response.json()) as { builderId?: string };
      return {
        ok: true,
        data: {
          privateKey,
          builderId: data.builderId ?? "",
          ownerAddress,
          publicKey,
        },
      };
    }

    if (response.status === 409) {
      return {
        ok: false,
        error: {
          code: "ALREADY_REGISTERED",
          message:
            "A builder is already registered for this URL. A new key pair was generated - try again to register with the new key.",
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
