"use client";

import { useIdentityToken } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { setPrivyIdentityTokenGetter } from "@/lib/auth/vana-fetch";

/**
 * Registers a Privy identity-token getter with the `vanaFetch` helper at
 * mount. Lives at the app root inside the `<PrivyProvider>` so the SDK is
 * available, and runs once per app lifetime.
 *
 * `vanaFetch` is a plain async function — not a hook — so it cannot use
 * `useIdentityToken()` directly. We bridge by registering a getter that
 * reads the most recent token from a ref. The ref is updated on every
 * render of this component, so the getter is always current.
 */
export function VanaFetchRegistration() {
  const { identityToken } = useIdentityToken();
  const tokenRef = useRef<string | null | undefined>(identityToken);
  tokenRef.current = identityToken;

  useEffect(() => {
    setPrivyIdentityTokenGetter(() => tokenRef.current ?? null);
  }, []);

  return null;
}
