import type { ConnectPageView } from "./use-connect-page";

// Connect page UI debug (development only):
// - Panel UI is rendered separately in development
// - URL: /connect?authDebug=1&scenario=<name>
// - Scenarios:
//   - missing-session — no sessionId; shows ConnectMissingSessionState (logged out) or ConnectNoSessionFallbackState (logged in). To hit the fallback: you must be logged in, then visit: /connect?authDebug=1&scenario=missing-session
//   - loading (also used when signing)
//   - ready
//   - error
// - Production build ignores the panel and all debug query params.
//
// Why this exists:
// - Lets you iterate on UI/IX state-by-state without running the full auth/signing flow.

type ConnectPageUiState = {
  view: ConnectPageView;
  error: string | null;
  sessionId: string | null;
  deepLinkUrl: string | null;
};

export const CONNECT_PAGE_UI_DEBUG_SCENARIO_VALUES = [
  "missing-session",
  "loading",
  "ready",
  "error",
] as const;

type ConnectPageUiDebugScenario =
  (typeof CONNECT_PAGE_UI_DEBUG_SCENARIO_VALUES)[number];

type SearchParamReader = {
  get(name: string): string | null;
};

const CONNECT_PAGE_UI_DEBUG_SCENARIOS: Record<
  ConnectPageUiDebugScenario,
  Partial<ConnectPageUiState>
> = {
  "missing-session": {
    sessionId: null,
    deepLinkUrl: null,
    view: "loading",
  },
  loading: {
    sessionId: "sess-debug",
    deepLinkUrl: null,
    view: "loading",
  },
  ready: {
    sessionId: "sess-debug",
    deepLinkUrl:
      "vana://connect?sessionId=sess-debug&secret=sec-debug&masterKeySig=0xdebug",
    view: "ready",
  },
  error: {
    sessionId: "sess-debug",
    deepLinkUrl: null,
    view: "error",
    error: "Failed to sign master key. Please try again.",
  },
};

function isConnectPageUiDebugScenario(
  value: string | null,
): value is ConnectPageUiDebugScenario {
  return value !== null && value in CONNECT_PAGE_UI_DEBUG_SCENARIOS;
}

export function resolveConnectPageUiDebugConfig(
  searchParams: SearchParamReader,
): {
  enabled: boolean;
  scenario: ConnectPageUiDebugScenario | null;
} {
  if (process.env.NODE_ENV === "production") {
    return { enabled: false, scenario: null };
  }
  const scenario = searchParams.get("scenario");
  const resolvedScenario = isConnectPageUiDebugScenario(scenario)
    ? scenario
    : null;

  return {
    enabled: searchParams.get("authDebug") === "1",
    scenario: resolvedScenario,
  };
}

export function resolveConnectPageUiDebugState(
  state: ConnectPageUiState,
  debug: ReturnType<typeof resolveConnectPageUiDebugConfig>,
): ConnectPageUiState {
  if (!debug.enabled) return state;
  if (!debug.scenario) return state;
  return {
    ...state,
    ...CONNECT_PAGE_UI_DEBUG_SCENARIOS[debug.scenario],
  };
}
