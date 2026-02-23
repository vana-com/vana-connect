"use client";

import type { ReactNode } from "react";
import { useAuthGuard } from "@/app/_auth/use-auth-guard";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageLoadingState } from "@/components/elements/page-loading-state";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isChecking } = useAuthGuard();

  if (isChecking) {
    return (
      <PageShell>
        <PagePanel>
          <PageLoadingState showVanaLogotype message="Checking session…" />
        </PagePanel>
      </PageShell>
    );
  }

  return children;
}
