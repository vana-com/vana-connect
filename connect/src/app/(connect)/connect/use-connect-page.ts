"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy, useSignMessage, useSigners } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";

const KEY_QUORUM_ID = process.env.NEXT_PUBLIC_KEY_QUORUM_ID!;

export type ConnectPageView = "loading" | "signing" | "ready" | "error";

export function useConnectPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("sessionId");
  const secret = searchParams.get("secret");

  const { ready, authenticated, user } = usePrivy();
  const { signMessage } = useSignMessage();
  const { addSigners } = useSigners();

  const [view, setView] = useState<ConnectPageView>("loading");
  const [error, setError] = useState<string | null>(null);
  const [masterKeySig, setMasterKeySig] = useState<string | null>(null);

  const signingRef = useRef(false);
  const signersAddedRef = useRef(false);

  const walletAddress = user?.wallet?.address;

  // Add signers after authentication
  const handleAddSigners = useCallback(
    async (address: string) => {
      if (signersAddedRef.current) return;
      signersAddedRef.current = true;
      try {
        await addSigners({
          address,
          signers: [{ signerId: KEY_QUORUM_ID, policyIds: [] }],
        });
      } catch {
        // Expected to fail if signer already exists on this wallet
      }
    },
    [addSigners],
  );

  // Redirect to /login when not authenticated
  useEffect(() => {
    if (!ready || !sessionId) return;
    if (!authenticated && view !== "error") {
      const qs = new URLSearchParams();
      qs.set("sessionId", sessionId);
      if (secret) qs.set("secret", secret);
      router.replace(`/login?${qs.toString()}`);
    }
  }, [ready, authenticated, sessionId, secret, view, router]);

  // Add signers when authenticated with a wallet
  useEffect(() => {
    if (authenticated && walletAddress) {
      handleAddSigners(walletAddress);
    }
  }, [authenticated, walletAddress, handleAddSigners]);

  // Sign the master key after authentication
  useEffect(() => {
    if (!authenticated || !walletAddress || masterKeySig || signingRef.current)
      return;

    signingRef.current = true;
    setView("signing");

    signMessage(
      { message: "vana-master-key-v1" },
      { uiOptions: { showWalletUIs: false } },
    )
      .then(({ signature }) => {
        setMasterKeySig(signature);
        setView("ready");
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to sign master key",
        );
        setView("error");
        signingRef.current = false;
      });
  }, [authenticated, walletAddress, masterKeySig, signMessage]);

  // Build the deep link URL
  const deepLinkUrl =
    masterKeySig && sessionId
      ? `vana://connect?sessionId=${encodeURIComponent(sessionId)}${secret ? `&secret=${encodeURIComponent(secret)}` : ""}&masterKeySig=${encodeURIComponent(masterKeySig)}`
      : null;

  return {
    view,
    error,
    sessionId,
    deepLinkUrl,
  };
}
