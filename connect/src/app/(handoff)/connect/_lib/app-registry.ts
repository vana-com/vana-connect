export interface ConnectAppMetadata {
  id: string;
  displayName: string;
  iconUrl?: string;
  iconBg: string;
  iconFg: string;
}

const DEFAULT_APP_ID = "discover-me";

const APP_REGISTRY: Record<string, ConnectAppMetadata> = {
  "discover-me": {
    id: "discover-me",
    displayName: "Discover Me",
    iconBg: "#F28A07",
    iconFg: "#101114",
  },
};

function normalizeAppKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

export function resolveConnectApp(appRef?: string | null): ConnectAppMetadata {
  if (!appRef) {
    return APP_REGISTRY[DEFAULT_APP_ID];
  }

  const normalizedRef = normalizeAppKey(appRef);
  return APP_REGISTRY[normalizedRef] ?? APP_REGISTRY[DEFAULT_APP_ID];
}
