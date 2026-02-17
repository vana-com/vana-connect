type AuthFormView = "login" | "loading" | "success";

type AuthFormUiState = {
  view: AuthFormView;
  loadingText: string;
  error: string | null;
  email: string;
  code: string;
  showCode: boolean;
  isSendingEmail: boolean;
  isVerifyingCode: boolean;
  isGoogleLoading: boolean;
  isAppleLoading: boolean;
};

type AuthFormUiDebugScenario =
  | "login-idle"
  | "login-email-loading"
  | "login-google-loading"
  | "login-apple-loading"
  | "login-error"
  | "verify-idle"
  | "verify-loading"
  | "loading"
  | "success";

// Dev-only UI debug toggle.
// Usage:
// - /auth?authDebug=1
// - /auth?mode=return_to_app&authDebug=1
// Scenario is set below via `scenario`.
// NB!
// - `mode=continue_to_grants` = default web behavior,
// - `mode=return_to_app` = desktop-handoff behavior
export const AUTH_FORM_UI_DEBUG: {
  enabled: boolean;
  scenario: AuthFormUiDebugScenario;
} = {
  enabled:
    process.env.NODE_ENV !== "production" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("authDebug") === "1",
  scenario: "login-idle",
};

const AUTH_FORM_UI_DEBUG_SCENARIOS: Record<
  AuthFormUiDebugScenario,
  Partial<AuthFormUiState>
> = {
  "login-idle": {
    view: "login",
    email: "jane@example.com",
    showCode: false,
  },
  "login-email-loading": {
    view: "login",
    email: "jane@example.com",
    showCode: false,
    isSendingEmail: true,
  },
  "login-google-loading": {
    view: "login",
    email: "jane@example.com",
    showCode: false,
    isGoogleLoading: true,
  },
  "login-apple-loading": {
    view: "login",
    email: "jane@example.com",
    showCode: false,
    isAppleLoading: true,
  },
  "login-error": {
    view: "login",
    email: "jane@example.com",
    showCode: false,
    error: "Unable to send sign-in code. Please try again.",
  },
  "verify-idle": {
    view: "login",
    showCode: true,
    code: "123456",
  },
  "verify-loading": {
    view: "login",
    showCode: true,
    code: "123456",
    isVerifyingCode: true,
  },
  loading: {
    view: "loading",
    loadingText: "Preparing…",
  },
  success: {
    view: "success",
  },
};

export const resolveAuthFormUiDebugState = (
  state: AuthFormUiState,
): AuthFormUiState => {
  if (!AUTH_FORM_UI_DEBUG.enabled) {
    return state;
  }

  const debugState = AUTH_FORM_UI_DEBUG_SCENARIOS[AUTH_FORM_UI_DEBUG.scenario];
  return {
    ...state,
    ...debugState,
  };
};
