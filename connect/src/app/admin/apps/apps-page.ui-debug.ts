// UI debug usage (dev only):
// - Enable: /admin/apps?appsDebug=1&appsScenario=empty
// - Enable: /admin/apps?appsDebug=1&appsScenario=seven
// - No appsDebug/appsScenario => no debug override (real state only).

type AdminAppListItem = {
  id: string;
  name: string;
  url: string;
};

type AdminAppsPageUiState = {
  apps: AdminAppListItem[];
};

type AdminAppsPageUiDebugScenario = "empty" | "seven";

const ADMIN_APPS_PLACEHOLDER_APPS: AdminAppListItem[] = [
  { id: "app-1", name: "Prompt Gallery", url: "https://promptgallery.org" },
  { id: "app-2", name: "Signal Atlas", url: "https://signalatlas.ai" },
  { id: "app-3", name: "Meme Archive", url: "https://meme-archive.app" },
  { id: "app-4", name: "Dev Compass", url: "https://devcompass.dev" },
  { id: "app-5", name: "Chain Lens", url: "https://chainlens.xyz" },
  { id: "app-6", name: "Creator Map", url: "https://creatormap.io" },
  { id: "app-7", name: "Inbox Replay", url: "https://inboxreplay.app" },
];

const ADMIN_APPS_PAGE_UI_DEBUG_SCENARIOS: Record<
  AdminAppsPageUiDebugScenario,
  Partial<AdminAppsPageUiState>
> = {
  empty: {
    apps: [],
  },
  seven: {
    apps: ADMIN_APPS_PLACEHOLDER_APPS,
  },
};

export const resolveAdminAppsPageUiDebugState = (
  state: AdminAppsPageUiState,
): AdminAppsPageUiState => {
  const scenario = resolveAdminAppsDebugScenario();
  if (!scenario) {
    return state;
  }

  const debugState = ADMIN_APPS_PAGE_UI_DEBUG_SCENARIOS[scenario];
  return {
    ...state,
    ...debugState,
  };
};

function resolveAdminAppsDebugScenario(): AdminAppsPageUiDebugScenario | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
    return null;
  }

  const search = new URLSearchParams(window.location.search);
  if (search.get("appsDebug") !== "1") {
    return null;
  }
  const raw = search.get("appsScenario");
  return raw === "seven" || raw === "empty" ? raw : null;
}
