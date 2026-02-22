"use client";

import type { LoginPageView } from "./use-login-page";

type LoginPageUiState = {
  view: LoginPageView;
  error: string | null;
  email: string;
  code: string;
  isSendingEmail: boolean;
  isVerifyingCode: boolean;
  isGoogleLoading: boolean;
  isAppleLoading: boolean;
};

type LoginPageUiDebugScenario =
  | "login-idle"
  | "login-email-loading"
  | "login-google-loading"
  | "login-apple-loading"
  | "login-error"
  | "verify-idle"
  | "verify-loading"
  | "verify-error"
  | "loading"
  | "completing";

/**
 * UI debug scenarios for development. Add to the login URL:
 *
 *   ?authDebug=1&scenario=<scenario>
 *
 * Examples:
 *   ?authDebug=1&scenario=login-idle          → email entry, filled
 *   ?authDebug=1&scenario=login-email-loading → email entry, sending
 *   ?authDebug=1&scenario=login-google-loading
 *   ?authDebug=1&scenario=login-apple-loading
 *   ?authDebug=1&scenario=login-error         → email entry, error state
 *   ?authDebug=1&scenario=verify-idle         → code verification, filled
 *   ?authDebug=1&scenario=verify-loading      → code verification, verifying
 *   ?authDebug=1&scenario=verify-error        → code verification, error state
 *   ?authDebug=1&scenario=loading             → preparing spinner
 *   ?authDebug=1&scenario=completing          → signing in spinner
 *
 * Disabled in production.
 */
const LOGIN_PAGE_UI_DEBUG_SCENARIOS: Record<
  LoginPageUiDebugScenario,
  Partial<LoginPageUiState>
> = {
  "login-idle": {
    view: "email",
    email: "jane@example.com",
  },
  "login-email-loading": {
    view: "email",
    email: "jane@example.com",
    isSendingEmail: true,
  },
  "login-google-loading": {
    view: "email",
    email: "jane@example.com",
    isGoogleLoading: true,
  },
  "login-apple-loading": {
    view: "email",
    email: "jane@example.com",
    isAppleLoading: true,
  },
  "login-error": {
    view: "email",
    email: "jane@example.com",
    error: "Unable to sign in. Please try again.",
  },
  "verify-idle": {
    view: "code",
    code: "123456",
  },
  "verify-loading": {
    view: "code",
    code: "123456",
    isVerifyingCode: true,
  },
  "verify-error": {
    view: "code",
    code: "123456",
    error: "Invalid code. Please try again.",
  },
  loading: {
    view: "loading",
  },
  completing: {
    view: "completing",
  },
};

function isLoginPageUiDebugScenario(
  value: string | null,
): value is LoginPageUiDebugScenario {
  return value !== null && value in LOGIN_PAGE_UI_DEBUG_SCENARIOS;
}

function resolveLoginPageUiDebugConfig(): {
  enabled: boolean;
  scenario: LoginPageUiDebugScenario;
} {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
    return { enabled: false, scenario: "login-idle" };
  }

  const search = new URLSearchParams(window.location.search);
  const scenario = search.get("scenario");

  return {
    enabled: search.get("authDebug") === "1",
    scenario: isLoginPageUiDebugScenario(scenario) ? scenario : "login-idle",
  };
}

export function resolveLoginPageUiDebugState(
  state: LoginPageUiState,
): LoginPageUiState {
  const debug = resolveLoginPageUiDebugConfig();
  if (!debug.enabled) return state;
  return {
    ...state,
    ...LOGIN_PAGE_UI_DEBUG_SCENARIOS[debug.scenario],
  };
}
