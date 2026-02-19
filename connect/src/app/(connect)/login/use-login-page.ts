"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePrivy,
  useLoginWithEmail,
  useLoginWithOAuth,
} from "@privy-io/react-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { CONNECT_CONFIG } from "@/config/config";
import { resolveLoginPageUiDebugState } from "./use-login-page.ui-debug";

const STORAGE_KEY = "vana_connect_session";
const PASSPORT_AGREEMENT_STORAGE_KEY = "vana_passport_agreement_acceptance";

export type LoginPageView = "loading" | "email" | "code" | "completing";

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
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { privacyPolicyUrl, termsOfServiceUrl } = CONNECT_CONFIG.legal;

  const [view, setView] = useState<LoginPageView>("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const redirectedRef = useRef(false);

  // Read session params from URL (preferred) or localStorage (OAuth return)
  const sessionId = searchParams.get("sessionId");
  const secret = searchParams.get("secret");

  // Redirect helper — navigates to /connect with session params
  const handleLoginComplete = useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;

    // Try URL params first, fall back to localStorage (OAuth return case)
    const params: SessionParams | null = sessionId
      ? { sessionId, secret }
      : readAndClearSession();

    if (params) {
      router.replace(buildConnectUrl(params));
    } else {
      // No session params found — go to /connect without them (will show error)
      router.replace("/connect");
    }
  }, [sessionId, secret, router]);

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
      setError(
        typeof err === "string" ? err : "Login failed. Please try again.",
      );
      setView("email");
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
    // Privy is ready and user is not authenticated — show email form
    if (view === "loading") {
      setView("email");
    }
  }, [ready, authenticated, view, handleLoginComplete]);

  // Handle OAuth state transitions (covers the auto-processed callback on page load,
  // where the onComplete callback may not fire since the hook instance that called
  // initOAuth no longer exists after the full-page navigation to the OAuth provider).
  useEffect(() => {
    if (oauthState.status === "loading") {
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

  // OAuth handlers
  const handleGoogleLogin = useCallback(() => {
    // Belt-and-suspenders: save session before navigating away
    if (sessionId) {
      saveSession({ sessionId, secret });
    }
    initOAuth({ provider: "google" });
  }, [sessionId, secret, initOAuth]);

  const handleAppleLogin = useCallback(() => {
    if (sessionId) {
      saveSession({ sessionId, secret });
    }
    initOAuth({ provider: "apple" });
  }, [sessionId, secret, initOAuth]);

  const isSendingEmail = emailState.status === "sending-code";
  const isVerifyingCode = emailState.status === "submitting-code";
  const isGoogleLoading = oauthState.status === "loading";
  const isAppleLoading = oauthState.status === "loading";

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
    handleGoogleLogin,
    handleAppleLogin,
    recordPassportAgreementAcceptance,
  };
}
