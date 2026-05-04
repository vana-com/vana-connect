/**
 * Register a freshly provisioned Personal Server on the Data Portability
 * Gateway via `POST /v1/servers`. Establishes the on-chain delegation that
 * lets the PS sign FileRegistration / GrantRegistration / GrantRevocation on
 * the user's behalf without needing to invoke the user's wallet for each
 * protocol op.
 *
 * Trust chain established here:
 *   user wallet (ownerAddress)
 *     └── signs ServerRegistration EIP-712
 *           → gateway records: ownerAddress trusts serverAddress
 *
 * After this lands, builder discovery (`GET /v1/servers/{ownerAddress}`)
 * resolves to this server's URL, and PS-signed grant/file operations are
 * accepted by the gateway under the delegation fallback.
 */

import type { Address, Hex } from "viem";

const SERVERS_DOMAIN = {
  name: "Vana Data Portability",
  version: "1",
  chainId: BigInt(
    process.env.NEXT_PUBLIC_VANA_CHAIN_ID ?? process.env.VANA_CHAIN_ID ?? 1480,
  ),
  verifyingContract: (process.env.DATA_PORTABILITY_SERVER_CONTRACT ??
    "0x0000000000000000000000000000000000000000") as Address,
} as const;

const SERVER_REGISTRATION_TYPES = {
  ServerRegistration: [
    { name: "ownerAddress", type: "address" },
    { name: "serverAddress", type: "address" },
    { name: "publicKey", type: "string" },
    { name: "serverUrl", type: "string" },
  ],
} as const;

const GATEWAY_URL =
  process.env.DATA_GATEWAY_URL ?? "https://data-gateway.vana.org";

export type RegisterServerErrorCode =
  | "ALREADY_REGISTERED"
  | "VALIDATION_ERROR"
  | "SIGN_FAILED"
  | "HEALTH_FETCH_FAILED"
  | "NETWORK_ERROR"
  | "UNEXPECTED_ERROR";

export type RegisterServerResult =
  | { ok: true; data: { serverId: string; serverAddress: Address } }
  | { ok: false; error: { code: RegisterServerErrorCode; message: string } };

export interface RegisterServerInput {
  /** EIP-191 signature over "vana-master-key-v1" — used to sign ServerRegistration via /api/sign */
  masterKeySignature: Hex;
  /** Owner wallet address (recovered from masterKeySignature) */
  ownerAddress: Address;
  /** Public URL the PS is reachable at, e.g. https://0xabc….myvana.app */
  serverUrl: string;
  /** Origin to call /api/sign on (defaults to current host's account.vana.org) */
  signEndpoint: string;
}

/**
 * Fetches the PS's identity (serverAddress + publicKey) from its /health
 * endpoint, then signs and submits the ServerRegistration to the gateway.
 *
 * Idempotent: gateway returns 409 if server is already registered, which we
 * treat as success (caller usually doesn't care).
 */
export async function registerServerOnChain(
  input: RegisterServerInput,
): Promise<RegisterServerResult> {
  // 1. Fetch identity from PS /health
  let serverAddress: Address;
  let publicKey: string;
  try {
    const healthRes = await fetch(`${input.serverUrl}/health`, {
      // Gateway calls are public; /health is unauthenticated.
      cache: "no-store",
    });
    if (!healthRes.ok) {
      return {
        ok: false,
        error: {
          code: "HEALTH_FETCH_FAILED",
          message: `PS /health returned ${healthRes.status}`,
        },
      };
    }
    const health = (await healthRes.json()) as {
      identity?: { address?: string; publicKey?: string };
    };
    if (!health.identity?.address || !health.identity?.publicKey) {
      return {
        ok: false,
        error: {
          code: "HEALTH_FETCH_FAILED",
          message: "PS /health did not return identity.address + publicKey",
        },
      };
    }
    serverAddress = health.identity.address as Address;
    publicKey = health.identity.publicKey;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "HEALTH_FETCH_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // 2. Build the EIP-712 typed-data payload exactly matching the gateway's
  //    ServerRegistration verification (lib/eip712.ts in vana-com/data-gateway).
  const typedData = {
    domain: {
      name: SERVERS_DOMAIN.name,
      version: SERVERS_DOMAIN.version,
      chainId: SERVERS_DOMAIN.chainId.toString(),
      verifyingContract: SERVERS_DOMAIN.verifyingContract,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...SERVER_REGISTRATION_TYPES,
    },
    // Privy's signTypedData expects snake_case `primary_type`, not the
    // EIP-712 standard `primaryType`. Validation in /api/sign accepts both.
    primary_type: "ServerRegistration" as const,
    message: {
      ownerAddress: input.ownerAddress,
      serverAddress,
      publicKey,
      serverUrl: input.serverUrl,
    },
  };

  // 3. Sign via /api/sign (server-side Privy authorization signer)
  let signature: Hex;
  try {
    const signRes = await fetch(input.signEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        masterKeySignature: input.masterKeySignature,
        type: "eth_signTypedData_v4",
        typedData,
      }),
    });
    if (!signRes.ok) {
      const body = await signRes.json().catch(() => ({}));
      return {
        ok: false,
        error: {
          code: "SIGN_FAILED",
          message:
            (body as { error?: string }).error ??
            `Sign endpoint returned ${signRes.status}`,
        },
      };
    }
    const json = (await signRes.json()) as { signature?: Hex };
    if (!json.signature) {
      return {
        ok: false,
        error: { code: "SIGN_FAILED", message: "No signature returned" },
      };
    }
    signature = json.signature;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "SIGN_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  // 4. POST to gateway /v1/servers
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/servers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Web3Signed ${signature}`,
      },
      body: JSON.stringify({
        ownerAddress: input.ownerAddress,
        serverAddress,
        publicKey,
        serverUrl: input.serverUrl,
      }),
    });

    if (res.status === 201) {
      const body = (await res.json()) as { serverId?: string };
      return {
        ok: true,
        data: { serverId: body.serverId ?? "", serverAddress },
      };
    }

    if (res.status === 409) {
      // Already registered for this serverAddress — treat as success.
      return {
        ok: true,
        data: { serverId: "", serverAddress },
      };
    }

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            (body as { error?: string }).error ??
            `Gateway rejected with status ${res.status}`,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: "UNEXPECTED_ERROR",
        message: `Gateway returned status ${res.status}`,
      },
    };
  } catch (err) {
    const isNetworkError =
      err instanceof TypeError && /fetch|network/i.test(err.message);
    return {
      ok: false,
      error: {
        code: isNetworkError ? "NETWORK_ERROR" : "UNEXPECTED_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
