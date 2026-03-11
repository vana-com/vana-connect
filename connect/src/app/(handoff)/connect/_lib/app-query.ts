type SearchParamReader = Pick<URLSearchParams, "get">;

export type ConnectAppQuery = {
  appUrl: string | null;
  appName: string | null;
  dataSource: string | null;
  dataScopes: string[];
  requestedDataLabel: string | null;
};

function readNonEmptyString(value: string | null): string | null {
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

function resolveNaturalLanguageJoin(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function resolveScopeProviderLabel(scope: string): string {
  const provider = scope.split(".")[0]?.trim().toLowerCase() ?? "";
  if (!provider) return scope;

  const providerLabels: Record<string, string> = {
    chatgpt: "ChatGPT",
    github: "GitHub",
    linkedin: "LinkedIn",
    oura: "Oura",
    youtube: "YouTube",
  };

  if (provider in providerLabels) {
    return providerLabels[provider];
  }

  return toTitleCaseWords(provider.replace(/[-_]+/g, " "));
}

function resolveDataScopes(searchParams: SearchParamReader): string[] {
  const explicitScope = readNonEmptyString(searchParams.get("scope"));
  const explicitScopes = readNonEmptyString(searchParams.get("scopes"));
  const rawScopes = explicitScope
    ? [explicitScope]
    : explicitScopes
      ? explicitScopes.split(",")
      : [];

  return rawScopes
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function resolveDataScopeProviders(scopes: string[]): string[] {
  const uniqueProviders = new Set<string>();

  for (const scope of scopes) {
    uniqueProviders.add(resolveScopeProviderLabel(scope));
  }

  return Array.from(uniqueProviders);
}

function resolveDataSource(searchParams: SearchParamReader): string | null {
  const explicitDataSource =
    readNonEmptyString(searchParams.get("dataSource")) ??
    readNonEmptyString(searchParams.get("source")) ??
    readNonEmptyString(searchParams.get("provider"));
  if (explicitDataSource) return explicitDataSource;

  const scopes = resolveDataScopes(searchParams);
  const providers = resolveDataScopeProviders(scopes);
  return providers.length === 1 ? providers[0] : null;
}

function resolveRequestedDataLabel(
  searchParams: SearchParamReader,
): string | null {
  const explicitDataSource = resolveDataSource(searchParams);
  if (explicitDataSource) {
    return `${explicitDataSource.replace(/\s+data$/i, "")} data`;
  }

  const scopes = resolveDataScopes(searchParams);
  const providers = resolveDataScopeProviders(scopes);
  if (providers.length === 0) return null;
  return `${resolveNaturalLanguageJoin(providers)} data`;
}

export function resolveConnectAppQuery(
  searchParams: SearchParamReader,
): ConnectAppQuery {
  return {
    appUrl: searchParams.get("appUrl"),
    appName: searchParams.get("appName"),
    dataSource: resolveDataSource(searchParams),
    dataScopes: resolveDataScopes(searchParams),
    requestedDataLabel: resolveRequestedDataLabel(searchParams),
  };
}
