"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { runClientLogout } from "@/app/_auth/logout-client";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageLoadingState } from "@/components/elements/page-loading-state";

export default function LogoutPage() {
  const { logout } = usePrivy();
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    void runClientLogout(logout);
  }, [logout]);

  return (
    <PageShell>
      <PagePanel>
        <PageLoadingState showVanaLogotype message="Signing you out…" />
      </PagePanel>
    </PageShell>
  );
}
