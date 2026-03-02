"use client";

import {
  useCreateWallet,
  usePrivy,
  useSigners,
  useSignMessage,
  useWallets,
} from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearHandoffContext,
  persistHandoffContext,
  toDownloadDataConnectUrl,
  toLoginUrl,
} from "@/app/_lib/handoff-contract";
import { useHandoffResolution } from "@/app/_lib/use-handoff-resolution";
import { APP_ROUTES } from "@/app/routes";
import { resolveConnectLaunchUrl } from "./_lib/launch-url";
import { resolveConnectPageUiDebugState } from "./use-connect-page.ui-debug";

const KEY_QUORUM_ID = process.env.NEXT_PUBLIC_KEY_QUORUM_ID ?? "";
const SIGN_MESSAGE_TIMEOUT_MS = 15_000;
const WALLET_READY_TIMEOUT_MS = 10_000;
const IS_DEV = process.env.NODE_ENV === "development";

function resolveConnectErrorMessage(error: unknown): string {
  const fallback = "Failed to sign master key";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) return fallback;

  const normalized = message.toLowerCase();
  const isWalletConnectorIssue =
    normalized.includes("wallet proxy not initialized") ||
    normalized.includes("unable to initialize all expected connectors") ||
    normalized.includes("no embedded or connected wallet found for address") ||
    normalized.includes("while initializing wallet connectors") ||
    normalized.includes("timed out");

  if (isWalletConnectorIssue) {
    return "Wallet connector initialization failed in this browser/session. Please reload and try again. If it still fails, sign out/in and retry from the same handoff link.";
  }

  return message;
}

