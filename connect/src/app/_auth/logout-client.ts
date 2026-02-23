import { clearHandoffContext } from "@/app/(connect)/_shared/handoff-contract";
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

export async function runClientLogout(logout: () => Promise<void>) {
  try {
    await Promise.race([
      logout(),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, LOGOUT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Best effort: always continue to login even if SDK logout fails.
  } finally {
    clearLocalSessionState();
    window.location.replace(APP_ROUTES.login);
  }
}
