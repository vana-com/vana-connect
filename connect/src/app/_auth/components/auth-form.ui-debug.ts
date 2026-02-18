// UI debug usage (dev only):
// - Enable: /auth?authDebug=1
// - Enable: /auth?mode=return_to_app&authDebug=1
// - No authDebug => no debug override (real state only).
// - Current forced scenario in this file: "login-idle".

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
  const debug = resolveAuthFormUiDebugConfig();
  if (!debug.enabled) {
    return state;
  }

  const debugState = AUTH_FORM_UI_DEBUG_SCENARIOS[debug.scenario];
  return {
    ...state,
    ...debugState,
  };
};

export function resolveAuthFormUiDebugConfig(): {
  enabled: boolean;
  scenario: AuthFormUiDebugScenario;
} {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
    return { enabled: false, scenario: "login-idle" };
  }

  const search = new URLSearchParams(window.location.search);
  return {
    enabled: search.get("authDebug") === "1",
    scenario: "login-idle",
  };
}
