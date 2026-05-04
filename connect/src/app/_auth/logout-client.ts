import { clearHandoffContext } from "@/app/_lib/handoff-contract";
import { APP_ROUTES } from "@/app/routes";

const PASSPORT_AGREEMENT_STORAGE_KEY = "vana_passport_agreement_acceptance";
const LOGOUT_TIMEOUT_MS = 2000;

export function clearLocalSessionState() {
  clearHandoffContext();
  try {
    localStorage.removeItem(PASSPORT_AGREEMENT_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable in some browser contexts.
  }
}

function resolveLogoutDestination() {
  const fallback = APP_ROUTES.login;
  const returnTo = new URLSearchParams(window.location.search).get("return_to");
  if (!returnTo) return fallback;

  try {
    const url = new URL(returnTo);
    if (url.origin === "http://localhost:3084") {
      return url.toString();
    }
  } catch {
    if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      return returnTo;
    }
  }

  return fallback;
}

export async function runClientLogout(logout: () => Promise<void>) {
  try {
    await Promise.race([
      Promise.allSettled([
        logout(),
        fetch("/api/auth/session", { method: "DELETE", cache: "no-store" }),
      ]).then(() => undefined),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, LOGOUT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Best effort: always continue to login even if SDK logout fails.
  } finally {
    clearLocalSessionState();
    window.location.replace(resolveLogoutDestination());
  }
}
