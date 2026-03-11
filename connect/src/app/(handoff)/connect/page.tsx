import { Suspense } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { CONNECT_CONFIG } from "@/config/config";
import {
  ConnectFooterSpacer,
  ConnectPanelFooter,
} from "./_components/connect-page-footer";
import { ConnectPageClient } from "./connect-page-client";

export default function ConnectPage() {
  const supportHref = `mailto:${CONNECT_CONFIG.support.email}`;
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
      <ConnectPageClient
        supportHref={supportHref}
        footer={<ConnectPanelFooter />}
        emptyFooter={<ConnectFooterSpacer />}
      />
    </Suspense>
  );
}
