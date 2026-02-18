"use client";

import { Suspense } from "react";
import { PageShell } from "@/app/_components/page-shell";
import { PagePanel } from "@/app/_components/page-panel";
import { Spinner } from "@/components/elements/spinner";
import { Text } from "@/components/typography/text";
import { DcIcon } from "@/components/icons/dc-icon";
import { useConnectPage } from "./use-connect-page";

function ConnectPageContent() {
  const { view, error, sessionId, deepLinkUrl } = useConnectPage();

  if (!sessionId) {
    return (
      <PageShell showBackButton={false}>
        <PagePanel>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Text as="h2" intent="title" color="destructive">
              Missing session
            </Text>
            <Text dim>
              This page requires a valid session. Please start from your
              application.
            </Text>
          </div>
        </PagePanel>
      </PageShell>
    );
  }

  return (
    <PageShell showBackButton={false}>
      <PagePanel>
        {/* Loading */}
        {view === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Spinner boxSize={32} className="text-iris" />
            <Text intent="small" color="mutedForeground">
              Preparing...
            </Text>
          </div>
        )}

        {/* Signing */}
        {view === "signing" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Spinner boxSize={32} className="text-iris" />
            <Text intent="small" color="mutedForeground">
              Signing your master key...
            </Text>
          </div>
        )}

        {/* Ready — deep link to Data Connect */}
        {view === "ready" && deepLinkUrl && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <DcIcon className="size-12 text-iris" />
            <Text as="h2" intent="title">
              Ready to connect
            </Text>
            <a
              href={deepLinkUrl}
              className="inline-flex items-center gap-2 rounded-lg bg-iris px-6 py-3 font-medium text-white transition-colors hover:bg-iris/90"
            >
              Launch Data Connect
            </a>
            <Text intent="small" muted>
              Don&apos;t have Data Connect?{" "}
              <a
                href="https://vana.org/download"
                className="link hover:text-foreground"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download it
              </a>
            </Text>
          </div>
        )}

        {/* Error */}
        {view === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Text as="h2" intent="title" color="destructive">
              Something went wrong
            </Text>
            <Text dim>{error ?? "An unexpected error occurred."}</Text>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-input px-4 py-2 text-sm transition-colors hover:bg-muted"
            >
              Try again
            </button>
          </div>
        )}
      </PagePanel>
    </PageShell>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectPageContent />
    </Suspense>
  );
}
