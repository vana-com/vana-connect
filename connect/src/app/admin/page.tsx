"use client";

import { BoxIcon } from "lucide-react";
import { useMemo } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { NavLink, PageShell } from "@/app/_components/page-shell";
import { AdminFooterLinks } from "./_components/admin-footer-links";
import { AdminFormView } from "./_components/admin-form-view";
import { AdminLoadingView } from "./_components/admin-loading-view";
import { AdminResultView } from "./_components/admin-result-view";
import { useAdminRegistration } from "./_hooks/use-admin-registration";
import { resolveAdminPageUiDebugState } from "./admin-page.ui-debug";

export default function AdminPage() {
  const { state, appUrl, privateKey, copied, setAppUrl, submit, copy, reset } =
    useAdminRegistration();

  // UI debug quick usage (dev only):
  // - /admin?adminDebug=1&adminScenario=form
  // - /admin?adminDebug=1&adminScenario=loading
  // - /admin?adminDebug=1&adminScenario=result
  // - No adminDebug/adminScenario => real state (no debug override).
  const ui = resolveAdminPageUiDebugState({
    state,
    appUrl,
    privateKey,
  });

  const envText = useMemo(() => {
    return `VANA_APP_PRIVATE_KEY=${ui.privateKey}\nAPP_URL=${ui.appUrl}`;
  }, [ui.appUrl, ui.privateKey]);

  return (
    <PageShell actions={["dataConnect", "logout"]}>
      <PagePanel footer={<AdminFooterLinks />}>
        {ui.state !== "loading" && (
          <div className="absolute right-3 top-3">
            <NavLink
              href="/admin/apps"
              icon={<BoxIcon aria-hidden="true" />}
              className="bg-transparent"
            >
              Your apps
            </NavLink>
          </div>
        )}

        {ui.state === "loading" ? (
          <AdminLoadingView />
        ) : ui.state !== "result" ? (
          <AdminFormView
            appUrl={ui.appUrl}
            onAppUrlChange={setAppUrl}
            onSubmit={submit}
          />
        ) : (
          <AdminResultView
            copied={copied}
            envText={envText}
            onCopy={() => copy(envText)}
            onReset={reset}
          />
        )}
      </PagePanel>
    </PageShell>
  );
}
