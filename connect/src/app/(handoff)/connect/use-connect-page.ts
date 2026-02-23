"use client";

import { usePrivy, useSigners, useSignMessage } from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearHandoffContext,
  persistHandoffContext,
  resolveHandoffContextFromClient,
  toDownloadDataConnectUrl,
  toLoginUrl,
} from "@/app/_lib/handoff-contract";
import { resolveConnectLaunchUrl } from "./_lib/launch-url";
import { resolveConnectPageUiDebugState } from "./use-connect-page.ui-debug";

const KEY_QUORUM_ID = process.env.NEXT_PUBLIC_KEY_QUORUM_ID ?? "";
const WALLET_READY_TIMEOUT_MS = 10_000;

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
type ConnectFlowPhase =
  | "missing-session"
  | "boot"
  | "auth-required"
  | "wallet-wait"
  | "signing-ready"
  | "ready";

export function useConnectPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const handoffResolvedAtRef = useRef(Date.now());
  const handoffContext = useMemo(
    () =>
      resolveHandoffContextFromClient(
        searchParams,
        handoffResolvedAtRef.current,
      ),
    [searchParams],
  );
  const sessionId = handoffContext?.sessionId ?? null;
  const secret = handoffContext?.secret ?? null;

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
  const phase: ConnectFlowPhase = useMemo(() => {
    if (!sessionId) return "missing-session";
    if (!ready) return "boot";
    if (!authenticated) return "auth-required";
    if (masterKeySig) return "ready";
    if (!walletAddress) return "wallet-wait";
    return "signing-ready";
  }, [sessionId, ready, authenticated, masterKeySig, walletAddress]);

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
    if (!handoffContext) return;
    if (phase === "auth-required" && view !== "error") {
      router.replace(toLoginUrl(handoffContext));
    }
  }, [phase, handoffContext, view, router]);

  // Persist handoff context in case auth redirects lose query params.
  useEffect(() => {
    if (!handoffContext) return;
    persistHandoffContext(handoffContext);
  }, [handoffContext]);

  // Clear stored handoff context once connect is fully ready.
  useEffect(() => {
    if (view !== "ready") return;
    clearHandoffContext();
  }, [view]);

  // Avoid infinite "Preparing..." if auth is true but wallet never appears.
  useEffect(() => {
    if (walletReadyTimeoutRef.current !== null) {
      window.clearTimeout(walletReadyTimeoutRef.current);
      walletReadyTimeoutRef.current = null;
    }
    if (phase !== "wallet-wait" || view === "error") {
      return;
    }
    walletReadyTimeoutRef.current = window.setTimeout(() => {
      setError(
        "Wallet initialization timed out. Please reload and sign in again.",
      );
      setView("error");
    }, WALLET_READY_TIMEOUT_MS);
  }, [phase, view]);

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
    if (phase !== "signing-ready" || signingRef.current) return;

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
  }, [phase, signMessage, view]);

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
    appContext: handoffContext
      ? {
          app: handoffContext.app,
          appId: handoffContext.appId,
          appName: handoffContext.appName,
        }
      : null,
    downloadDataConnectHref: toDownloadDataConnectUrl(handoffContext),
  };
}
