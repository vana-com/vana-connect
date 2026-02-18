// UI debug usage (dev only):
// - Enable: /admin?adminDebug=1&adminScenario=form
// - Enable: /admin?adminDebug=1&adminScenario=loading
// - Enable: /admin?adminDebug=1&adminScenario=result
// - No adminDebug/adminScenario => no debug override (real state only).

type AdminState = "form" | "loading" | "result";

type AdminPageUiState = {
  state: AdminState;
  appUrl: string;
  privateKey: `0x${string}` | "";
};

type AdminPageUiDebugScenario = "form" | "loading" | "result";

const ADMIN_PAGE_UI_DEBUG_SCENARIOS: Record<
  AdminPageUiDebugScenario,
  Partial<AdminPageUiState>
> = {
  form: {
    state: "form",
    appUrl: "",
    privateKey: "",
  },
  loading: {
    state: "loading",
    appUrl: "https://promptgallery.org",
    privateKey: "",
  },
  result: {
    state: "result",
    appUrl: "https://promptgallery.org",
    privateKey:
      "0x442ada486a9385ebd6e14ecd7a21a96a0d45303cf6f2f9115cab9ea69e47c2fa",
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
  return raw === "loading" || raw === "result" || raw === "form" ? raw : null;
}
