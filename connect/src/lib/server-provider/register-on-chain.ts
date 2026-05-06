/**
 * Register a freshly provisioned Personal Server on the Data Portability
 * Gateway via `POST /v1/servers`. Establishes the on-chain delegation that
 * lets the PS sign FileRegistration / GrantRegistration / GrantRevocation on
 * the user's behalf without needing to invoke the user's wallet for each
 * protocol op.
 *
 * Trust chain established here:
 *   user wallet (ownerAddress)
 *     └── signs ServerRegistration EIP-712  via wallet.signTypedData
 *           → gateway records: ownerAddress trusts serverAddress
 *
 * After this lands, builder discovery (`GET /v1/servers/{ownerAddress}`)
 * resolves to this server's URL, and PS-signed grant/file operations are
 * accepted by the gateway under the delegation fallback.
 *
 * --- Migration notes (auth-redesign PR-X) ---
 *
 * Pre-PR-X: this lib POSTed to `/api/sign` with a `masterKeySignature`
 * recovered from the user's `vana-master-key-v1` signature. That path is
 * gone. The lib now calls `wallet.signTypedData(...)` directly with
 * `purpose: 'register_personal_server'` (a HIGH_RISK_PURPOSE).
 *
 * Because it's high-risk, the call MAY return `kind: 'confirmation_required'`
 * — the user must click Confirm in the inline modal first. The route
 * caller bubbles this up as a 401 envelope; the client handles the
 * confirmation dance and retries with `confirmationId`.
 *
 * See docs/auth-redesign/01-architecture.md §1.5, §10.2 (PR-X).
 */

import type { Address } from "viem";
import { signTypedData, type SigningResult } from "@/lib/auth/wallet";
import { privyAdapter } from "@/lib/auth/wallet-providers/privy";

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
  | "CONFIRMATION_REQUIRED"
  | "WALLET_NOT_SUPPORTED"
  | "HEALTH_FETCH_FAILED"
  | "NETWORK_ERROR"
  | "UNEXPECTED_ERROR";

export type RegisterServerResult =
  | { ok: true; data: { serverId: string; serverAddress: Address } }
  | {
      ok: false;
      error: {
        code: "CONFIRMATION_REQUIRED";
        message: string;
        confirmationId: string;
        payloadSummary: Record<string, unknown>;
        expiresAt: string;
      };
    }
  | {
      ok: false;
      error: {
        code: Exclude<RegisterServerErrorCode, "CONFIRMATION_REQUIRED">;
        message: string;
      };
    };

export interface RegisterServerInput {
  vanaUserId: string;
  hydraSessionId: string;
  /** Owner wallet address (resolved by the route from vana_linked_wallets). */
  ownerAddress: Address;
  /** Public URL the PS is reachable at, e.g. https://0xabc….myvana.app */
  serverUrl: string;
  /** Optional: forward the user's confirmation row id when retrying after the inline modal. */
  confirmationId?: string;
}

/**
 * Fetches the PS's identity (serverAddress + publicKey) from its /health
 * endpoint, then signs and submits the ServerRegistration to the gateway.
 *
 * Idempotent: gateway returns 409 if the server is already registered, which
 * we treat as success.
 */
export async function registerServerOnChain(
  input: RegisterServerInput,
): Promise<RegisterServerResult> {
  // 1. Fetch identity from PS /health, with retry for transient post-provision
  //    states. After provisioning, the VM is up before the Cloudflare tunnel
  //    has fully registered with Cloudflare's edge — the page sees status =
  //    "running" (driven by GCP VM state) and auto-fires register-on-chain.
  //    The Cloudflare tunnel can return 530 (origin unreachable) or 502/503/
  //    504 for ~30-60s during that window. Retry on transient failures.
  let serverAddress: Address;
  let publicKey: string;
  {
    const TRANSIENT_HTTP = new Set([
      502, 503, 504, 522, 523, 524, 525, 526, 530,
    ]);
    const MAX_ATTEMPTS = 6;
    let lastErr: { code: "HEALTH_FETCH_FAILED"; message: string } | null = null;
    let success: { addr: Address; pk: string } | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const healthRes = await fetch(`${input.serverUrl}/health`, {
          cache: "no-store",
        });
        if (!healthRes.ok) {
          lastErr = {
            code: "HEALTH_FETCH_FAILED",
            message: `PS /health returned ${healthRes.status}`,
          };
          if (!TRANSIENT_HTTP.has(healthRes.status)) break;
        } else {
          const health = (await healthRes.json()) as {
            identity?: { address?: string; publicKey?: string };
          };
          if (!health.identity?.address || !health.identity?.publicKey) {
            lastErr = {
              code: "HEALTH_FETCH_FAILED",
              message: "PS /health did not return identity.address + publicKey",
            };
            break;
          }
          success = {
            addr: health.identity.address as Address,
            pk: health.identity.publicKey,
          };
          break;
        }
      } catch (err) {
        lastErr = {
          code: "HEALTH_FETCH_FAILED",
          message: err instanceof Error ? err.message : String(err),
        };
        // Network-level failure is treated as transient.
      }
      // Linear backoff capped at total ~30s across 6 attempts: 1s, 3s, 5s, 7s, 9s.
      if (attempt < MAX_ATTEMPTS - 1) {
        const backoffMs = 1000 + attempt * 2000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    if (!success) {
      return {
        ok: false,
        error: lastErr ?? {
          code: "HEALTH_FETCH_FAILED",
          message: "PS /health probe exhausted retries",
        },
      };
    }
    serverAddress = success.addr;
    publicKey = success.pk;
  }

  // 2. Build the EIP-712 typed-data payload exactly matching the gateway's
  //    ServerRegistration verification.
  const typedData = {
    domain: {
      name: SERVERS_DOMAIN.name,
      version: SERVERS_DOMAIN.version,
      chainId: Number(SERVERS_DOMAIN.chainId),
      verifyingContract: SERVERS_DOMAIN.verifyingContract,
    },
    primaryType: "ServerRegistration" as const,
    types: {
      ...SERVER_REGISTRATION_TYPES,
    },
    message: {
      ownerAddress: input.ownerAddress,
      serverAddress,
      publicKey,
      serverUrl: input.serverUrl,
    },
  };

  // 3. Sign via the Vana wallet API. May return confirmation_required for the
  //    high-risk register_personal_server purpose.
  let signResult: SigningResult;
  try {
    signResult = await signTypedData(
      {
        vanaUserId: input.vanaUserId,
        hydraSessionId: input.hydraSessionId,
        purpose: "register_personal_server",
        typedData,
        confirmationId: input.confirmationId,
      },
      { adapter: privyAdapter },
    );
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "SIGN_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (signResult.kind === "not_supported_yet") {
    return {
      ok: false,
      error: {
        code: "WALLET_NOT_SUPPORTED",
        message:
          "Server-side signing is not supported for this wallet type. " +
          "User-controlled EOAs require an interactive signature flow that " +
          "isn't yet implemented.",
      },
    };
  }
  if (signResult.kind === "confirmation_required") {
    return {
      ok: false,
      error: {
        code: "CONFIRMATION_REQUIRED",
        message: "User confirmation required for this signing operation",
        confirmationId: signResult.confirmationId,
        payloadSummary: signResult.payloadSummary,
        expiresAt: signResult.expiresAt,
      },
    };
  }
  const signature = signResult.signature;

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
