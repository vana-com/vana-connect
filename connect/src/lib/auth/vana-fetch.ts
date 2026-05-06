"use client";

/**
 * Authenticated fetch wrapper for browser-side calls to account.vana.org's
 * own API.
 *
 * This module exists so callers cannot forget the `Authorization: Bearer
 * <vana_access>` header or race the cookie-mint that happens after Privy
 * login. Both concerns are handled at the lowest layer.
 *
 * Background:
 *
 * - The `vana_access` cookie is the JS-readable companion to the HttpOnly
 *   `vana_session` cookie. Both are minted by `POST /api/auth/session` after
 *   Privy login.
 * - The server-side verifier `getVanaSession()` accepts `vana_session` on
 *   GET/HEAD/OPTIONS only. On POST/PUT/PATCH/DELETE it requires
 *   `Authorization: Bearer <token>` (CSRF defense).
 * - So mutating browser code must read `vana_access` and attach it. If the
 *   cookie is missing, it must mint it first by POSTing the Privy id_token
 *   to `/api/auth/session`.
 *
 * Usage:
 *
 *   // Once at the app shell, after Privy is ready:
 *   useEffect(() => {
 *     setPrivyIdentityTokenGetter(() => identityTokenRef.current);
 *   }, []);
 *
 *   // Anywhere a mutation is performed:
 *   const res = await vanaFetch("/api/servers/.../register-on-chain", {
 *     method: "POST",
 *     body: JSON.stringify({ ... }),
 *   });
 */

import { readVanaAccessCookie } from "@/components/auth/use-confirmation";

/**
 * Thrown when the helper cannot establish a Vana session — for example,
 * Privy is not ready, no identity-token getter has been registered,
 * the bootstrap call to `/api/auth/session` failed, or the cookie did
 * not land after a successful bootstrap (third-party-cookie blocking).
 */
export class VanaSessionUnavailableError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "VanaSessionUnavailableError";
    if (cause !== undefined) this.cause = cause;
  }
}

type IdentityTokenGetter = () => string | null | undefined;

let identityTokenGetter: IdentityTokenGetter | null = null;
let bootstrapInFlight: Promise<boolean> | null = null;

/**
 * Register the Privy identity-token getter once at app shell. The getter is
 * called whenever the helper needs to bootstrap a Vana session. It must
 * return the current Privy `identity_token` or `null`/`undefined` if Privy
 * is not yet ready.
 *
 * Pass `null` to clear the registration (e.g. on logout).
 */
export function setPrivyIdentityTokenGetter(
  getter: IdentityTokenGetter | null,
): void {
  identityTokenGetter = getter;
}

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isReadOnlyMethod(method: string | undefined): boolean {
  if (!method) return true; // default fetch method is GET
  return READ_ONLY_METHODS.has(method.toUpperCase());
}

/**
 * Build a fresh `Headers` object from `init.headers`, stripping any
 * caller-supplied `Authorization` header. The cookie-derived value is the
 * single source of truth.
 */
function withAuthHeaders(
  init: RequestInit | undefined,
  bearerToken: string | null,
): Headers {
  const headers = new Headers(init?.headers ?? undefined);
  headers.delete("Authorization");
  // Headers is case-insensitive but be explicit; some test runners
  // preserve original casing in snapshots.
  headers.delete("authorization");
  if (bearerToken) {
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }
  return headers;
}

/**
 * Start a bootstrap if needed and report whether a `vana_access` cookie is
 * present after it settles. Concurrent callers share a single in-flight
 * bootstrap promise.
 *
 * When `force` is false, an existing cookie short-circuits the bootstrap
 * (used on the pre-flight path: cookie present → trust it). When `force`
 * is true, the cookie is ignored as a precondition (used on the 401-retry
 * path: the cookie may have just been rejected as expired).
 */
