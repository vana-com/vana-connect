import { APP_ROUTES } from "@/app/routes";

export const HANDOFF_COOKIE_KEY = "vana_connect_handoff";
export const HANDOFF_STORAGE_KEY = "vana_connect_session";
export const HANDOFF_RETURN_TO_DEFAULT = APP_ROUTES.connect;
export const HANDOFF_CONTEXT_VERSION = 1;
export const HANDOFF_CONTEXT_TTL_MS = 10 * 60 * 1000;
export const HANDOFF_SOURCE_PRECEDENCE = ["url", "cookie", "storage"] as const;
export const HANDOFF_URL_PARAM_KEYS = [
  "sessionId",
  "secret",
  "app",
  "appId",
  "appName",
] as const;

export type HandoffSource = (typeof HANDOFF_SOURCE_PRECEDENCE)[number];

/**
 * Serialized handoff payload used to continue launch context through auth transitions.
 *
 * `version`: schema version for parser compatibility.
 * `createdAt`: unix timestamp (ms) used for TTL expiry checks.
 * `returnTo`: validated internal path used as default post-auth destination.
 */
export type ConnectHandoffContext = {
  version: typeof HANDOFF_CONTEXT_VERSION;
  sessionId: string;
  secret: string | null;
  app: string | null;
  appId: string | null;
  appName: string | null;
  returnTo: string;
  createdAt: number;
};
type SearchParamReader = {
  get(name: string): string | null;
};

type LegacyStoragePayload = {
  sessionId?: unknown;
  secret?: unknown;
};
type NormalizableInput = {
  sessionId: unknown;
  secret: unknown;
  app: unknown;
  appId: unknown;
  appName: unknown;
  returnTo: unknown;
  createdAt: unknown;
};
type CookieHandoffPayload = Omit<ConnectHandoffContext, "secret"> & {
  secret: null;
};

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeReturnTo(value: unknown): string {
  const path = readNonEmptyString(value);
  if (!path || !path.startsWith("/")) {
    return HANDOFF_RETURN_TO_DEFAULT;
  }
  return path;
}

function coerceCreatedAt(value: unknown, now: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return now;
  }
  return value;
}

function normalizeContext(
  input: NormalizableInput,
  now: number,
): ConnectHandoffContext | null {
  const sessionId = readNonEmptyString(input.sessionId);
  if (!sessionId) return null;

  const secret = readNonEmptyString(input.secret);
  const app = readNonEmptyString(input.app);
  const appId = readNonEmptyString(input.appId);
  const appName = readNonEmptyString(input.appName);

  return {
    version: HANDOFF_CONTEXT_VERSION,
    sessionId,
    secret,
    app,
    appId,
    appName,
    returnTo: normalizeReturnTo(input.returnTo),
    createdAt: coerceCreatedAt(input.createdAt, now),
  };
}

export function parseFromSearchParams(
  searchParams: SearchParamReader,
  now = Date.now(),
): ConnectHandoffContext | null {
  return normalizeContext(
    {
      sessionId: searchParams.get("sessionId"),
      secret: searchParams.get("secret"),
      app: searchParams.get("app"),
      appId: searchParams.get("appId"),
      appName: searchParams.get("appName"),
      returnTo: searchParams.get("returnTo"),
      createdAt: now,
    },
    now,
  );
}

function parseContextJsonPayload(
  rawPayload: string,
  now: number,
): ConnectHandoffContext | null {
  try {
    const parsed = JSON.parse(rawPayload) as Record<string, unknown>;
    return normalizeContext(
      {
        sessionId: parsed.sessionId,
        secret: parsed.secret,
        app: parsed.app,
        appId: parsed.appId,
        appName: parsed.appName,
        returnTo: parsed.returnTo,
        createdAt: parsed.createdAt,
      },
      now,
    );
  } catch {
    return null;
  }
}

function parseCookieMap(cookieHeader: string): Map<string, string> {
  const map = new Map<string, string>();
  const segments = cookieHeader.split(";");

  for (const segment of segments) {
    const raw = segment.trim();
    if (!raw) continue;
    const separatorIndex = raw.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = raw.slice(0, separatorIndex).trim();
    const value = raw.slice(separatorIndex + 1).trim();
    map.set(key, value);
  }

  return map;
}

export function parseFromCookie(
  cookieHeader: string | null | undefined,
  now = Date.now(),
): ConnectHandoffContext | null {
  if (!cookieHeader) return null;

  const cookieMap = parseCookieMap(cookieHeader);
  const encodedPayload = cookieMap.get(HANDOFF_COOKIE_KEY);
  if (!encodedPayload) return null;

  try {
    return parseContextJsonPayload(decodeURIComponent(encodedPayload), now);
  } catch {
    return null;
  }
}

export function parseFromStorage(
  rawStorageValue: string | null,
  now = Date.now(),
): ConnectHandoffContext | null {
  if (!rawStorageValue) return null;

  try {
    const parsed = JSON.parse(rawStorageValue) as
      | Partial<ConnectHandoffContext>
      | LegacyStoragePayload;
    if (
      "version" in parsed ||
      "returnTo" in parsed ||
      "createdAt" in parsed ||
      "app" in parsed ||
      "appId" in parsed ||
      "appName" in parsed
    ) {
      const record = parsed as Record<string, unknown>;
      return normalizeContext(
        {
          sessionId: record.sessionId,
          secret: record.secret,
          app: record.app,
          appId: record.appId,
          appName: record.appName,
          returnTo: record.returnTo,
          createdAt: record.createdAt,
        },
        now,
      );
    }

    return normalizeContext(
      {
        sessionId: parsed.sessionId,
        secret: parsed.secret ?? null,
        app: null,
        appId: null,
        appName: null,
        returnTo: HANDOFF_RETURN_TO_DEFAULT,
        createdAt: now,
      },
      now,
    );
  } catch {
    return null;
  }
}

