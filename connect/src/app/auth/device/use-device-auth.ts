"use client";

import {
  useCreateWallet,
  usePrivy,
  useSignMessage,
  useWallets,
} from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";

const MASTER_KEY_MESSAGE = "vana-master-key-v1";

export type DeviceAuthStatus =
  | "idle"
  | "signing"
  | "approving"
  | "approved"
  | "error";

export function useDeviceAuth() {
  const { ready, authenticated, login } = usePrivy();
  const { signMessage } = useSignMessage();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const [status, setStatus] = useState<DeviceAuthStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const walletBootstrapRef = useRef(false);

  const isReady = ready && walletsReady;
  const isLoggedIn = ready && authenticated;

  const embeddedWallet = wallets.find(
    (w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2",
  );

  useEffect(() => {
    if (
      !isLoggedIn ||
      !walletsReady ||
      embeddedWallet ||
      walletBootstrapRef.current
    ) {
      return;
    }

    walletBootstrapRef.current = true;
    createWallet().catch(() => {
      // Wallet may already exist — ignore.
    });
  }, [isLoggedIn, walletsReady, embeddedWallet, createWallet]);

  const approve = useCallback(
    async (userCode: string) => {
      if (!embeddedWallet) {
        setError("Preparing your wallet. Please try again in a moment.");
        createWallet().catch(() => {});
        return;
      }

      setStatus("signing");
      setError(null);

      try {
        const { signature } = await signMessage(
          { message: MASTER_KEY_MESSAGE },
          {
            address: embeddedWallet.address as `0x${string}`,
            uiOptions: { showWalletUIs: false },
          },
        );

        setStatus("approving");

        const resp = await fetch("/api/auth/device/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_code: userCode,
            masterKeySignature: signature,
          }),
        });

        const data = await resp.json();

        if (!resp.ok) {
          setError(data.error?.message ?? "Failed to approve device");
          setStatus("error");
          return;
        }

        setStatus("approved");
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setStatus("error");
      }
    },
    [createWallet, embeddedWallet, signMessage],
  );

  return {
    isReady,
    isLoggedIn,
    status,
    error,
    approve,
    login,
    walletAddress: embeddedWallet?.address ?? null,
  };
}