async function ensureBootstrap(force = false): Promise<boolean> {
  if (!force && readVanaAccessCookie()) return true;

  if (bootstrapInFlight) {
    return bootstrapInFlight;
  }

  const getter = identityTokenGetter;
  if (!getter) return false;

  const promise = (async (): Promise<boolean> => {
    const idToken = getter();
    if (!idToken) return false;
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) return false;
    } catch {
      return false;
    }
    return readVanaAccessCookie() !== null;
  })();

  bootstrapInFlight = promise;
  try {
    return await promise;
  } finally {
    // Clear the cache so a subsequent call (e.g. cookie expired again)
    // can re-trigger.
    if (bootstrapInFlight === promise) {
      bootstrapInFlight = null;
    }
  }
}

/**
 * If the response is a 401 with `{ error: { type: "authentication_error" } }`,
 * return true. Reads via `response.clone()` so the original body remains
 * consumable.
 */
async function isAuthenticationError(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    const body = (await response.clone().json()) as {
      error?: { type?: unknown } | unknown;
    };
    const error = body.error;
    if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      (error as { type?: unknown }).type === "authentication_error"
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Wrapper around `fetch` for authenticated same-origin calls to
 * account.vana.org's API.
 *
 * Behavior:
 *
 * 1. Read the `vana_access` cookie.
 * 2. If present: attach `Authorization: Bearer <cookie>`. Issue fetch.
 * 3. If absent and method is read-only (GET/HEAD/OPTIONS): issue fetch
 *    without `Authorization` (the server's cookie path covers reads via
 *    `vana_session`).
 * 4. If absent and method is mutating: bootstrap (POST id_token to
 *    `/api/auth/session`), re-read the cookie, and either attach Bearer or
 *    throw `VanaSessionUnavailableError`.
 * 5. If the response is 401 with body `{ error: { type:
 *    "authentication_error" } }` AND we did not bootstrap on this call AND
 *    an id-token getter is registered: bootstrap once and retry the same
 *    fetch one time. If the retry also 401s, return that response.
 *
 * Concurrency: multiple in-flight callers that need to bootstrap share a
 * single bootstrap promise.
 *
 * Override: any caller-provided `Authorization` header is replaced with the
 * cookie-derived one. There is one source of truth.
 */
export async function vanaFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof document === "undefined") {
    throw new VanaSessionUnavailableError(
      "vanaFetch can only be called from the browser (no document).",
    );
  }

  const method = init?.method;
  const readOnly = isReadOnlyMethod(method);

  let cookie = readVanaAccessCookie();
  let bootstrappedThisCall = false;

  if (!cookie && !readOnly) {
    bootstrappedThisCall = true;
    const ok = await ensureBootstrap();
    if (!ok) {
      throw new VanaSessionUnavailableError(
        "Could not establish a Vana session. Please sign in again from /login.",
      );
    }
    cookie = readVanaAccessCookie();
    if (!cookie) {
      throw new VanaSessionUnavailableError(
        "Vana session cookie was not stored after bootstrap. Check third-party-cookie settings.",
      );
    }
  }

  const headers = withAuthHeaders(init, cookie);
  const response = await fetch(input, { ...init, headers });

  if (bootstrappedThisCall) return response;
  if (!identityTokenGetter) return response;
  if (!(await isAuthenticationError(response))) return response;

  // Retry path: the cookie may have expired mid-page-life. Force a fresh
  // bootstrap (the existing cookie is the one the server just rejected) and
  // retry the same call exactly once. Accept whatever the retry returns.
  const ok = await ensureBootstrap(true);
  if (!ok) return response;
  const refreshed = readVanaAccessCookie();
  if (!refreshed) return response;
  const retryHeaders = withAuthHeaders(init, refreshed);
  return fetch(input, { ...init, headers: retryHeaders });
}

/**
 * Test-only helper. Reset module-level state between tests.
 * Not part of the public API.
 *
 * @internal
 */
export function __resetVanaFetchForTests(): void {
  identityTokenGetter = null;
  bootstrapInFlight = null;
}
