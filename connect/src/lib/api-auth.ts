import { hashMessage, recoverAddress } from "viem";

/**
 * Read the master key signature from the Authorization header.
 * Query string values are not accepted: a credential in the URL ends up in
 * access logs and browser history.
 */
export function extractSignature(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const sig = header.replace(/^Bearer(\s+|$)/i, "").trim();
  return sig || null;
}

/**
 * Recover the wallet address from a master key signature.
 * The caller signs "vana-master-key-v1" with their wallet, and we recover
 * their address.
 */
export async function recoverWalletAddress(
  masterKeySignature: string,
): Promise<string> {
  return recoverAddress({
    hash: hashMessage("vana-master-key-v1"),
    signature: masterKeySignature as `0x${string}`,
  });
}
