"use client";

import {
  useIdentityToken,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
} from "@privy-io/react-auth";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearHandoffContext,
  persistHandoffContext,
  resolvePostAuthDestination,
} from "@/app/_lib/handoff-contract";
import {
  clearOidcReturnTo,
  persistOidcReturnTo,
  resolveOidcReturnTo,
} from "@/app/_lib/oidc-continuation";
import { useHandoffResolution } from "@/app/_lib/use-handoff-resolution";
import { APP_ROUTES } from "@/app/routes";
import { CONNECT_CONFIG } from "@/config/config";
import { resolveLoginPageUiDebugState } from "./use-login-page.ui-debug";

const PASSPORT_AGREEMENT_STORAGE_KEY = "vana_passport_agreement_acceptance";

export type LoginPageView = "loading" | "entry" | "code" | "completing";

/** Views that render the full-page spinner (Preparing... / Signing you in...). */
export const LOGIN_PAGE_SPINNER_VIEWS: readonly LoginPageView[] = [
  "loading",
  "completing",
];

function isOtpVerificationPhase(status: string): boolean {
  return status === "awaiting-code" || status === "submitting-code";
}

function hasOAuthCallbackParams(searchParams: URLSearchParams): boolean {
  const callbackKeys = [
    "code",
    "state",
    "error",
    "error_description",
    "oauth_token",
    "oauth_verifier",
    "id_token",
    "privy_oauth_code",
  ] as const;
  return callbackKeys.some((key) => Boolean(searchParams.get(key)));
}

