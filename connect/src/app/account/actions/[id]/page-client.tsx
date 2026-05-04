"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageHeader } from "@/components/elements/page-header";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import {
  formatActionLabel,
  formatRequestedDataDisplay,
  formatStatusLabel,
} from "@/lib/auth/action-display";

type ActionRequestDetails = {
  action_request_id: string;
  status: "pending" | "approved" | "denied" | "expired" | "consumed";
  client: {
    client_id: string;
    display_name: string;
  };
  action_type: string;
  execution_mode: string;
  result_mode: string;
  requested_data: {
    connector?: string;
    scopes?: string[];
    purposeCode?: string;
    purposeDescription?: string;
    accessMode?: string;
  };
  display_metadata: {
    title?: string;
    description?: string;
    iconUrl?: string;
  } | null;
  expires_at: string;
};

type LoadState =
  | { kind: "idle" | "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; details: ActionRequestDetails };

export function ActionRequestPageClient({
  actionRequestId,
}: {
  actionRequestId: string;
}) {
  const searchParams = useSearchParams();
  const { ready, authenticated, login } = usePrivy();
  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });
  const [decisionState, setDecisionState] = useState<
    "idle" | "approving" | "denying"
  >("idle");
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;

    const controller = new AbortController();
    setLoadState({ kind: "loading" });
    fetch(`/api/account/actions/${encodeURIComponent(actionRequestId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(
            body.error?.message ?? "Could not load this action request.",
          );
        }
        setLoadState({ kind: "ready", details: body });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load this action request.",
        });
      });

    return () => controller.abort();
  }, [actionRequestId, authenticated, ready]);

  const decide = useCallback(
    async (decision: "approved" | "denied") => {
      if (decisionState !== "idle") return;

      setDecisionError(null);
      setDecisionState(decision === "approved" ? "approving" : "denying");
      try {
        const state = searchParams.get("state");
        const response = await fetch(
          `/api/account/actions/${encodeURIComponent(actionRequestId)}/decision`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              decision,
              ...(state !== null ? { state } : {}),
            }),
          },
        );
        const body = await response.json();
        if (!response.ok) {
          throw new Error(
            body.error?.message ?? "Could not submit this decision.",
          );
        }
        if (typeof body.redirect_url === "string" && body.redirect_url) {
          window.location.assign(body.redirect_url);
        }
      } catch (error) {
        setDecisionError(
          error instanceof Error
            ? error.message
            : "Could not submit this decision.",
        );
        setDecisionState("idle");
      }
    },
    [actionRequestId, decisionState, searchParams],
  );

  if (!ready) {
    return (
      <PageShell>
        <PagePanel>
          <PageLoadingState showVanaLogotype message="Preparing request..." />
        </PagePanel>
      </PageShell>
    );
  }

  if (!authenticated) {
    return (
      <PageShell>
        <PagePanel>
          <div className="space-y-small">
            <PageHeader
              showVanaLogotype
              color="iris"
              heading="Review data access"
              description={
                <Text>
                  Sign in to Vana to review this app request before any action
                  is approved.
                </Text>
              }
            />
            <Button type="button" onClick={() => login()} fullWidth>
              Sign in to review
            </Button>
          </div>
        </PagePanel>
      </PageShell>
    );
  }

  if (loadState.kind === "idle" || loadState.kind === "loading") {
    return (
      <PageShell>
        <PagePanel>
          <PageLoadingState showVanaLogotype message="Loading request..." />
        </PagePanel>
      </PageShell>
    );
  }

  if (loadState.kind === "error") {
    return (
      <PageShell>
        <PagePanel>
          <div className="space-y-small">
            <PageHeader
              showVanaLogotype
              color="foreground"
              heading="Request unavailable"
              description={<Text>{loadState.message}</Text>}
            />
          </div>
        </PagePanel>
      </PageShell>
    );
  }

  if (loadState.kind !== "ready") {
    return null;
  }

  const details = loadState.details;
  const displayStatus =
    details.status === "pending" && isExpired(details.expires_at)
      ? "expired"
      : details.status;
  const pending = displayStatus === "pending";
  const title =
    details.display_metadata?.title ??
    `${details.client.display_name} requests access`;
  const description =
    details.display_metadata?.description ??
    `Review what ${details.client.display_name} is requesting before continuing.`;
  const requestedDataDisplay = formatRequestedDataDisplay(
    details.requested_data,
  );

  return (
    <PageShell>
      <PagePanel>
        <div className="space-y-small">
          <PageHeader
            showVanaLogotype
            color="iris"
            heading={title}
            description={<Text>{description}</Text>}
          />

          <dl className="space-y-3 rounded-squish bg-muted/40 p-4">
            <DetailRow label="App" value={details.client.display_name} />
            <DetailRow
              label="Request"
              value={formatActionLabel(details.action_type)}
            />
            <DetailRow
              label="Data source"
              value={requestedDataDisplay.data_source}
            />
            <DetailRow
              label="Data included"
              value={requestedDataDisplay.data_types}
            />
            <DetailRow
              label="Purpose"
              value={requestedDataDisplay.purpose}
              note={`Provided by ${details.client.display_name}.`}
            />
            <DetailRow
              label="Access lasts"
              value={requestedDataDisplay.access_duration}
            />
            <DetailRow
              label="Status"
              value={formatStatusLabel(displayStatus)}
            />
            <DetailRow
              label="Review by"
              value={formatDate(details.expires_at)}
            />
          </dl>

          {!pending && (
            <Text color="mutedForeground">
              This request is no longer pending. Return to the requesting app
              and start again if needed.
            </Text>
          )}

          {decisionError && (
            <Text as="p" color="destructive" aria-live="polite">
              {decisionError}
            </Text>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              disabled={!pending || decisionState !== "idle"}
              onClick={() => decide("denied")}
            >
              {decisionState === "denying" ? "Denying..." : "Deny"}
            </Button>
            <Button
              type="button"
              variant="iris"
              disabled={!pending || decisionState !== "idle"}
              onClick={() => decide("approved")}
            >
              {decisionState === "approving" ? "Approving..." : "Approve"}
            </Button>
          </div>
        </div>
      </PagePanel>
    </PageShell>
  );
}

function DetailRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3">
      <dt>
        <Text intent="small" color="mutedForeground">
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function isExpired(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}
