// UI debug usage (dev only):
// - Enable: /admin?adminDebug=1&adminScenario=form
// - Enable: /admin?adminDebug=1&adminScenario=loading
// - Enable: /admin?adminDebug=1&adminScenario=result
// - Enable: /admin?adminDebug=1&adminScenario=error
// - No adminDebug/adminScenario => no debug override (real state only).

type AdminState = "form" | "loading" | "result" | "error";

type AdminPageUiState = {
  state: AdminState;
  appUrl: string;
  privateKey: `0x${string}` | "";
  errorMessage: string;
};

type AdminPageUiDebugScenario = "form" | "loading" | "result" | "error";

const ADMIN_PAGE_UI_DEBUG_SCENARIOS: Record<
  AdminPageUiDebugScenario,
  Partial<AdminPageUiState>
> = {
  form: {
    state: "form",
    appUrl: "",
    privateKey: "",
    errorMessage: "",
  },
  loading: {
    state: "loading",
    appUrl: "https://promptgallery.org",
    privateKey: "",
    errorMessage: "",
  },
  result: {
    state: "result",
    appUrl: "https://promptgallery.org",
    privateKey:
      "0x442ada486a9385ebd6e14ecd7a21a96a0d45303cf6f2f9115cab9ea69e47c2fa",
    errorMessage: "",
  },
  error: {
    state: "error",
    appUrl: "https://promptgallery.org",
    privateKey: "",
    errorMessage:
      "A builder is already registered for this URL. A new key pair was generated — try again to register with the new key.",
  },
};

export const resolveAdminPageUiDebugState = (
  state: AdminPageUiState,
): AdminPageUiState => {
  const scenario = resolveAdminDebugScenario();
  if (!scenario) {
    return state;
  }

  const debugState = ADMIN_PAGE_UI_DEBUG_SCENARIOS[scenario];
  return {
    ...state,
    ...debugState,
  };
};

function resolveAdminDebugScenario(): AdminPageUiDebugScenario | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
    return null;
  }

  const search = new URLSearchParams(window.location.search);
  if (search.get("adminDebug") !== "1") {
    return null;
  }
  const raw = search.get("adminScenario");
  return raw === "loading" ||
    raw === "result" ||
    raw === "form" ||
    raw === "error"
    ? raw
    : null;
}
