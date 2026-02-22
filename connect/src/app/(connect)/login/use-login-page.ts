"use client";

import {
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
} from "@privy-io/react-auth";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONNECT_CONFIG } from "@/config/config";
import { resolveLoginPageUiDebugState } from "./use-login-page.ui-debug";

const STORAGE_KEY = "vana_connect_session";
const PASSPORT_AGREEMENT_STORAGE_KEY = "vana_passport_agreement_acceptance";

export type LoginPageView = "loading" | "entry" | "code" | "completing";

/** Views that render the full-page spinner (Preparing... / Signing you in...). */
export const LOGIN_PAGE_SPINNER_VIEWS: readonly LoginPageView[] = [
  "loading",
  "completing",
];

type SessionParams = { sessionId: string; secret: string | null };

function saveSession(params: SessionParams) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // localStorage may be unavailable (e.g. incognito in some browsers)
  }
}

function readAndClearSession(): SessionParams | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw) as SessionParams;
  } catch {
    return null;
  }
}

function buildConnectUrl(params: SessionParams): string {
  const qs = new URLSearchParams();
  qs.set("sessionId", params.sessionId);
  if (params.secret) qs.set("secret", params.secret);
  return `/connect?${qs.toString()}`;
}

export function useLoginPage() {
  const searchParams = useSearchParams();
  const { ready, authenticated } = usePrivy();
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

  // Read session params from URL (preferred) or localStorage (OAuth return)
  const sessionId = searchParams.get("sessionId");
  const secret = searchParams.get("secret");

  // Redirect helper — navigates to /connect with session params.
  // Uses window.location (not Next.js router) because router.replace can
  // silently fail after full-page OAuth redirects.
  const handleLoginComplete = useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;

    // Try URL params first, fall back to localStorage (OAuth return case)
    const params: SessionParams | null = sessionId
      ? { sessionId, secret }
      : readAndClearSession();

    const url = params ? buildConnectUrl(params) : "/download-data-connect";
    window.location.replace(url);
  }, [sessionId, secret]);

  // Email OTP hooks
  const {
    sendCode: privySendCode,
    loginWithCode: privyLoginWithCode,
    state: emailState,
  } = useLoginWithEmail({
    onComplete: () => {
      setView("completing");
      handleLoginComplete();
    },
    onError: (err) => {
      setError(
        typeof err === "string" ? err : "Login failed. Please try again.",
      );
      // Stay on current view so user can retry
    },
  });

  // OAuth hooks
  const { initOAuth, state: oauthState } = useLoginWithOAuth({
    onComplete: () => {
      setView("completing");
      handleLoginComplete();
    },
    onError: (err) => {
      setPendingOAuthProvider(null);
      setError(
        typeof err === "string" ? err : "Login failed. Please try again.",
      );
      setView("entry");
    },
  });

  // Persist session params to localStorage on mount
  useEffect(() => {
    if (sessionId) {
      saveSession({ sessionId, secret });
    }
  }, [sessionId, secret]);

  // If already authenticated on mount, redirect immediately
  useEffect(() => {
    if (!ready) return;
    if (authenticated) {
      handleLoginComplete();
      return;
    }
    // Privy is ready and user is not authenticated — show entry form
    if (view === "loading") {
      setView("entry");
    }
  }, [ready, authenticated, view, handleLoginComplete]);

  // Handle OAuth state transitions (covers the auto-processed callback on page load,
  // where the onComplete callback may not fire since the hook instance that called
  // initOAuth no longer exists after the full-page navigation to the OAuth provider).
  // Guard: only react to oauthState after the user has initiated OAuth or when
  // returning from an OAuth redirect (detected via session params in localStorage).
  useEffect(() => {
    const isOAuthReturn = !oauthInitiatedRef.current;
    if (isOAuthReturn) {
      try {
        if (!localStorage.getItem(STORAGE_KEY)) return;
      } catch {
        return;
      }
    }
    // On the return path, show the completing spinner while Privy processes.
    // On the click path, stay on the entry screen so button-level spinners show.
    if (oauthState.status === "loading" && isOAuthReturn) {
      setView("completing");
    }
    if (oauthState.status === "done") {
      setView("completing");
      handleLoginComplete();
    }
  }, [oauthState.status, handleLoginComplete]);

  // Email submit — send OTP
  const handleEmailSubmit = useCallback(async () => {
    setError(null);
    try {
      await privySendCode({ email });
      setView("code");
    } catch {
      setError("Failed to send code. Please try again.");
    }
  }, [email, privySendCode]);

  // Code submit — verify OTP
  const handleCodeSubmit = useCallback(async () => {
    setError(null);
    try {
      await privyLoginWithCode({ code });
      // onComplete callback handles redirect
    } catch {
      setError("Invalid code. Please try again.");
    }
  }, [code, privyLoginWithCode]);

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
    setView("entry");
  }, []);

  // OAuth handlers
  const handleGoogleLogin = useCallback(() => {
    oauthInitiatedRef.current = true;
    setPendingOAuthProvider("google");
    if (sessionId) {
      saveSession({ sessionId, secret });
    }
    initOAuth({ provider: "google" });
  }, [sessionId, secret, initOAuth]);

  const handleAppleLogin = useCallback(() => {
    oauthInitiatedRef.current = true;
    setPendingOAuthProvider("apple");
    if (sessionId) {
      saveSession({ sessionId, secret });
    }
    initOAuth({ provider: "apple" });
  }, [sessionId, secret, initOAuth]);

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
