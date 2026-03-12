"use client";

import { CheckCircle2Icon, DatabaseIcon, ShieldCheckIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { Spinner } from "@/components/elements/spinner";
import { Text } from "@/components/typography/text";
import { useDashboard } from "./use-dashboard";

function formatScope(scope: string): string {
  // "instagram.ads" → "Instagram Ads"
  return scope
    .split(".")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function formatAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function DashboardClient() {
  const searchParams = useSearchParams();
  const serverUrl = searchParams.get("serverUrl") ?? "http://localhost:8080";
  const { data, loading, error } = useDashboard(serverUrl);

  return (
    <PageShell>
      <PagePanel className="text-left">
        <div className="space-y-8 w-full max-w-lg mx-auto py-8">
          <div>
            <Text as="h1" intent="title">
              Your Data
            </Text>
            <Text as="p" intent="large" dim>
              Data stored on your Personal Server
            </Text>
          </div>

          {loading && (
            <div className="flex items-center gap-2">
              <Spinner />
              <Text as="p" dim>
                Loading…
              </Text>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <Text as="p" color="destructive">
                {error}
              </Text>
            </div>
          )}

          {data && (
            <>
              {/* Connected Data Sources */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <DatabaseIcon className="size-4" />
                  <Text as="h2" intent="large" weight="semi">
                    Connected Data
                  </Text>
                </div>

                {data.dataScopes.length === 0 ? (
                  <Text as="p" dim>
                    No data connected yet.
                  </Text>
                ) : (
                  <div className="space-y-2">
                    {data.dataScopes.map((scope) => (
                      <div
                        key={scope.scope}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2Icon className="size-4 text-success-foreground" />
                          <Text as="span" weight="medium">
                            {formatScope(scope.scope)}
                          </Text>
                        </div>
                        {scope.collectedAt && (
                          <Text as="span" intent="small" muted>
                            {formatDate(scope.collectedAt)}
                          </Text>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Connected Apps */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="size-4" />
                  <Text as="h2" intent="large" weight="semi">
                    Connected Apps
                  </Text>
                </div>

                {data.grants.length === 0 ? (
                  <Text as="p" dim>
                    No apps connected yet.
                  </Text>
                ) : (
                  <div className="space-y-2">
                    {data.grants.map((grant) => (
                      <div
                        key={grant.id}
                        className="rounded-lg border p-3 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <Text as="span" weight="medium">
                            {grant.appName ??
                              formatAddress(grant.granteeAddress)}
                          </Text>
                          <Text as="span" intent="small" muted>
                            {grant.status}
                          </Text>
                        </div>
                        <Text as="p" intent="small" muted>
                          {grant.scopes.map(formatScope).join(", ")}
                        </Text>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </PagePanel>
    </PageShell>
  );
}
