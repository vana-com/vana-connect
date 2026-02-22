"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { CONNECT_CONFIG } from "@/config/config";
import { resolveConnectAppRef } from "./_shared/app-query";
import { resolveConnectApp } from "./_shared/app-registry";
import {
  ConnectErrorState,
  ConnectFooterSpacer,
  ConnectLoadingState,
  ConnectMissingSessionState,
  ConnectPanelFooter,
  ConnectReadyState,
} from "./_shared/connect-page-ui";
import { useConnectPage } from "./use-connect-page";

// TODO(connect-query-contract): Query pass-through to `/download-data-connect`
// is not finalized. Replace raw `searchParams.toString()` forwarding with an
// explicit whitelist once the contract is frozen (keep only integration params,
// strip debug/internal params like `authDebug` and `scenario`).
function ConnectPageContent() {
  const searchParams = useSearchParams();
  const { view, error, sessionId, deepLinkUrl } = useConnectPage();
  const isDebugMode = searchParams.get("authDebug") === "1";
  const rawQuery = searchParams.toString();
  const downloadDataConnectHref = rawQuery
    ? `/download-data-connect?${rawQuery}`
    : "/download-data-connect";
  const appRef = resolveConnectAppRef(searchParams);
  const app = resolveConnectApp(appRef);
  const supportHref = `mailto:${CONNECT_CONFIG.support.email}`;

  if (!sessionId) {
    return (
      <PageShell>
        <PagePanel
          className="text-center justify-center"
          footer={<ConnectFooterSpacer />}
        >
          <ConnectMissingSessionState app={app} />
        </PagePanel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PagePanel
        className="text-center justify-center"
        footer={<ConnectPanelFooter />}
      >
        {/* Loading + Signing share one user-facing state */}
        {(view === "loading" || view === "signing") && (
          <ConnectLoadingState app={app} />
        )}

        {/* Ready — deep link to Data Connect */}
        {view === "ready" && deepLinkUrl && (
          <ConnectReadyState
            app={app}
            deepLinkUrl={deepLinkUrl}
            downloadDataConnectHref={downloadDataConnectHref}
          />
        )}

        {/* Error: prepare/signing failed; reload the page to try again */}
        {view === "error" && (
          <ConnectErrorState
            app={app}
            isDebugMode={isDebugMode}
            error={error}
            supportHref={supportHref}
          />
        )}
      </PagePanel>
    </PageShell>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <ConnectPageContent />
    </Suspense>
  );
}