export function useLoginPage() {
  const searchParams = useSearchParams();
  const hasSessionIdInUrl = Boolean(searchParams.get("sessionId"));
  const isOAuthReturn = hasOAuthCallbackParams(searchParams);
  const handoffResolvedAtRef = useRef(Date.now());
  const { handoffContext, hasClearHandoffFlag } = useHandoffResolution({
    searchParams,
    resolvedAtMs: handoffResolvedAtRef.current,
    restoreFromPersistence: hasSessionIdInUrl || isOAuthReturn,
    clearRedirectPath: APP_ROUTES.login,
    navigate: (href) => {
      window.location.replace(href);
    },
  });
  const { ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { privacyPolicyUrl, termsOfServiceUrl } = CONNECT_CONFIG.legal;

  const [view, setView] = useState<LoginPageView>("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingOAuthProvider, setPendingOAuthProvider] = useState<
    "google" | "apple" | null
  >(null);

  const redirectedRef = useRef(false);
  const oauthInitiatedRef = useRef(false);

  useEffect(() => {
    if (hasClearHandoffFlag) return;
    if (hasSessionIdInUrl || isOAuthReturn) return;
    clearHandoffContext();
  }, [hasClearHandoffFlag, hasSessionIdInUrl, isOAuthReturn]);

  // Persist a safe OIDC `return_to` from the URL so it survives the full-page
  // OAuth redirect. Unsafe values are silently dropped by the seam.
  useEffect(() => {
    persistOidcReturnTo(searchParams.get("return_to"));
  }, [searchParams]);

  // Redirect helper — navigates to OIDC continuation if one is pending,
  // otherwise to connect or fallback based on handoff context.
  // Uses window.location (not Next.js router) because router.replace can
  // silently fail after full-page OAuth redirects.
  const handleLoginComplete = useCallback(async () => {
    if (redirectedRef.current) return;

    const oidcReturnTo = resolveOidcReturnTo(searchParams);
    if (!identityToken) {
      setView("completing");
      return;
    }

    redirectedRef.current = true;
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { authorization: `Bearer ${identityToken}` },
      });
      if (!response.ok) {
        throw new Error("Could not establish account session.");
      }
      clearOidcReturnTo();
      clearHandoffContext();
      window.location.replace(
        oidcReturnTo ?? resolvePostAuthDestination(handoffContext),
      );
    } catch {
      redirectedRef.current = false;
      setError("Could not finish sign-in. Please try again.");
      setView("entry");
    }
  }, [handoffContext, identityToken, searchParams]);

  // Email OTP hooks
  const {
    sendCode: privySendCode,
    loginWithCode: privyLoginWithCode,
    state: emailState,
  } = useLoginWithEmail({
    onComplete: () => {
      setView("completing");
      void handleLoginComplete();
    },
    onError: (err) => {
      setError(
        typeof err === "string" ? err : "Login failed. Please try again.",
      );
      setView("code");
    },
  });

  // OAuth hooks
  const { initOAuth, state: oauthState } = useLoginWithOAuth({
    onComplete: () => {
      setView("completing");
      void handleLoginComplete();
    },
    onError: (err) => {
      setPendingOAuthProvider(null);
      setError(
        typeof err === "string" ? err : "Login failed. Please try again.",
      );
      setView("entry");
    },
  });

  // Persist handoff context to survive auth/OAuth redirects.
  useEffect(() => {
    if (!handoffContext) return;
    persistHandoffContext(handoffContext);
  }, [handoffContext]);

  // If already authenticated on mount, redirect immediately
  useEffect(() => {
    if (!ready) return;
    if (authenticated) {
      void handleLoginComplete();
      return;
    }
    // Privy is ready and user is not authenticated — show entry form
    if (view === "loading") {
      setView(isOtpVerificationPhase(emailState.status) ? "code" : "entry");
    }
  }, [ready, authenticated, view, handleLoginComplete, emailState.status]);

  // Handle OAuth state transitions (covers the auto-processed callback on page load,
  // where the onComplete callback may not fire since the hook instance that called
  // initOAuth no longer exists after the full-page navigation to the OAuth provider).
  // Guard: only react to oauthState after the user has initiated OAuth or when
  // the URL includes OAuth callback markers on return.
  useEffect(() => {
    const isOAuthReturnPath =
      !oauthInitiatedRef.current && hasOAuthCallbackParams(searchParams);
    if (isOAuthReturnPath) {
      if (!handoffContext) return;
    }
    // On the return path, show the completing spinner while Privy processes.
    // On the click path, stay on the entry screen so button-level spinners show.
    if (oauthState.status === "loading" && isOAuthReturnPath) {
      setView("completing");
    }
    if (oauthState.status === "done") {
      setView("completing");
      void handleLoginComplete();
    }
  }, [oauthState.status, handoffContext, handleLoginComplete, searchParams]);

  // Email submit — send OTP
  const handleEmailSubmit = useCallback(async () => {
    setError(null);
    try {
      await privySendCode({ email });
      setCode("");
      setView("code");
    } catch {
      setError("Failed to send code. Please try again.");
    }
  }, [email, privySendCode]);

  // Code submit — verify OTP
  const handleCodeSubmit = useCallback(
    async (codeOverride?: string) => {
      const codeToSubmit = codeOverride ?? code;
      if (!codeToSubmit) return;

      setError(null);
      try {
        await privyLoginWithCode({ code: codeToSubmit });
        // onComplete callback handles redirect
      } catch {
        setError("Invalid code. Please try again.");
        setView("code");
      }
    },
    [code, privyLoginWithCode],
  );

  const handleResendCode = useCallback(async () => {
    setError(null);
    try {
      await privySendCode({ email });
    } catch {
      setError("Failed to send code. Please try again.");
    }
  }, [email, privySendCode]);

  const handleBackToEmail = useCallback(() => {
    setError(null);
    setCode("");
    setView("entry");
  }, []);

  // OAuth handlers
  const handleGoogleLogin = useCallback(() => {
    oauthInitiatedRef.current = true;
    setPendingOAuthProvider("google");
    if (handoffContext) {
      persistHandoffContext(handoffContext);
    }
    initOAuth({ provider: "google" });
  }, [handoffContext, initOAuth]);

  const handleAppleLogin = useCallback(() => {
    oauthInitiatedRef.current = true;
    setPendingOAuthProvider("apple");
    if (handoffContext) {
      persistHandoffContext(handoffContext);
    }
    initOAuth({ provider: "apple" });
  }, [handoffContext, initOAuth]);

  const isSendingEmail = emailState.status === "sending-code";
  const isVerifyingCode = emailState.status === "submitting-code";
  const isOAuthLoading = oauthState.status === "loading";
  const isGoogleLoading = isOAuthLoading && pendingOAuthProvider === "google";
  const isAppleLoading = isOAuthLoading && pendingOAuthProvider === "apple";

  const recordPassportAgreementAcceptance = useCallback(() => {
    try {
      localStorage.setItem(
        PASSPORT_AGREEMENT_STORAGE_KEY,
        JSON.stringify({
          acceptedAt: new Date().toISOString(),
          documents: {
            termsOfService: {
              url: termsOfServiceUrl,
              version: termsOfServiceUrl,
            },
            privacyPolicy: {
              url: privacyPolicyUrl,
              version: privacyPolicyUrl,
            },
          },
        }),
      );
    } catch {
      // localStorage may be unavailable in some browser contexts
    }
  }, [termsOfServiceUrl, privacyPolicyUrl]);

  const ui = resolveLoginPageUiDebugState({
    view,
    error,
    email,
    code,
    isSendingEmail,
    isVerifyingCode,
    isGoogleLoading,
    isAppleLoading,
  });

  return {
    view: ui.view,
    error: ui.error,
    email: ui.email,
    code: ui.code,
    isSendingEmail: ui.isSendingEmail,
    isVerifyingCode: ui.isVerifyingCode,
    isGoogleLoading: ui.isGoogleLoading,
    isAppleLoading: ui.isAppleLoading,
    handleEmailChange: setEmail,
    handleCodeChange: setCode,
    handleEmailSubmit,
    handleCodeSubmit,
    handleResendCode,
    handleBackToEmail,
    handleGoogleLogin,
    handleAppleLogin,
    recordPassportAgreementAcceptance,
  };
}
