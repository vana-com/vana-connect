"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { resolvePrivyPublicEnv } from "@/config/privy-env";

/**
 * Wraps the app in `<PrivyProvider>`.
 *
 * Resolving env via {@link resolvePrivyPublicEnv} (instead of inlining
 * `process.env.X!`) gives us:
 *  - a Vana-owned error message when env is missing/invalid, surfaced before
 *    the Privy SDK can throw an opaque vendor error during prerender, and
 *  - explicit rejection of empty / placeholder values that pass `!` checks
 *    but break PrivyProvider at runtime.
 *
 * We deliberately fail loudly on bad env in production so a misconfigured
 * deploy (the original Vercel symptom) shows up as a clear Vana error, not a
 * silent "auth disabled" page that would still render protected UI.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const env = resolvePrivyPublicEnv();

  if (env.status !== "ok") {
    throw new Error(env.reason);
  }

  return (
    <PrivyProvider
      appId={env.appId}
      clientId={env.clientId}
      config={{
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