function isEmbeddedWalletClientType(
  walletClientType: string | undefined,
): boolean {
  return walletClientType === "privy" || walletClientType === "privy-v2";
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
  const hasSessionIdInUrl = Boolean(searchParams.get("sessionId"));
  const handoffResolvedAtRef = useRef(Date.now());
  const { handoffContext } = useHandoffResolution({
    searchParams,
    resolvedAtMs: handoffResolvedAtRef.current,
    restoreFromPersistence: hasSessionIdInUrl,
    clearRedirectPath: "/connect",
    navigate: (href) => {
      router.replace(href);
    },
  });
  const sessionId = handoffContext?.sessionId ?? null;
  const secret = handoffContext?.secret ?? null;

  const { ready, authenticated } = usePrivy();
  const { signMessage } = useSignMessage();
  const { addSigners } = useSigners();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();

  const [view, setView] = useState<ConnectPageView>("loading");
  const [error, setError] = useState<string | null>(null);
  const [masterKeySig, setMasterKeySig] = useState<string | null>(null);

  const signingRef = useRef(false);
  const signersAddedRef = useRef(false);
  const signRetriesRef = useRef(0);
  const walletReadyTimeoutRef = useRef<number | null>(null);
  const createWalletAttemptedRef = useRef(false);
  const [creatingEmbeddedWallet, setCreatingEmbeddedWallet] = useState(false);
  const embeddedWalletAddress = useMemo(() => {
    for (const wallet of wallets) {
      if (!isEmbeddedWalletClientType(wallet.walletClientType)) continue;
      if (typeof wallet.address === "string" && wallet.address.length > 0) {
        return wallet.address;
      }
    }
    return null;
  }, [wallets]);
  const phase: ConnectFlowPhase = useMemo(() => {
    if (!sessionId) return "missing-session";
    if (!ready) return "boot";
    if (!authenticated) return "auth-required";
    if (!walletsReady || creatingEmbeddedWallet) return "wallet-wait";
    if (masterKeySig) return "ready";
    if (!embeddedWalletAddress) return "wallet-wait";
    return "signing-ready";
  }, [
    sessionId,
    ready,
    authenticated,
    walletsReady,
    creatingEmbeddedWallet,
    masterKeySig,
    embeddedWalletAddress,
  ]);

  useEffect(() => {
    if (!authenticated) return;
    if (!IS_DEV) return;
    console.info("[connect] auth state", { authenticated });
  }, [authenticated]);

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
    if (!sessionId && ready && !authenticated) {
      router.replace(APP_ROUTES.login);
      return;
    }
    if (!handoffContext) return;
    if (phase === "auth-required" && view !== "error") {
      router.replace(toLoginUrl(handoffContext));
    }
  }, [sessionId, ready, authenticated, phase, handoffContext, view, router]);

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

  // Add signers when authenticated with a wallet
  useEffect(() => {
    if (authenticated && embeddedWalletAddress) {
      handleAddSigners(embeddedWalletAddress);
    }
  }, [authenticated, embeddedWalletAddress, handleAddSigners]);

  // Ensure a Privy embedded wallet exists for signing.
  useEffect(() => {
    if (!authenticated || !walletsReady) return;
    if (view === "error" || view === "ready") return;
    if (embeddedWalletAddress) return;
    if (createWalletAttemptedRef.current) return;

    createWalletAttemptedRef.current = true;
    setCreatingEmbeddedWallet(true);

    createWallet()
      .catch((err) => {
        const message = String(
          err instanceof Error ? err.message : (err ?? ""),
        ).toLowerCase();
        if (message.includes("already exists")) return;
        setError(resolveConnectErrorMessage(err));
        setView("error");
      })
      .finally(() => {
        setCreatingEmbeddedWallet(false);
      });
  }, [authenticated, walletsReady, view, embeddedWalletAddress, createWallet]);

  // Avoid infinite loading when auth succeeds but wallet never initializes.
  useEffect(() => {
    if (walletReadyTimeoutRef.current !== null) {
      window.clearTimeout(walletReadyTimeoutRef.current);
      walletReadyTimeoutRef.current = null;
    }

    if (view === "error" || view === "ready") return;
    if (phase !== "wallet-wait") return;

    walletReadyTimeoutRef.current = window.setTimeout(() => {
      setError(
        "Wallet initialization timed out. Please reload and sign in again from the same handoff link.",
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

  // Sign the master key after authentication
  useEffect(() => {
    if (view === "error" || view === "ready") return;
    if (phase !== "signing-ready" || signingRef.current) return;

    signingRef.current = true;
    setView("signing");
    const showWalletUIs = signRetriesRef.current > 0;
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      signingRef.current = false;
      setError(
        resolveConnectErrorMessage(
          new Error(
            `Sign request timed out after ${SIGN_MESSAGE_TIMEOUT_MS}ms while initializing wallet connectors.`,
          ),
        ),
      );
      setView("error");
    }, SIGN_MESSAGE_TIMEOUT_MS);

    signMessage(
      { message: "vana-master-key-v1" },
      {
        uiOptions: { showWalletUIs },
        address: embeddedWalletAddress ?? undefined,
      },
    )
      .then(({ signature }) => {
        if (didTimeout) return;
        window.clearTimeout(timeoutId);
        setMasterKeySig(signature);
        setView("ready");
      })
      .catch((err) => {
        if (didTimeout) return;
        window.clearTimeout(timeoutId);
        signingRef.current = false;
        // Retry once — the embedded wallet may not be ready immediately
        if (signRetriesRef.current < 1) {
          signRetriesRef.current += 1;
          if (IS_DEV) {
            console.warn("[connect] signMessage retry with wallet UI enabled");
          }
          window.setTimeout(() => setView("loading"), 300);
          return;
        }
        if (IS_DEV) {
          console.error("[connect] signMessage failed");
        }
        setError(resolveConnectErrorMessage(err));
        setView("error");
      });
  }, [phase, signMessage, view, embeddedWalletAddress]);

  const redirectUri = handoffContext?.redirectUri ?? null;
  const oauthState = handoffContext?.oauthState ?? null;

  const deepLinkUrl = resolveConnectLaunchUrl({
    sessionId,
    secret,
    masterKeySig,
    redirectUri,
    oauthState,
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
    isAuthenticated: ready && authenticated,
    deepLinkUrl: ui.deepLinkUrl,
    appContext: handoffContext
      ? {
          appUrl: handoffContext.appUrl,
          app: handoffContext.app,
          appId: handoffContext.appId,
          appName: handoffContext.appName,
        }
      : null,
    downloadDataConnectHref: toDownloadDataConnectUrl(handoffContext),
  };
}
