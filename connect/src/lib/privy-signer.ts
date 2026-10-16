/**
 * Server-side signing with a user's Privy embedded wallet, authorized by the
 * app's Privy signer key. The wallet is found from the master key signature
 * (EIP-191 over "vana-master-key-v1").
 *
 * In-process only. This used to sit behind a public `POST /api/sign` route
 * that signed any caller-supplied ServerRegistration / ServerDeregistration
 * for whoever presented the master key signature, which made it a signing
 * oracle. Callers now build the exact payload themselves and call this
 * function directly.
 */

import { PrivyClient } from "@privy-io/node";
import { type Hex, hashMessage, recoverAddress } from "viem";

let _privy: PrivyClient | null = null;
function getPrivyClient() {
  if (!_privy) {
    _privy = new PrivyClient({
      appId: process.env.PRIVY_APP_ID!,
      appSecret: process.env.PRIVY_APP_SECRET!,
    });
  }
  return _privy;
}

export async function signTypedDataWithEmbeddedWallet(
  masterKeySignature: Hex,
  typedData: Record<string, unknown>,
): Promise<Hex> {
  const walletAddress = await recoverAddress({
    hash: hashMessage("vana-master-key-v1"),
    signature: masterKeySignature,
  });

  const privy = getPrivyClient();
  const user = await privy
    .users()
    .getByWalletAddress({ address: walletAddress });
  const embeddedWallet = user.linked_accounts?.find(
    (a) =>
      a.type === "wallet" &&
      "wallet_client_type" in a &&
      a.wallet_client_type === "privy" &&
      "address" in a &&
      (a.address as string).toLowerCase() === walletAddress.toLowerCase(),
  );
  if (!embeddedWallet || !("id" in embeddedWallet) || !embeddedWallet.id) {
    throw new Error("Embedded wallet not found for this address");
  }

  const result = await privy
    .wallets()
    .ethereum()
    .signTypedData(embeddedWallet.id as string, {
      // biome-ignore lint/suspicious/noExplicitAny: Privy's typed_data param type is narrower than our builder output
      params: { typed_data: typedData as any },
      authorization_context: {
        authorization_private_keys: [process.env.PRIVY_SIGNER_PRIVATE_KEY!],
      },
    });
  return result.signature as Hex;
}
