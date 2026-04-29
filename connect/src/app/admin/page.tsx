"use client";

import { useMemo } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { AdminFooterLinks } from "./_components/admin-footer-links";
import { AdminFormView } from "./_components/admin-form-view";
import { AdminHeaderLinks } from "./_components/admin-header-links";
import { AdminResultView } from "./_components/admin-result-view";
import { useAdminRegistration } from "./_hooks/use-admin-registration";
import { resolveAdminPageUiDebugState } from "./admin-page.ui-debug";

export default function AdminPage() {
  const { state, appUrl, privateKey, copied, error, setAppUrl, submit, copy } =
    useAdminRegistration();

  // UI debug quick usage (dev only):
  // - /admin?adminDebug=1&adminScenario=form
  // - /admin?adminDebug=1&adminScenario=loading
  // - /admin?adminDebug=1&adminScenario=error
  // - /admin?adminDebug=1&adminScenario=result
  // - No adminDebug/adminScenario => real state (no debug override).
  const ui = resolveAdminPageUiDebugState({
    state,
    appUrl,
    privateKey,
    error,
  });

  const envText = useMemo(() => {
    return `VANA_PRIVATE_KEY=${ui.privateKey}\nAPP_URL=${ui.appUrl}`;
  }, [ui.appUrl, ui.privateKey]);

  return (
    <PageShell actions={["server", "dataConnect", "logout"]}>
      <PagePanel footer={<AdminFooterLinks />}>
        <AdminHeaderLinks />

        {ui.state !== "result" ? (
          <AdminFormView
            appUrl={ui.appUrl}
            isLoading={ui.state === "loading"}
            error={ui.error}
            onAppUrlChange={setAppUrl}
            onSubmit={submit}
          />
        ) : (
          <AdminResultView
            copied={copied}
            envText={envText}
            onCopy={() => copy(envText)}
          />
        )}
      </PagePanel>
    </PageShell>
  );
}
