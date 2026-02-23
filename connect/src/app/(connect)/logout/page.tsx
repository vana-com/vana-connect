"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { APP_ROUTES } from "@/app/routes";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { clearHandoffContext } from "../_shared/handoff-contract";

const PASSPORT_AGREEMENT_STORAGE_KEY = "vana_passport_agreement_acceptance";
const LOGOUT_TIMEOUT_MS = 2000;

function clearLocalSessionState() {
  clearHandoffContext();
  try {
    localStorage.removeItem(PASSPORT_AGREEMENT_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable in some browser contexts.
  }
}

export default function LogoutPage() {
  const { logout } = usePrivy();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    (async () => {
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
    })();
  }, [logout]);

  return (
    <PageShell>
      <PagePanel>
        <PageLoadingState showVanaLogotype message="Signing you out…" />
      </PagePanel>
    </PageShell>
  );
}
