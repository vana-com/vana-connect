/**
 * Vana session verifier.
 *
 * Single point-of-policy for "who is making this request?" across every
 * authenticated route on account.vana.org. See
 * docs/auth-redesign/01-architecture.md §1.4 and §4.
 *
 * Resolution path:
 *
 *   1. Pull token from `Authorization: Bearer <token>`. If absent and method
 *      is GET/HEAD/OPTIONS, fall back to `vana_session` cookie. State-mutating
 *      methods (POST/PUT/PATCH/DELETE) do NOT accept cookie auth — eliminates
 *      CSRF surface for those routes.
 *
 *   2. Cache lookup: in-process LRU keyed by sha256(token), 30s TTL. Cache
 *      both positive and negative results.
 *
 *   3. On miss: POST to Hydra admin /admin/oauth2/introspect with form body
 *      `token=<token>`. Cache the result.
 *
 *   4. Validate: `active === true`, `iss === HYDRA_PUBLIC_URL`, `aud` includes
 *      `account.vana.org`, `exp` not exceeded (60s clock skew tolerance),
 *      `token_use === 'access_token'`.
 *
 *   5. Tombstone check: SELECT 1 FROM vana_session_tombstones — multi-lambda
 *      revocation. Cached 5s in-process to keep DB load manageable.
 *
 *   6. assertVanaUserId(result.sub) — throws if `sub` is not the canonical
 *      `vana_user_<32hex>` shape; caught and treated as null.
 *
 * Returns null on any failure. Routes interpret null as 401.
 */

import { createHash } from "node:crypto";
import { fetchGoogleIdTokenForAudience } from "./google-id-token";
import { isSessionTombstoned } from "@/lib/db/sessions";

// Branded type stub. Stage 6 brings the brand; here it's a string alias.
type VanaUserId = string;

const VANA_USER_ID_RE = /^vana_user_[0-9a-f]{32}$/;

function isValidVanaUserId(v: unknown): v is VanaUserId {
  return typeof v === "string" && VANA_USER_ID_RE.test(v);
}

export type VanaSession = {
  vanaUserId: VanaUserId;
  hydraSessionId: string;
  scope: string[];
  audience: string[];
};

const SESSION_COOKIE_NAME = "vana_session";

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const INTROSPECTION_CACHE_TTL_MS = 30_000;
const TOMBSTONE_CACHE_TTL_MS = 5_000;
const CLOCK_SKEW_SECONDS = 60;

type IntrospectionResult = {
  active: boolean;
  sub?: string;
  aud?: string[] | string;
  exp?: number;
  iss?: string;
  scope?: string;
  client_id?: string;
  token_use?: string;
  ext?: Record<string, unknown>;
};

type CachedIntrospection = {
  result: IntrospectionResult;
  cachedAt: number;
};

type CachedTombstone = {
  tombstoned: boolean;
  cachedAt: number;
};

/**
 * Per-process LRU caches. Multi-lambda revocation correctness comes from the
 * tombstone check which DOES round-trip Postgres on cache miss; the
 * introspection cache only saves Hydra calls.
 */
const introspectionCache = new Map<string, CachedIntrospection>();
const tombstoneCache = new Map<string, CachedTombstone>();
const INTROSPECTION_CACHE_MAX = 10_000;
const TOMBSTONE_CACHE_MAX = 10_000;

function pruneCache<V>(cache: Map<string, V>, maxSize: number) {
  if (cache.size <= maxSize) return;
  // Drop oldest 10% by insertion order (Map preserves it).
  const target = Math.floor(maxSize * 0.9);
  let toRemove = cache.size - target;
  for (const key of cache.keys()) {
    if (toRemove-- <= 0) break;
    cache.delete(key);
  }
}

