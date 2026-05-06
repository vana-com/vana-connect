"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import type { AccountAccessSummary } from "@/app/api/account/access/summary";
import { APP_ROUTES } from "@/app/routes";
import { PageHeader } from "@/components/elements/page-header";
import { Text } from "@/components/typography/text";
import { formatStatusLabel } from "@/lib/auth/action-display";
import { vanaFetch } from "@/lib/auth/vana-fetch";

type LoadState =
  | { status: "loading" }
  | { status: "logged-out" }
  | { status: "error"; message: string }
  | { status: "loaded"; summary: AccountAccessSummary };
type MutationState =
  | { kind: "idle" }
  | { kind: "revoke"; id: string }
  | { kind: "disconnect"; clientId: string };

export function AccountAccessPageClient() {
  const { ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const sessionBridgeAttemptedRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadAccountAccess() {
      if (!ready) return;

      try {
        let response = await vanaFetch("/api/account/access", {
          credentials: "include",
          cache: "no-store",
        });
        if (!active) return;
        if (response.status === 401) {
          if (
            authenticated &&
            identityToken &&
            !sessionBridgeAttemptedRef.current
          ) {
            sessionBridgeAttemptedRef.current = true;
            // Direct fetch — `/api/auth/session` is the bootstrap endpoint
            // itself and must not go through vanaFetch.
            const sessionResponse = await fetch("/api/auth/session", {
              method: "POST",
              headers: { authorization: `Bearer ${identityToken}` },
              cache: "no-store",
            });
            if (!active) return;
            if (!sessionResponse.ok) {
              setState({
                status: "error",
                message: "Could not establish account session.",
              });
              return;
            }
            response = await vanaFetch("/api/account/access", {
              credentials: "include",
              cache: "no-store",
            });
            if (!active) return;
            if (response.status !== 401) {
              sessionBridgeAttemptedRef.current = false;
            }
          }
        }
        if (response.status === 401) {
          if (authenticated && !identityToken) return;
          setState({ status: "logged-out" });
          return;
        }
        if (!response.ok) {
          setState({
            status: "error",
            message: "Could not load account access.",
          });
          return;
        }
        setState({
          status: "loaded",
          summary: (await response.json()) as AccountAccessSummary,
        });
      } catch {
        if (active) {
          setState({
            status: "error",
            message: "Could not load account access.",
          });
        }
      }
    }
    void loadAccountAccess();
    return () => {
      active = false;
    };
  }, [authenticated, identityToken, ready]);

  const isLoggedIn = state.status === "loaded";

  return (
    <PageShell
      actions={isLoggedIn ? ["dataConnect", "logout"] : []}
      contentPlacement="start"
    >
      <PagePanel className="max-w-[920px]">
        {state.status === "loading" && <LoadingState />}
        {state.status === "logged-out" && <LoggedOutState />}
        {state.status === "error" && <ErrorState message={state.message} />}
        {state.status === "loaded" && (
          <LoadedState
            summary={state.summary}
            onSummaryChange={(summary) =>
              setState({ status: "loaded", summary })
            }
          />
        )}
      </PagePanel>
    </PageShell>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <PageHeader
        showVanaLogotype
        heading="Apps & data access"
        description={
          <Text color="foregroundDim">Loading account session...</Text>
        }
      />
    </div>
  );
}

function LoggedOutState() {
  return (
    <div className="space-y-6">
      <PageHeader
        showVanaLogotype
        heading="Sign in to view account access"
        description={
          <Text color="foregroundDim">
            Sign in to see linked providers, wallets, connected apps, access
            requests, and recent consent activity for your Vana account.
          </Text>
        }
      />
      <a
        href={APP_ROUTES.login}
        className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
      >
        Sign in
      </a>
      <Text intent="fine" color="mutedForeground">
        Return to this page after sign-in if the login flow does not redirect
        back automatically.
      </Text>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="space-y-6">
      <PageHeader
        showVanaLogotype
        heading="Apps & data access"
        description={<Text color="foregroundDim">{message}</Text>}
      />
    </div>
  );
}

