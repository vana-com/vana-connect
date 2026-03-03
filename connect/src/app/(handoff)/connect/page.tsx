"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { CONNECT_CONFIG } from "@/config/config";
import {
  ConnectErrorState,
  ConnectFooterSpacer,
  ConnectLoadingState,
  ConnectMissingSessionState,
  ConnectNoSessionFallbackState,
  ConnectPanelFooter,
  ConnectReadyState,
} from "./_components/connect-page-ui";
import { resolveConnectAppQuery } from "./_lib/app-query";
import { resolveConnectApp } from "./_lib/app-registry";
import { useConnectPage } from "./use-connect-page";

function createAppQueryReader(
  appContext: {
    appUrl: string | null;
    app: string | null;
    appId: string | null;
    appName: string | null;
  } | null,
  fallback: URLSearchParams,
) {
  return {
    get(name: string): string | null {
      if (appContext) {
        if (name === "appUrl") return appContext.appUrl;
        if (name === "app") return appContext.app;
        if (name === "appId") return appContext.appId;
        if (name === "appName") return appContext.appName;
      }
      return fallback.get(name);
    },
  };
}

function ConnectPageContent() {
  const searchParams = useSearchParams();
  const {
    view,
    error,
    sessionId,
    isAuthenticated,
    deepLinkUrl,
    appContext,
    downloadDataConnectHref,
  } = useConnectPage();
  const isDebugMode = searchParams.get("authDebug") === "1";
  const appQuery = resolveConnectAppQuery(
    createAppQueryReader(appContext, searchParams),
  );
  const app = resolveConnectApp({
    appUrl: appQuery.appUrl,
    appName: appQuery.appName,
  });
  const supportHref = `mailto:${CONNECT_CONFIG.support.email}`;
  // signin from DataConnect ?sessionId=local-server-auth&appName=DataConnect
  const isLocalServerAuthFromDataConnect =
    sessionId === "local-server-auth" &&
    appQuery.appName?.toLowerCase() === "dataconnect";

  if (!sessionId) {
    return (
      <PageShell>
        <PagePanel
          className="text-center justify-center"
          footer={<ConnectFooterSpacer />}
        >
          {isAuthenticated ? (
            <ConnectNoSessionFallbackState app={app} />
          ) : (
            <ConnectMissingSessionState app={app} />
          )}
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
            isLocalServerAuthFromDataConnect={isLocalServerAuthFromDataConnect}
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
    <Suspense
      fallback={
        <PageShell>
          <PagePanel
            className="text-center justify-center"
            footer={<ConnectPanelFooter />}
          >
            <PageLoadingState message="Preparing…" />
          </PagePanel>
        </PageShell>
      }
    >
      <ConnectPageContent />
    </Suspense>
  );
}