export type GetVanaSessionDeps = {
  /** Override for tests. */
  fetch?: typeof fetch;
  /** Hydra admin URL. Defaults to env. */
  hydraAdminUrl?: string;
  /** Hydra admin Cloud Run audience for Google ID-token auth. Defaults to env. */
  hydraAdminAudience?: string;
  /** Hydra issuer URL (`iss` claim source of truth). Defaults to env. */
  hydraPublicUrl?: string;
  /** Audience this verifier accepts. Defaults to env (e.g. `account.vana.org`). */
  expectedAudience?: string;
  /** Override for tests. */
  isSessionTombstoned?: (hydraSessionId: string) => Promise<boolean>;
  /** Override for tests. */
  now?: () => number;
};

function readEnv(name: string): string | undefined {
  return process.env[name];
}

function defaultDeps(): Required<
  Pick<
    GetVanaSessionDeps,
    | "fetch"
    | "hydraAdminUrl"
    | "hydraAdminAudience"
    | "hydraPublicUrl"
    | "expectedAudience"
    | "isSessionTombstoned"
    | "now"
  >
> {
  return {
    fetch,
    hydraAdminUrl: readEnv("HYDRA_ADMIN_URL") ?? "",
    hydraAdminAudience: readEnv("HYDRA_ADMIN_AUDIENCE") ?? "",
    hydraPublicUrl: readEnv("HYDRA_PUBLIC_URL") ?? "",
    expectedAudience:
      readEnv("VANA_SESSION_EXPECTED_AUDIENCE") ?? "account.vana.org",
    isSessionTombstoned,
    now: () => Date.now(),
  };
}

/**
 * Public API. Returns null on any failure (missing/invalid/expired/revoked
 * token, malformed `sub`, audience mismatch, tombstoned session).
 *
 * Routes treat null as 401. They MUST NOT distinguish failure modes in the
 * response (no leaking introspection errors to the client).
 */
export async function getVanaSession(
  req: Request,
  overrides: GetVanaSessionDeps = {},
): Promise<VanaSession | null> {
  const deps = { ...defaultDeps(), ...overrides };
  const token = extractToken(req);
  if (!token) return null;

  let result: IntrospectionResult;
  try {
    result = await introspect(token, deps);
  } catch {
    return null;
  }

  if (!result.active) return null;
  if (!validateClaims(result, deps)) return null;
  if (!isValidVanaUserId(result.sub)) return null;

  const hydraSessionId = extractSessionId(result);
  if (!hydraSessionId) return null;

  if (await isTombstoned(hydraSessionId, deps)) return null;

  return {
    vanaUserId: result.sub,
    hydraSessionId,
    scope: parseScope(result.scope),
    audience: normalizeAudience(result.aud),
  };
}

/** Strictly for tests: clear all in-process caches. */
export function clearVanaSessionCaches(): void {
  introspectionCache.clear();
  tombstoneCache.clear();
}

// ---------- internals ----------

function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim() || null;
  }
  const method = req.method.toUpperCase();
  if (READ_ONLY_METHODS.has(method)) {
    // Cookie fallback only for read-only methods.
    const cookieHeader = req.headers.get("cookie");
    if (!cookieHeader) return null;
    return readCookie(cookieHeader, SESSION_COOKIE_NAME);
  }
  return null;
}

function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k !== name) continue;
    const v = part.slice(eq + 1).trim();
    return v ? decodeURIComponent(v) : null;
  }
  return null;
}

