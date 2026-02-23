"use client";

import { ArrowUpRightIcon, BoxIcon } from "lucide-react";
import { useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { SettingsConfirmAction } from "@/components/elements/confirm-action";
import { PageHeader } from "@/components/elements/page-header";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminFooterLinks } from "../_components/admin-footer-links";
import { AdminHeaderLinks } from "../_components/admin-header-links";
import {
  deleteRegisteredAdminApp,
  type RegisteredAdminApp,
  readRegisteredAdminApps,
} from "../_lib/admin-apps-storage";
import { resolveAdminAppsPageUiDebugState } from "./apps-page.ui-debug";

export default function AdminAppsPage() {
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

  function handleDelete(app: RegisteredAdminApp) {
    deleteRegisteredAdminApp(app.id);
    setApps((current) => current.filter((entry) => entry.id !== app.id));
  }

  return (
    <PageShell actions={["dataConnect", "logout"]}>
      <PagePanel footer={<AdminFooterLinks />}>
        <AdminHeaderLinks showYourApps={false} />
        {/* purposely not space-y-small to avoid extra space between list and button; header to list is actually -small via pt-gap on the list. */}
        <div className="flex flex-1 flex-col space-y-gap">
          <PageHeader
            showVanaLogotype
            heading="Your apps"
            color="iris"
            // description={
            //   <Text>
            //     {apps.length === 0
            //       ? "Your registered apps will appear here."
            //       : "Your registered apps."}
            //   </Text>
            // }
          />

          {/* -mx-1.5 */}
          <div className="flex min-h-0 flex-1 flex-col space-y-gap pt-gap">
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
                        "px-3 py-2.5 border-b",
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
                          truncate
                          className="max-w-[120px] group-hover:text-iris"
                        >
                          <BoxIcon className="size-[1.1em]" />
                          {app.name}
                        </Text>
                        <Text
                          intent="fine"
                          muted
                          withIcon
                          truncate
                          className="max-w-[160px] group-hover:text-foreground"
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
        </div>
      </PagePanel>
    </PageShell>
  );
}
