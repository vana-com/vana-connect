import { hashMessage, recoverAddress } from "viem";

/**
 * Recover the wallet address from a master key signature.
 * Same pattern as /api/sign — the caller signs "vana-master-key-v1"
 * with their wallet, and we recover their address.
 */
export async function recoverWalletAddress(
  masterKeySignature: string,
): Promise<string> {
  return recoverAddress({
    hash: hashMessage("vana-master-key-v1"),
    signature: masterKeySignature as `0x${string}`,
  });
}