export function isValidHandoffContext(
  context: ConnectHandoffContext | null | undefined,
): context is ConnectHandoffContext {
  if (!context) return false;
  if (context.version !== HANDOFF_CONTEXT_VERSION) return false;
  if (!readNonEmptyString(context.sessionId)) return false;
  if (context.secret !== null && typeof context.secret !== "string")
    return false;
  if (!context.returnTo.startsWith("/")) return false;
  if (!Number.isFinite(context.createdAt) || context.createdAt <= 0)
    return false;
  return true;
}

export function isExpiredHandoffContext(
  context: ConnectHandoffContext,
  now = Date.now(),
  ttlMs = HANDOFF_CONTEXT_TTL_MS,
): boolean {
  return now - context.createdAt > ttlMs;
}

export function toConnectUrl(context: ConnectHandoffContext): string {
  const params = createHandoffQueryParams(context);
  return `${APP_ROUTES.connect}?${params.toString()}`;
}

export function toLoginUrl(context: ConnectHandoffContext): string {
  const params = createHandoffQueryParams(context);
  return `${APP_ROUTES.login}?${params.toString()}`;
}

export function toDownloadDataConnectUrl(
  context: ConnectHandoffContext | null,
): string {
  if (!context) return APP_ROUTES.downloadDataConnect;
  const params = createHandoffQueryParams(context);
  return `${APP_ROUTES.downloadDataConnect}?${params.toString()}`;
}

export function serializeHandoffContext(
  context: ConnectHandoffContext,
): string {
  return JSON.stringify(context);
}

export function resolveByPrecedence(
  candidates: Partial<Record<HandoffSource, ConnectHandoffContext | null>>,
  now = Date.now(),
): ConnectHandoffContext | null {
  for (const source of HANDOFF_SOURCE_PRECEDENCE) {
    const candidate = candidates[source];
    if (!isValidHandoffContext(candidate)) continue;
    if (isExpiredHandoffContext(candidate, now)) continue;
    return candidate;
  }
  return null;
}

function resolveCookiePayload(
  context: ConnectHandoffContext,
): CookieHandoffPayload {
  return {
    ...context,
    secret: null,
  };
}

export function resolveHandoffContext(options: {
  searchParams?: SearchParamReader | null;
  cookieHeader?: string | null;
  rawStorageValue?: string | null;
  now?: number;
}): ConnectHandoffContext | null {
  const now = options.now ?? Date.now();
  const fromUrl = options.searchParams
    ? parseFromSearchParams(options.searchParams, now)
    : null;
  const fromCookie = parseFromCookie(options.cookieHeader, now);
  const fromStorage = parseFromStorage(options.rawStorageValue ?? null, now);
  const resolved = resolveByPrecedence(
    { url: fromUrl, cookie: fromCookie, storage: fromStorage },
    now,
  );
  if (!resolved) return null;
  if (resolved.secret) return resolved;
  if (!fromStorage || !isValidHandoffContext(fromStorage)) return resolved;
  if (isExpiredHandoffContext(fromStorage, now)) return resolved;
  if (fromStorage.sessionId !== resolved.sessionId) return resolved;

  return {
    ...resolved,
    secret: fromStorage.secret,
  };
}

export function resolveHandoffContextFromClient(
  searchParams: SearchParamReader,
  now = Date.now(),
): ConnectHandoffContext | null {
  const cookieHeader =
    typeof document !== "undefined" ? document.cookie : undefined;
  let rawStorageValue: string | null = null;
  try {
    if (typeof localStorage !== "undefined") {
      rawStorageValue = localStorage.getItem(HANDOFF_STORAGE_KEY);
    }
  } catch {
    rawStorageValue = null;
  }
  return resolveHandoffContext({
    searchParams,
    cookieHeader,
    rawStorageValue,
    now,
  });
}

export function persistHandoffContext(context: ConnectHandoffContext): void {
  const payload = serializeHandoffContext(context);

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(HANDOFF_STORAGE_KEY, payload);
    }
  } catch {
    // localStorage may be unavailable in some browser contexts
  }

  if (typeof document !== "undefined") {
    const cookiePayload = serializeHandoffContext(
      resolveCookiePayload(context),
    );
    const maxAgeSeconds = Math.floor(HANDOFF_CONTEXT_TTL_MS / 1000);
    const secureAttr = window.location.protocol === "https:" ? "; Secure" : "";
    // biome-ignore lint/suspicious/noDocumentCookie: Handoff continuity needs explicit client cookie persistence.
    document.cookie = `${HANDOFF_COOKIE_KEY}=${encodeURIComponent(cookiePayload)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureAttr}`;
  }
}

export function clearHandoffContext(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(HANDOFF_STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable in some browser contexts
  }

  if (typeof document !== "undefined") {
    // biome-ignore lint/suspicious/noDocumentCookie: Clearing the handoff cookie is required on terminal paths.
    document.cookie = `${HANDOFF_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

export function resolvePostAuthDestination(
  context: ConnectHandoffContext | null,
  fallbackHref = APP_ROUTES.downloadDataConnect,
): string {
  if (!context) return fallbackHref;
  return toConnectUrl(context);
}

function createHandoffQueryParams(
  context: Pick<
    ConnectHandoffContext,
    "sessionId" | "secret" | "app" | "appId" | "appName"
  >,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("sessionId", context.sessionId);
  if (context.secret) {
    params.set("secret", context.secret);
  }
  if (context.app) {
    params.set("app", context.app);
  }
  if (context.appId) {
    params.set("appId", context.appId);
  }
  if (context.appName) {
    params.set("appName", context.appName);
  }
  return params;
}
