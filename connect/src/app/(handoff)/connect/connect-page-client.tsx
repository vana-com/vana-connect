"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { useEmbrowse } from "@/app/_lib/use-embrowse";
import {
  ConnectCompleteState,
  ConnectEmbrowseState,
  ConnectErrorState,
  ConnectLoadingState,
  ConnectMissingSessionState,
  ConnectNoSessionFallbackState,
  ConnectReadyState,
} from "./_components/connect-page-states";
import { resolveConnectAppQuery } from "./_lib/app-query";
import { resolveConnectApp } from "./_lib/app-registry";
import { useConnectPage } from "./use-connect-page";
import { resolveConnectPageUiDebugConfig } from "./use-connect-page.ui-debug";

const ConnectPageUiDebugPanel: ComponentType =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("./_components/connect-page-debug-panel").then(
            (module) => module.ConnectPageUiDebugPanel,
          ),
        { ssr: false },
      )
    : function ConnectPageUiDebugPanelProd() {
        return null;
      };

function createAppQueryReader(
  appContext: {
    appUrl: string | null;
    dataSource: string | null;
    scopes?: string[];
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
        if (name === "dataSource") return appContext.dataSource;
        if (name === "scope") return appContext.scopes?.[0] ?? null;
        if (name === "scopes") return appContext.scopes?.join(",") ?? null;
        if (name === "app") return appContext.app;
        if (name === "appId") return appContext.appId;
        if (name === "appName") return appContext.appName;
      }
      return fallback.get(name);
    },
  };
}

export function ConnectPageClient({
  supportHref,
  footer,
  emptyFooter,
}: {
  supportHref: string;
  footer: React.ReactNode;
  emptyFooter: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const debug = resolveConnectPageUiDebugConfig(searchParams);
  const {
    view,
    error,
    sessionId,
    isAuthenticated,
    deepLinkUrl,
    appContext,
    downloadDataConnectHref,
  } = useConnectPage();
  const resolvedAppQuery = resolveConnectAppQuery(
    createAppQueryReader(appContext, searchParams),
  );
  const appQuery =
    debug.enabled && debug.scenario === "ready"
      ? {
          ...resolvedAppQuery,
          appUrl: "https://peak-think.vercel.app/",
          appName: "Peak Think",
          dataSource: null,
          dataScopes: ["chatgpt.conversations", "oura.readiness"],
          requestedDataLabel: "ChatGPT and Oura data",
        }
      : resolvedAppQuery;
  const app = resolveConnectApp({
    appUrl: appQuery.appUrl,
    appName: appQuery.appName,
  });
  const isLocalServerAuthFromDataConnect =
    sessionId === "local-server-auth" &&
    appQuery.appName?.toLowerCase() === "dataconnect";

  // Embrowse web flow — used when the connect flow completes and we need to
  // scrape data in-browser instead of handing off to the desktop app.
  // For now, the PS URL is passed as a query param or hardcoded for demo.
  const serverUrl = searchParams.get("serverUrl") ?? "http://localhost:8080";
  const embrowseUrl = searchParams.get("embrowseUrl") ?? "/mock-embrowse.html";
  const embrowse = useEmbrowse({
    embrowseUrl,
    platform: appQuery.dataSource ?? "instagram",
    scopes: appQuery.dataScopes ?? ["instagram.ads", "instagram.profile"],
    serverUrl,
  });

  // Determine if we should show the web embrowse flow instead of the desktop deep link.
  // For now, use a query param flag (?web=1) to opt in. In production, this would be
  // determined by whether the user has a hosted PS or is on mobile.
  const useWebFlow = searchParams.get("web") === "1";

  return (
    <>
      {!sessionId ? (
        <PageShell>
          <PagePanel
            className="text-center justify-center"
            footer={emptyFooter}
          >
            {isAuthenticated ? (
              <ConnectNoSessionFallbackState app={app} />
            ) : (
              <ConnectMissingSessionState app={app} />
            )}
          </PagePanel>
        </PageShell>
      ) : (
        <PageShell>
          <PagePanel className="text-center justify-center" footer={footer}>
            {view === "loading" || view === "signing" ? (
              <ConnectLoadingState app={app} />
            ) : null}

            {view === "ready" &&
            useWebFlow &&
            embrowse.status !== "complete" ? (
              <ConnectEmbrowseState
                app={app}
                embrowseStatus={embrowse.status}
                progressText={embrowse.progressText}
                errorMessage={embrowse.errorMessage}
                onOpenEmbrowse={embrowse.openPopup}
                onRetry={() => {
                  embrowse.reset();
                  embrowse.openPopup();
                }}
              />
            ) : null}

            {view === "ready" &&
            useWebFlow &&
            embrowse.status === "complete" ? (
              <ConnectCompleteState
                app={app}
                completedScopes={embrowse.completedScopes}
                appUrl={appQuery.appUrl}
              />
            ) : null}

            {view === "ready" && !useWebFlow && deepLinkUrl ? (
              <ConnectReadyState
                app={app}
                requestedDataLabel={appQuery.requestedDataLabel}
                deepLinkUrl={deepLinkUrl}
                downloadDataConnectHref={downloadDataConnectHref}
                isLocalServerAuthFromDataConnect={
                  isLocalServerAuthFromDataConnect
                }
              />
            ) : null}

            {view === "error" ? (
              <ConnectErrorState
                app={app}
                isDebugMode={debug.enabled}
                error={error}
                supportHref={supportHref}
              />
            ) : null}
          </PagePanel>
        </PageShell>
      )}
      <ConnectPageUiDebugPanel />
    </>
  );
}
