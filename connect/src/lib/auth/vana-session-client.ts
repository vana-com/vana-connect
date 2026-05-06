"use client";

/**
 * Client-side helper to keep the Vana session cookie populated on any page
 * that issues authenticated requests.
 *
 * `getVanaSession` (the server-side verifier) accepts the `vana_session`
 * cookie on read-only methods, but rejects cookie-only auth on POST/PUT/
 * PATCH/DELETE — those mutations must send `Authorization: Bearer
 * <vana_access>`. The `vana_access` cookie is the JS-readable companion
 * issued by `/api/auth/session` at login.
 *
 * Pages reached via direct navigation (Hydra redirects, deep links) may not
 * have hit `/login` since this domain's session cookies were last cleared.
 * This hook detects that case (Privy is authenticated but `vana_access` is
 * missing), POSTs the Privy id_token to `/api/auth/session`, and surfaces
 * the bootstrap status to the caller so UI can gate buttons until the
 * cookie is ready.
 *
 * Use this hook on any page that performs authenticated mutations against
 * account.vana.org. Use `vanaAuthHeaders()` to attach the Bearer header.
 */

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { readVanaAccessCookie } from "@/components/auth/use-confirmation";

export type VanaSessionStatus =
  | "unknown" // Privy state not yet ready
  | "anonymous" // Privy reports not signed in
  | "bootstrapping" // bootstrap POST in flight
  | "ready" // vana_access cookie is set; safe to mutate
  | "missing"; // bootstrap failed (e.g. cookies blocked, BFF error)

export function useVanaSessionBootstrap(): {
  status: VanaSessionStatus;
  error: string | null;
} {
  const { ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [status, setStatus] = useState<VanaSessionStatus>("unknown");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) {
      setStatus("unknown");
      return;
    }
    if (!authenticated) {
      setStatus("anonymous");
      return;
    }
    if (readVanaAccessCookie()) {
      setStatus("ready");
      return;
    }
    if (!identityToken) {
      setStatus("bootstrapping");
      return;
    }
    let cancelled = false;
    setStatus("bootstrapping");
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { authorization: `Bearer ${identityToken}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          setStatus("missing");
          setError(
            "Could not establish Vana session. Please sign in again from /login.",
          );
          return;
        }
        if (readVanaAccessCookie()) {
          setStatus("ready");
        } else {
          setStatus("missing");
          setError(
            "Vana session cookie was not stored. Check your browser's third-party-cookie settings.",
          );
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("missing");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, identityToken]);

  return { status, error };
}

/**
 * Build an `Authorization: Bearer <vana_access>` header for state-mutating
 * fetches. Returns an empty record if the cookie is absent — callers should
 * gate the mutation on `useVanaSessionBootstrap()` returning `ready` first.
 */
export function vanaAuthHeaders(): Record<string, string> {
  const tok = readVanaAccessCookie();
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}