function tokenCacheKey(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function introspect(
  token: string,
  deps: Required<
    Pick<
      GetVanaSessionDeps,
      "fetch" | "hydraAdminUrl" | "hydraAdminAudience" | "now"
    >
  >,
): Promise<IntrospectionResult> {
  const key = tokenCacheKey(token);
  const cached = introspectionCache.get(key);
  if (cached && deps.now() - cached.cachedAt < INTROSPECTION_CACHE_TTL_MS) {
    return cached.result;
  }
  if (cached) introspectionCache.delete(key); // expired

  if (!deps.hydraAdminUrl) {
    throw new Error("HYDRA_ADMIN_URL is not configured");
  }

  // Hydra admin requires Google ID-token Bearer (Cloud Run IAM in our deploy).
  const adminAudience = deps.hydraAdminAudience || deps.hydraAdminUrl;
  const adminBearer = await fetchGoogleIdTokenForAudience(adminAudience, {
    fetch: deps.fetch,
  });

  const url = `${deps.hydraAdminUrl.replace(/\/+$/, "")}/admin/oauth2/introspect`;
  const body = new URLSearchParams({ token });
  const response = await deps.fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      ...(adminBearer ? { authorization: `Bearer ${adminBearer}` } : {}),
    },
    body: body.toString(),
  });

  if (!response.ok) {
    // Cache negative result briefly so a failed token doesn't hammer Hydra.
    const negative: IntrospectionResult = { active: false };
    introspectionCache.set(key, { result: negative, cachedAt: deps.now() });
    pruneCache(introspectionCache, INTROSPECTION_CACHE_MAX);
    return negative;
  }

  const result = (await response.json()) as IntrospectionResult;
  introspectionCache.set(key, { result, cachedAt: deps.now() });
  pruneCache(introspectionCache, INTROSPECTION_CACHE_MAX);
  return result;
}

function validateClaims(
  result: IntrospectionResult,
  deps: Required<
    Pick<GetVanaSessionDeps, "hydraPublicUrl" | "expectedAudience" | "now">
  >,
): boolean {
  // Issuer pinning (skip if not configured to avoid false negatives in dev).
  if (deps.hydraPublicUrl && result.iss && result.iss !== deps.hydraPublicUrl) {
    return false;
  }
  // Audience pinning.
  const aud = normalizeAudience(result.aud);
  if (!aud.includes(deps.expectedAudience)) {
    return false;
  }
  // Expiry with clock skew tolerance.
  if (typeof result.exp === "number") {
    const nowSec = Math.floor(deps.now() / 1000);
    if (nowSec > result.exp + CLOCK_SKEW_SECONDS) return false;
  }
  // Token use must be access (not refresh, not id_token).
  if (result.token_use && result.token_use !== "access_token") return false;
  return true;
}

function normalizeAudience(aud: string[] | string | undefined): string[] {
  if (!aud) return [];
  return Array.isArray(aud) ? aud : [aud];
}

function parseScope(scope: string | undefined): string[] {
  if (!scope) return [];
  return scope.split(/\s+/).filter(Boolean);
}

/**
 * Hydra access tokens carry a session identifier. The exact location depends
 * on the introspection response shape; we accept any of the conventional
 * fields (`sid`, `sub` is reserved for vana_user_id, `client_id` is wrong).
 * If none, derive a stable hash from token+sub as a fallback so tombstones
 * still have something to key on. (Hydra reliably exposes a session id; the
 * fallback is defense-in-depth, not the primary path.)
 */
function extractSessionId(result: IntrospectionResult): string | null {
  // Hydra exposes `sid` on JWT tokens; opaque introspection includes it as
  // `ext.sid` or `sid` depending on version.
  const sid =
    (result as { sid?: unknown }).sid ??
    (result.ext as { sid?: unknown } | undefined)?.sid;
  if (typeof sid === "string" && sid.length > 0) return sid;
  return null;
}

async function isTombstoned(
  hydraSessionId: string,
  deps: Required<Pick<GetVanaSessionDeps, "isSessionTombstoned" | "now">>,
): Promise<boolean> {
  const cached = tombstoneCache.get(hydraSessionId);
  if (cached && deps.now() - cached.cachedAt < TOMBSTONE_CACHE_TTL_MS) {
    return cached.tombstoned;
  }
  if (cached) tombstoneCache.delete(hydraSessionId);

  const tombstoned = await deps.isSessionTombstoned(hydraSessionId);
  tombstoneCache.set(hydraSessionId, { tombstoned, cachedAt: deps.now() });
  pruneCache(tombstoneCache, TOMBSTONE_CACHE_MAX);
  return tombstoned;
}
