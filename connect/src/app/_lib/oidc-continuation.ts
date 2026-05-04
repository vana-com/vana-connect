/**
 * Narrow continuation seam between `/auth/oidc/login` and `/login`.
 *
 * `/auth/oidc/login` redirects unauthenticated users to
 * `/login?return_to=/auth/oidc/login?login_challenge=…`. `/login` reads that
 * `return_to`, persists it in `sessionStorage` so it survives full-page OAuth
 * redirects, and on completion prefers it over the DataConnect handoff
 * destination.
 *
 * Validation lives in `lib/auth/oidc-routes.isSafeOidcReturnTo` so the same
 * rule is applied on both ends of the redirect.
 */

import { isSafeOidcReturnTo } from "@/lib/auth/oidc-routes";

const STORAGE_KEY = "vana_oidc_return_to";

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Persist a `return_to` if it's a safe OIDC continuation target. */
export function persistOidcReturnTo(returnTo: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  if (!returnTo) return;
  if (!isSafeOidcReturnTo(returnTo)) {
    clearOidcReturnTo();
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, returnTo);
  } catch {
    // sessionStorage may be unavailable (Safari ITP, private mode).
  }
}

/** Read the persisted `return_to`, returning null when absent or unsafe. */
export function readOidcReturnTo(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  return isSafeOidcReturnTo(raw) ? raw : null;
}

export function clearOidcReturnTo(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Resolve a safe OIDC return_to from URL params and persisted storage,
 * preferring URL (fresh intent) and falling back to storage (post-OAuth
 * return). Returns null when neither is safe.
 */
export function resolveOidcReturnTo(searchParams: {
  get(name: string): string | null;
}): string | null {
  const fromUrl = searchParams.get("return_to");
  if (isSafeOidcReturnTo(fromUrl)) return fromUrl;
  if (fromUrl !== null) {
    clearOidcReturnTo();
    return null;
  }
  return readOidcReturnTo();
}
