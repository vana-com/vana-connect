"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import {
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
    isAuthOnly,
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

            {view === "ready" && isAuthOnly ? (
              <div className="flex flex-col items-center gap-3">
                <div className="text-2xl text-green-500">&#10003;</div>
                <h2 className="text-lg font-semibold">Connected</h2>
                <p className="text-sm text-muted-foreground">
                  You have been authenticated. You can close this tab.
                </p>
              </div>
            ) : null}

            {view === "ready" && !isAuthOnly && deepLinkUrl ? (
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
