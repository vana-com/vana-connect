"use client";

import { usePrivy, useSigners, useSignMessage } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveConnectLaunchUrl } from "./launch-url";
import { resolveConnectPageUiDebugState } from "./use-connect-page.ui-debug";

const KEY_QUORUM_ID = process.env.NEXT_PUBLIC_KEY_QUORUM_ID ?? "";
const SESSION_STORAGE_KEY = "vana_connect_session";
const WALLET_READY_TIMEOUT_MS = 10_000;

function saveSession(sessionId: string, secret: string | null) {
  try {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ sessionId, secret }),
    );
  } catch {
    // localStorage may be unavailable in some browser contexts
  }
}

function getWalletAddress(
  user: ReturnType<typeof usePrivy>["user"],
): string | null {
  if (user?.wallet?.address) return user.wallet.address;
  if (!user?.linkedAccounts) return null;

  for (const account of user.linkedAccounts) {
    if (
      account.type === "wallet" &&
      "address" in account &&
      typeof account.address === "string"
    ) {
      return account.address;
    }
  }

  return null;
}

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
  const walletReadyTimeoutRef = useRef<number | null>(null);

  const walletAddress = getWalletAddress(user);

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

  // Persist session params in case auth redirects lose query params.
  useEffect(() => {
    if (!sessionId) return;
    saveSession(sessionId, secret);
  }, [sessionId, secret]);

  // Avoid infinite "Preparing..." if auth is true but wallet never appears.
  useEffect(() => {
    if (walletReadyTimeoutRef.current !== null) {
      window.clearTimeout(walletReadyTimeoutRef.current);
      walletReadyTimeoutRef.current = null;
    }
    if (
      !ready ||
      !authenticated ||
      walletAddress ||
      masterKeySig ||
      view === "error"
    ) {
      return;
    }
    walletReadyTimeoutRef.current = window.setTimeout(() => {
      setError(
        "Wallet initialization timed out. Please reload and sign in again.",
      );
      setView("error");
    }, WALLET_READY_TIMEOUT_MS);
  }, [ready, authenticated, walletAddress, masterKeySig, view]);

  useEffect(() => {
    return () => {
      if (walletReadyTimeoutRef.current !== null) {
        window.clearTimeout(walletReadyTimeoutRef.current);
      }
    };
  }, []);

  // Add signers when authenticated with a wallet
  useEffect(() => {
    if (authenticated && walletAddress) {
      handleAddSigners(walletAddress);
    }
  }, [authenticated, walletAddress, handleAddSigners]);

  // Sign the master key after authentication
  useEffect(() => {
    if (view === "error" || view === "ready") return;
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
          window.setTimeout(() => setView("loading"), 300);
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to sign master key",
        );
        setView("error");
      });
  }, [authenticated, walletAddress, masterKeySig, signMessage, view]);

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
