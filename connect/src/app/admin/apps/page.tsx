"use client";

import { ArrowUpRightIcon, BoxIcon } from "lucide-react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { VanaLogotype } from "@/components/icons/vana-logotype";
import { Text } from "@/components/typography/text";
import { cn } from "@/lib/utils";
import { AdminFooterLinks } from "../_components/admin-footer-links";
import { RegisterAnotherAppButton } from "../_components/register-another-app-button";
import { resolveAdminAppsPageUiDebugState } from "./apps-page.ui-debug";

export default function AdminAppsPage() {
  // UI debug quick usage (dev only):
  // - /admin/apps?appsDebug=1&appsScenario=empty
  // - /admin/apps?appsDebug=1&appsScenario=seven
  // - No appsDebug/appsScenario => real account state (no debug override).
  const ui = resolveAdminAppsPageUiDebugState({ apps: [] });

  return (
    <PageShell showBackButton={false} showLogoutButton>
      <PagePanel footer={<AdminFooterLinks />}>
        <div className="flex flex-1 flex-col space-y-small">
          <div className="space-y-5">
            <div className="space-y-2.5">
              <VanaLogotype height={13} className="text-iris" />
              <Text as="h1" intent="title">
                <span className="text-iris">Your apps</span>
              </Text>
            </div>
            <Text>
              Registered builder apps for this account will appear here.
            </Text>
          </div>

          {/* -mx-1.5 */}
          <div className="flex min-h-0 flex-1 flex-col space-y-gap">
            <div className="rounded-button border flex-1">
              {ui.apps.length === 0 ? (
                <Text intent="small" muted withIcon className="p-gap">
                  <BoxIcon className="size-[1.25em]" />
                  No apps registered yet.
                </Text>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {ui.apps.map((app) => (
                    <a
                      key={app.id}
                      href={app.url}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "group flex h-tab items-center justify-between gap-3",
                        "px-3 py-2.5 border-b last:border-b-0",
                        "transition-colors hover:bg-muted/40",
                      )}
                    >
                      <Text
                        intent="small"
                        color="foreground"
                        weight="medium"
                        withIcon
                        className="group-hover:text-iris"
                      >
                        <BoxIcon className="size-[1.1em]" />
                        {app.name}
                      </Text>
                      <Text
                        intent="fine"
                        muted
                        withIcon
                        className="truncate text-right group-hover:text-foreground"
                      >
                        {app.url}
                        <ArrowUpRightIcon
                          aria-hidden
                          className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        />
                      </Text>
                    </a>
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
