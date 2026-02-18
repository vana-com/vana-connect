type AdminState = "form" | "loading" | "result";

type AdminPageUiState = {
  state: AdminState;
  appUrl: string;
  privateKey: `0x${string}` | "";
};

type AdminPageUiDebugScenario = "form" | "loading" | "result";

export const ADMIN_PAGE_UI_DEBUG: {
  enabled: boolean;
  scenario: AdminPageUiDebugScenario;
} = {
  enabled:
    process.env.NODE_ENV !== "production" &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("adminDebug") === "1",
  scenario: resolveAdminDebugScenario(),
};

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
  if (!ADMIN_PAGE_UI_DEBUG.enabled) {
    return state;
  }

  const debugState =
    ADMIN_PAGE_UI_DEBUG_SCENARIOS[ADMIN_PAGE_UI_DEBUG.scenario];
  return {
    ...state,
    ...debugState,
  };
};

function resolveAdminDebugScenario(): AdminPageUiDebugScenario {
  if (typeof window === "undefined") {
    return "form";
  }

  const raw = new URLSearchParams(window.location.search).get("adminScenario");
  return raw === "loading" || raw === "result" || raw === "form" ? raw : "form";
}
