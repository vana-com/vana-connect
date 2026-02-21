import type { RegisteredAdminApp } from "../_lib/admin-apps-storage";

// UI debug usage (dev only):
// - Enable: /admin/apps?appsDebug=1&appsScenario=empty
// - Enable: /admin/apps?appsDebug=1&appsScenario=seven
// - No appsDebug/appsScenario => no debug override (real state only).

type AdminAppsPageUiState = {
  apps: RegisteredAdminApp[];
};

type AdminAppsPageUiDebugScenario = "empty" | "seven";

const ADMIN_APPS_PLACEHOLDER_APPS: RegisteredAdminApp[] = [
  {
    id: "app-1",
    name: "Prompt Gallery",
    url: "https://promptgallery.org",
    createdAt: "2026-02-10T11:00:00.000Z",
  },
  {
    id: "app-2",
    name: "Signal Atlas",
    url: "https://signalatlas.ai",
    createdAt: "2026-02-11T11:00:00.000Z",
  },
  {
    id: "app-3",
    name: "Meme Archive",
    url: "https://meme-archive.app",
    createdAt: "2026-02-12T11:00:00.000Z",
  },
  {
    id: "app-4",
    name: "Dev Compass",
    url: "https://devcompass.dev",
    createdAt: "2026-02-13T11:00:00.000Z",
  },
  {
    id: "app-5",
    name: "Chain Lens",
    url: "https://chainlens.xyz",
    createdAt: "2026-02-14T11:00:00.000Z",
  },
  {
    id: "app-6",
    name: "Creator Map",
    url: "https://creatormap.io",
    createdAt: "2026-02-15T11:00:00.000Z",
  },
  {
    id: "app-7",
    name: "Inbox Replay",
    url: "https://inboxreplay.app",
    createdAt: "2026-02-16T11:00:00.000Z",
  },
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
