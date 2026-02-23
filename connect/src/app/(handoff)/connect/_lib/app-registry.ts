export interface ConnectAppMetadata {
  displayName: string;
  iconUrls: string[];
  fallbackLabel: string;
  iconBg: string;
  iconFg: string;
}

type ResolveConnectAppOptions = {
  appUrl?: string | null;
  appName?: string | null;
};

const DEFAULT_DISPLAY_NAME = "App";
const DEFAULT_FALLBACK_LABEL = "A";
const DEFAULT_ICON_BG = "#E8EBF0";
const DEFAULT_ICON_FG = "#101114";

function readNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toTitleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveDisplayNameFromAppUrl(appUrl: string | null): string | null {
  if (!appUrl) return null;
  try {
    const hostname = new URL(appUrl).hostname.replace(/^www\./i, "");
    if (!hostname) return null;
    const labels = hostname.split(".").filter(Boolean);
    if (labels.length === 0) return null;
    const primaryLabel =
      labels.length >= 2 ? labels[labels.length - 2] : labels[0];
    const words = primaryLabel.replace(/[-_]+/g, " ").trim();
    if (!words) return null;
    return toTitleCaseWords(words);
  } catch {
    return null;
  }
}

function deriveIconUrls(appUrl: string | null): string[] {
  if (!appUrl) return [];
  try {
    return ["/icon.svg", "/icon.png", "/favicon.ico"].map((path) =>
      new URL(path, appUrl).toString(),
    );
  } catch {
    return [];
  }
}

function resolveFallbackLabel(displayName: string): string {
  const firstAlphaNumeric = displayName.match(/[A-Za-z0-9]/)?.[0];
  return firstAlphaNumeric
    ? firstAlphaNumeric.toUpperCase()
    : DEFAULT_FALLBACK_LABEL;
}

export function resolveConnectApp(
  options: ResolveConnectAppOptions = {},
): ConnectAppMetadata {
  const appUrl = readNonEmptyString(options.appUrl);
  const appName = readNonEmptyString(options.appName);
  const displayName =
    appName ?? deriveDisplayNameFromAppUrl(appUrl) ?? DEFAULT_DISPLAY_NAME;
  return {
    displayName,
    iconUrls: deriveIconUrls(appUrl),
    fallbackLabel: resolveFallbackLabel(displayName),
    iconBg: DEFAULT_ICON_BG,
    iconFg: DEFAULT_ICON_FG,
  };
}
