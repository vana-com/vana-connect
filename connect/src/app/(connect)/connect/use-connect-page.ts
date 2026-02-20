"use client";

import { usePrivy, useSigners, useSignMessage } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveConnectLaunchUrl } from "./launch-url";
import { resolveConnectPageUiDebugState } from "./use-connect-page.ui-debug";

const KEY_QUORUM_ID = process.env.NEXT_PUBLIC_KEY_QUORUM_ID ?? "";

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
  const signRetriesRef = useRef(0);

  const walletAddress = user?.wallet?.address;

  // Add signers after authentication
  const handleAddSigners = useCallback(
    async (address: string) => {
      if (!KEY_QUORUM_ID) return;
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
        signingRef.current = false;
        // Retry once — the embedded wallet may not be ready immediately
        if (signRetriesRef.current < 1) {
          signRetriesRef.current += 1;
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to sign master key",
        );
        setView("error");
      });
  }, [authenticated, walletAddress, masterKeySig, signMessage]);

  const deepLinkUrl = resolveConnectLaunchUrl({
    sessionId,
    secret,
    masterKeySig,
  });

  const ui = resolveConnectPageUiDebugState({
    view,
    error,
    sessionId,
    deepLinkUrl,
  });

  return {
    view: ui.view,
    error: ui.error,
    sessionId: ui.sessionId,
    deepLinkUrl: ui.deepLinkUrl,
  };
}
