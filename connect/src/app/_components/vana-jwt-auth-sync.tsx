"use client";

import { useSyncJwtBasedAuthState } from "@privy-io/react-auth";
import { useCallback } from "react";

export const VANA_ACCOUNT_SESSION_CHANGED_EVENT =
  "vana-account-session-changed";

const JWT_ENDPOINT = "/api/auth/privy-custom-auth-jwt";

async function getExternalJwt(): Promise<string | undefined> {
  try {
    const response = await fetch(JWT_ENDPOINT, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return undefined;

    const body = (await response.json()) as { token?: unknown };
    return typeof body.token === "string" && body.token
      ? body.token
      : undefined;
  } catch {
    return undefined;
  }
}

export function VanaJwtAuthSync() {
  const subscribe = useCallback((onJwtAuthStateChange: () => void) => {
    const onVisible = () => {
      if (document.visibilityState === "visible") onJwtAuthStateChange();
    };

    window.addEventListener("focus", onJwtAuthStateChange);
    window.addEventListener(
      VANA_ACCOUNT_SESSION_CHANGED_EVENT,
      onJwtAuthStateChange,
    );
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", onJwtAuthStateChange);
      window.removeEventListener(
        VANA_ACCOUNT_SESSION_CHANGED_EVENT,
        onJwtAuthStateChange,
      );
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useSyncJwtBasedAuthState({
    enabled: process.env.NEXT_PUBLIC_PRIVY_JWT_AUTH_SYNC_ENABLED === "true",
    getExternalJwt,
    subscribe,
  });

  return null;
}
