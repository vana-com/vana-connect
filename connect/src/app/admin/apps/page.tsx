"use client";

import { ArrowUpRightIcon, BoxIcon } from "lucide-react";
import { useState } from "react";
import { useAuthGuard } from "@/app/_auth/use-auth-guard";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { SettingsConfirmAction } from "@/components/elements/confirm-action";
import { PageHeader } from "@/components/elements/page-header";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminFooterLinks } from "../_components/admin-footer-links";
import { RegisterAnotherAppButton } from "../_components/register-another-app-button";
import {
  deleteRegisteredAdminApp,
  type RegisteredAdminApp,
  readRegisteredAdminApps,
} from "../_lib/admin-apps-storage";
import { resolveAdminAppsPageUiDebugState } from "./apps-page.ui-debug";

export default function AdminAppsPage() {
  const { isChecking } = useAuthGuard();

  // UI debug quick usage (dev only):
  // - /admin/apps?appsDebug=1&appsScenario=empty
  // - /admin/apps?appsDebug=1&appsScenario=seven
  // - No appsDebug/appsScenario => real account state (no debug override).
  const [apps, setApps] = useState(
    () =>
      resolveAdminAppsPageUiDebugState({
        apps: readRegisteredAdminApps(),
      }).apps,
  );

  if (isChecking) {
    return (
      <PageShell>
        <PagePanel>
          <PageLoadingState showVanaLogotype message="Checking session…" />
        </PagePanel>
      </PageShell>
    );
  }

  function handleDelete(app: RegisteredAdminApp) {
    deleteRegisteredAdminApp(app.id);
    setApps((current) => current.filter((entry) => entry.id !== app.id));
  }

  return (
    <PageShell actions={["dataConnect", "logout"]}>
      <PagePanel footer={<AdminFooterLinks />}>
        <div className="flex flex-1 flex-col space-y-small">
          <PageHeader
            showVanaLogotype
            heading="Your apps"
            color="iris"
            description={
              <Text>
                {apps.length === 0
                  ? "Your registered apps will appear here."
                  : "Your registered apps."}
              </Text>
            }
          />

          {/* -mx-1.5 */}
          <div className="flex min-h-0 flex-1 flex-col space-y-gap">
            <div className="rounded-button border flex-1">
              {apps.length === 0 ? (
                <Text intent="small" muted withIcon className="p-gap">
                  <BoxIcon className="size-[1.25em]" />
                  No apps registered yet.
                </Text>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {apps.map((app) => (
                    <div
                      key={app.id}
                      className={cn(
                        "group flex h-tab items-center gap-2",
                        "px-3 py-2.5 border-b last:border-b-0",
                        "transition-colors hover:bg-muted/40",
                      )}
                    >
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <Text
                          intent="small"
                          color="foreground"
                          weight="medium"
                          withIcon
                          className="shrink-0 group-hover:text-iris"
                        >
                          <BoxIcon className="size-[1.1em]" />
                          {app.name}
                        </Text>
                        <Text
                          intent="fine"
                          muted
                          withIcon
                          className="min-w-0 truncate group-hover:text-foreground"
                        >
                          {app.url}
                          <ArrowUpRightIcon
                            aria-hidden
                            className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          />
                        </Text>
                      </a>
                      <SettingsConfirmAction
                        title={`Delete ${app.name}?`}
                        description="This only removes the app from your account list so you can register it again later."
                        actionLabel="Delete app"
                        onAction={() => handleDelete(app)}
                        trigger={
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className={cn(
                              "border-transparent bg-transparent text-muted-foreground/0",
                              "group-hover:text-foreground-muted",
                              "hover:text-destructive hover:border-destructive",
                            )}
                            aria-label={`Delete ${app.name}`}
                          >
                            Delete
                          </Button>
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto flex justify-end">
            <RegisterAnotherAppButton href="/admin" />
          </div>
        </div>
      </PagePanel>
    </PageShell>
  );
}
