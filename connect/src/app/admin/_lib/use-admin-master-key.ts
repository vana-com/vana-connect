"use client";

import { useSignMessage, useWallets } from "@privy-io/react-auth";
import { useCallback, useRef } from "react";

const MASTER_KEY_MESSAGE = "vana-master-key-v1";

/**
 * Returns a getter that lazily produces the master-key signature for the
 * current Privy embedded wallet, caching it for the session. Same shape as
 * the `getSignature` closure in `app/server/use-server.ts` — admin and
 * server-provisioning flows share one signature so the user is never
 * prompted twice in a session.
 */
export function useAdminMasterKey() {
  const { signMessage } = useSignMessage();
  const { wallets } = useWallets();
  const signatureRef = useRef<string | null>(null);

  const embeddedWalletAddress = (() => {
    for (const wallet of wallets) {
      if (
        wallet.walletClientType === "privy" ||
        wallet.walletClientType === "privy-v2"
      ) {
        if (typeof wallet.address === "string" && wallet.address.length > 0) {
          return wallet.address;
        }
      }
    }
    return null;
  })();

  const getSignature = useCallback(async (): Promise<string> => {
    if (signatureRef.current) return signatureRef.current;
    const { signature } = await signMessage(
      { message: MASTER_KEY_MESSAGE },
      {
        uiOptions: { showWalletUIs: false },
        address: embeddedWalletAddress ?? undefined,
      },
    );
    signatureRef.current = signature;
    return signature;
  }, [signMessage, embeddedWalletAddress]);

  return { getSignature, embeddedWalletAddress };
}