function LoadedState({
  summary,
  onSummaryChange,
}: {
  summary: AccountAccessSummary;
  onSummaryChange: (summary: AccountAccessSummary) => void;
}) {
  const [mutation, setMutation] = useState<MutationState>({ kind: "idle" });
  const [mutationError, setMutationError] = useState<string | null>(null);

  async function mutateAccess(url: string, errorMessage: string) {
    setMutationError(null);
    const response = await vanaFetch(url, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(errorMessage);
    const body = (await response.json()) as { summary?: AccountAccessSummary };
    if (!body.summary) throw new Error(errorMessage);
    onSummaryChange(body.summary);
  }

  async function revokeGrant(id: string) {
    if (mutation.kind !== "idle") return;
    setMutation({ kind: "revoke", id });
    try {
      await mutateAccess(
        `/api/account/access/grants/${encodeURIComponent(id)}/revoke`,
        "Could not revoke grant. Try again.",
      );
    } catch {
      setMutationError("Could not revoke grant. Try again.");
    } finally {
      setMutation({ kind: "idle" });
    }
  }

  async function disconnectApp(clientId: string) {
    if (mutation.kind !== "idle") return;
    setMutation({ kind: "disconnect", clientId });
    try {
      await mutateAccess(
        `/api/account/access/apps/${encodeURIComponent(clientId)}/disconnect`,
        "Could not disconnect app. Try again.",
      );
    } catch {
      setMutationError("Could not disconnect app. Try again.");
    } finally {
      setMutation({ kind: "idle" });
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        showVanaLogotype
        heading="Apps & data access"
        description={
          <Text color="foregroundDim">
            Review the identity providers, wallets, connected apps, access
            requests, and consent activity associated with this account.
          </Text>
        }
      />

      <Section title="Current account">
        <DetailGrid
          rows={[
            ["vana_user_id", summary.account.vana_user_id],
            ["Display name", summary.account.display_name ?? "Not set"],
            ["Created", formatDate(summary.account.created_at)],
          ]}
        />
      </Section>

      <Section title="Linked providers">
        {summary.provider_links.length > 0 ? (
          summary.provider_links.map((link) => (
            <Card key={`${link.provider}:${link.provider_subject}`}>
              <Text weight="medium">{link.provider}</Text>
              <Text color="foregroundDim">
                {link.email ?? "No email"} | Subject {link.provider_subject}
              </Text>
              <Text intent="fine" color="mutedForeground">
                Created {formatDate(link.created_at)}
              </Text>
            </Card>
          ))
        ) : (
          <EmptyState>No linked provider evidence found.</EmptyState>
        )}
      </Section>

      <Section title="Linked wallets">
        {summary.linked_wallets.length > 0 ? (
          summary.linked_wallets.map((wallet) => (
            <Card key={`${wallet.chain}:${wallet.address}`}>
              <Text weight="medium">
                {wallet.chain} {wallet.primary ? "primary" : "linked"} wallet
              </Text>
              <Text color="foregroundDim">{wallet.address}</Text>
              <Text intent="fine" color="mutedForeground">
                {wallet.provider} | Verified{" "}
                {wallet.verified_at
                  ? formatDate(wallet.verified_at)
                  : "not recorded"}
              </Text>
            </Card>
          ))
        ) : (
          <EmptyState>No linked wallets found.</EmptyState>
        )}
      </Section>

      <Section title="Connected apps">
        {summary.connected_apps.length > 0 ? (
          summary.connected_apps.map((app) => (
            <Card key={app.client_id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Text weight="medium">{app.display_name}</Text>
                  <Text color="foregroundDim">{app.client_id}</Text>
                </div>
                {app.can_disconnect && (
                  <ActionButton
                    disabled={mutation.kind !== "idle"}
                    onClick={() => void disconnectApp(app.client_id)}
                  >
                    {mutation.kind === "disconnect" &&
                    mutation.clientId === app.client_id
                      ? "Disconnecting..."
                      : "Disconnect app"}
                  </ActionButton>
                )}
              </div>
              <Text intent="fine" color="mutedForeground">
                {app.active_grant_count > 0
                  ? `${app.active_grant_count} active grants`
                  : "No active grants"}{" "}
                | {app.total_request_count} requests | {app.event_count} events
                | Last {formatDate(app.last_seen_at)}
              </Text>
              {app.last_revoked_at && (
                <Text intent="fine" color="mutedForeground">
                  Last revoked {formatDate(app.last_revoked_at)}
                </Text>
              )}
            </Card>
          ))
        ) : (
          <EmptyState>No connected apps found for this account.</EmptyState>
        )}
      </Section>

      <Section title="Access requests and grants">
        {mutationError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {mutationError}
          </div>
        )}
        {summary.access_requests.length > 0 ? (
          summary.access_requests.map((request) => (
            <Card key={request.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Text weight="medium">{request.app_name}</Text>
                  <Text color="foregroundDim">{request.action_label}</Text>
                </div>
                <Badge>{formatStatusLabel(request.status)}</Badge>
              </div>
              <RequestedDataFacts
                appName={request.app_name}
                display={request.requested_data_display}
              />
              <Text intent="fine" color="mutedForeground">
                Created {formatDate(request.created_at)} | Decided{" "}
                {request.decided_at
                  ? formatDate(request.decided_at)
                  : "not yet"}{" "}
                | Request expires {formatDate(request.expires_at)}
              </Text>
              {request.revoked_at && (
                <Text intent="fine" color="mutedForeground">
                  Revoked {formatDate(request.revoked_at)}
                </Text>
              )}
              <Text intent="fine" color="mutedForeground">
                {request.execution_mode} execution | {request.result_mode}{" "}
                result
                {request.result_state ? ` | ${request.result_state}` : ""}
              </Text>
              {request.can_revoke ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <ActionButton
                    disabled={mutation.kind !== "idle"}
                    onClick={() => void revokeGrant(request.id)}
                  >
                    {mutation.kind === "revoke" && mutation.id === request.id
                      ? "Revoking..."
                      : "Revoke grant"}
                  </ActionButton>
                  {request.revoke_note && (
                    <Text intent="fine" color="mutedForeground">
                      {request.revoke_note}
                    </Text>
                  )}
                </div>
              ) : (
                request.revocation_note && (
                  <Text intent="fine" color="mutedForeground">
                    {request.revocation_note}
                  </Text>
                )
              )}
            </Card>
          ))
        ) : (
          <EmptyState>No access requests found for this account.</EmptyState>
        )}
      </Section>

      <Section title="Activity">
        {summary.activity.length > 0 ? (
          summary.activity.map((event) => (
            <Card key={event.id}>
              <Text weight="medium">
                {formatEventLabel(event.event_type)} | {event.app_name}
              </Text>
              <Text color="foregroundDim">{event.action_label}</Text>
              <RequestedDataFacts
                appName={event.app_name}
                display={event.requested_data_display}
              />
              <Text intent="fine" color="mutedForeground">
                {formatDate(event.occurred_at)}
              </Text>
              {event.revocation_note && (
                <Text intent="fine" color="mutedForeground">
                  {event.revocation_note}
                </Text>
              )}
            </Card>
          ))
        ) : (
          <EmptyState>No consent activity found for this account.</EmptyState>
        )}
      </Section>
    </div>
  );
}

function RequestedDataFacts({
  appName,
  display,
}: {
  appName: string;
  display: AccountAccessSummary["access_requests"][number]["requested_data_display"];
}) {
  return (
    <dl className="mt-3 grid gap-2 rounded-lg bg-muted/35 p-3">
      <FactRow label="Data source" value={display.data_source} />
      <FactRow label="Data included" value={display.data_types} />
      <FactRow
        label="Purpose"
        value={display.purpose}
        note={`Provided by ${appName}.`}
      />
      <FactRow label="Access lasts" value={display.access_duration} />
    </dl>
  );
}

function FactRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt>
        <Text intent="fine" color="mutedForeground">
          {label}
        </Text>
      </dt>
      <dd>
        <Text intent="small">{value}</Text>
        {note && (
          <Text intent="fine" color="mutedForeground">
            {note}
          </Text>
        )}
      </dd>
    </div>
  );
}

function formatEventLabel(eventType: string): string {
  switch (eventType) {
    case "action.requested":
      return "Requested access";
    case "action.approved":
      return "Approved access";
    case "action.denied":
      return "Denied access";
    case "action.completed":
    case "action.exchanged":
      return "Used access";
    case "action.expired":
      return "Expired request";
    case "action.revoked":
      return "Revoked access";
    default:
      return eventType;
  }
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <Text intent="eyebrow" color="mutedForeground">
        {title}
      </Text>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {children}
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <Text
      intent="fine"
      color="mutedForeground"
      className="shrink-0 rounded-full border border-border px-2 py-1"
    >
      {children}
    </Text>
  );
}

function DetailGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <Card>
      <dl className="grid gap-3 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-words text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-4">
      <Text color="foregroundDim">{children}</Text>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
