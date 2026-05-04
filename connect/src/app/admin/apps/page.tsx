"use client";

import { ArrowUpRightIcon, BoxIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { SettingsConfirmAction } from "@/components/elements/confirm-action";
import { PageHeader } from "@/components/elements/page-header";
import { Spinner } from "@/components/elements/spinner";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminFooterLinks } from "../_components/admin-footer-links";
import { AdminHeaderLinks } from "../_components/admin-header-links";
import {
  deleteAdminApp,
  listAdminApps,
  migrateLegacyAdminApps,
  type RegisteredAdminApp,
} from "../_lib/admin-apps-storage";
import { useAdminMasterKey } from "../_lib/use-admin-master-key";
import { resolveAdminAppsPageUiDebugState } from "./apps-page.ui-debug";

export default function AdminAppsPage() {
  const { getSignature, embeddedWalletAddress } = useAdminMasterKey();
  const [apps, setApps] = useState<RegisteredAdminApp[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!embeddedWalletAddress) return;
    let cancelled = false;
    void (async () => {
      try {
        const sig = await getSignature();
        // Best-effort migration of any legacy localStorage entries.
        await migrateLegacyAdminApps(sig).catch(() => undefined);
        const rows = await listAdminApps(sig);
        if (cancelled) return;
        // UI debug overrides (?appsDebug=1&appsScenario=...) still apply so
        // existing manual QA harnesses keep working.
        const resolved = resolveAdminAppsPageUiDebugState({ apps: rows }).apps;
        setApps(resolved);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embeddedWalletAddress, getSignature]);

  async function handleDelete(app: RegisteredAdminApp) {
    try {
      const sig = await getSignature();
      await deleteAdminApp(sig, app.id);
      setApps((current) => current.filter((entry) => entry.id !== app.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <PageShell actions={["dataConnect", "logout"]}>
      <PagePanel footer={<AdminFooterLinks />}>
        <AdminHeaderLinks showYourApps={false} />
        <div className="flex flex-1 flex-col space-y-gap">
          <PageHeader showVanaLogotype heading="Your apps" color="iris" />

          <div className="flex min-h-0 flex-1 flex-col space-y-gap pt-gap">
            <div className="rounded-button border flex-1">
              {status === "loading" ? (
                <Text intent="small" muted withIcon className="p-gap">
                  <Spinner className="size-[1.1em]" />
                  Loading apps…
                </Text>
              ) : status === "error" ? (
                <Text intent="small" color="destructive" className="p-gap">
                  {error ?? "Could not load apps."}
                </Text>
              ) : apps.length === 0 ? (
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
                        onAction={() => void handleDelete(app)}
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
