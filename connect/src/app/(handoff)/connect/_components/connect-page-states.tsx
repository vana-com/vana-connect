"use client";

import {
  ArrowUpRightIcon,
  CheckCircle2Icon,
  GlobeIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { useEffect } from "react";
import { APP_ROUTES } from "@/app/routes";
import type { EmbrowseStatus } from "@/app/_lib/use-embrowse";
import { Spinner } from "@/components/elements/spinner";
import { Text } from "@/components/typography/text";
import { ButtonArrow } from "@/components/ui/button";
import type { ConnectAppMetadata } from "../_lib/app-registry";
import {
  ConnectLaunchSection,
  DefaultDownloadSecondary,
} from "./connect-page-actions";
import { ConnectStateFrame } from "./connect-page-frame";

function readNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveRequestedDataLabel(requestedDataLabel: string | null): string {
  const normalized = readNonEmptyString(requestedDataLabel);
  if (!normalized) return "data";
  return `${normalized.replace(/\s+data$/i, "")} data`;
}

export function ConnectMissingSessionState({
  app,
}: {
  app: ConnectAppMetadata;
}) {
  return (
    <ConnectStateFrame
      app={app}
      title={
        <Text
          as="h1"
          intent="title"
          color="destructive"
          withIcon
          align="center"
        >
          <XIcon className="text-destructive-foreground" />
          Missing session
        </Text>
      }
      subtitle={
        <Text as="h1" intent="xlarge" dim balance>
          This page requires a valid session. Please start from your
          application.
        </Text>
      }
    />
  );
}

export function ConnectNoSessionFallbackState({
  app,
}: {
  app: ConnectAppMetadata;
}) {
  return (
    <ConnectStateFrame
      app={app}
      title={
        <Text as="h1" intent="title" align="center">
          Continue in DataConnect
        </Text>
      }
      subtitle={
        <Text as="h1" intent="xlarge" dim balance>
          No active handoff session found. You can still open DataConnect and
          start from there.
        </Text>
      }
      content={
        <ConnectLaunchSection
          primaryAction={{
            kind: "link",
            href: APP_ROUTES.downloadDataConnect,
            label: "Open DataConnect downloads",
          }}
          secondaryContent={
            <Text as="p" intent="small" muted>
              If another app initiated Connect, relaunch from that app to resume
              with a session.
            </Text>
          }
        />
      }
    />
  );
}

export function ConnectLoadingState({ app }: { app: ConnectAppMetadata }) {
  return (
    <ConnectStateFrame
      app={app}
      title={
        <Text as="h1" intent="title" withIcon align="center">
          <Spinner />
          Preparing...
        </Text>
      }
      subtitle={
        <Text as="h1" intent="xlarge" className="text-transparent" aria-hidden>
          SPACER
        </Text>
      }
    />
  );
}

export function ConnectReadyState({
  app,
  requestedDataLabel,
  deepLinkUrl,
  downloadDataConnectHref,
  isLocalServerAuthFromDataConnect = false,
}: {
  app: ConnectAppMetadata;
  requestedDataLabel: string | null;
  deepLinkUrl: string;
  downloadDataConnectHref: string;
  isLocalServerAuthFromDataConnect?: boolean;
}) {
  const isHttpsRedirect = deepLinkUrl.startsWith("https://");
  const resolvedRequestedDataLabel =
    resolveRequestedDataLabel(requestedDataLabel);

  useEffect(() => {
    if (isHttpsRedirect) {
      window.location.assign(deepLinkUrl);
    }
  }, [isHttpsRedirect, deepLinkUrl]);

  if (isHttpsRedirect) {
    return (
      <ConnectStateFrame
        app={app}
        title={
          <Text as="h1" intent="title" withIcon align="center">
            <Spinner />
            Authorizing…
          </Text>
        }
        subtitle={
          <Text as="h1" intent="xlarge" dim>
            Redirecting back to your application.
          </Text>
        }
      />
    );
  }

  return (
    <ConnectStateFrame
      app={app}
      title={
        <Text as="h1" intent="title">
          {isLocalServerAuthFromDataConnect
            ? "Sign in with DataConnect"
            : `${app.displayName} wants access to your ${resolvedRequestedDataLabel}`}
        </Text>
      }
      subtitle={
        <Text as="p" intent="large" dim balance>
          {isLocalServerAuthFromDataConnect
            ? "Authorize and start your Personal Server on DataConnect"
            : "Review and approve this request in DataConnect"}
        </Text>
      }
      content={
        <ConnectLaunchSection
          primaryAction={{
            kind: "deep-link",
            href: deepLinkUrl,
            label: isLocalServerAuthFromDataConnect
              ? "Continue in DataConnect"
              : "Open DataConnect",
          }}
          secondaryContent={
            isLocalServerAuthFromDataConnect ? null : (
              <DefaultDownloadSecondary href={downloadDataConnectHref} />
            )
          }
        />
      }
    />
  );
}

export function ConnectEmbrowseState({
  app,
  embrowseStatus,
  progressText,
  errorMessage,
  onOpenEmbrowse,
  onRetry,
}: {
  app: ConnectAppMetadata;
  embrowseStatus: EmbrowseStatus;
  progressText: string | null;
  errorMessage: string | null;
  onOpenEmbrowse: () => void;
  onRetry: () => void;
}) {
  const statusLabel =
    embrowseStatus === "idle"
      ? "Ready to connect your data"
      : embrowseStatus === "loading"
        ? "Opening…"
        : embrowseStatus === "ready"
          ? "Waiting for you in the popup…"
          : embrowseStatus === "scraping"
            ? (progressText ?? "Collecting data…")
            : embrowseStatus === "error"
              ? (errorMessage ?? "Something went wrong")
              : embrowseStatus === "cancelled"
                ? "Cancelled"
                : "Done";

  return (
    <ConnectStateFrame
      app={app}
      title={
        <Text as="h1" intent="title" align="center">
          Connect your data
        </Text>
      }
      subtitle={
        <Text as="p" intent="large" dim balance>
          {statusLabel}
        </Text>
      }
      content={
        embrowseStatus === "idle" ? (
          <ConnectLaunchSection
            primaryAction={{
              kind: "button",
              onClick: onOpenEmbrowse,
              label: "Connect now",
              leftIcon: <GlobeIcon />,
            }}
          />
        ) : embrowseStatus === "error" || embrowseStatus === "cancelled" ? (
          <ConnectLaunchSection
            primaryAction={{
              kind: "button",
              onClick: onRetry,
              label: "Try again",
              leftIcon: <RotateCcwIcon />,
            }}
          />
        ) : embrowseStatus === "loading" ||
          embrowseStatus === "ready" ||
          embrowseStatus === "scraping" ? (
          <div className="flex justify-center">
            <Spinner />
          </div>
        ) : null
      }
    />
  );
}

export function ConnectCompleteState({
  app,
  completedScopes,
  appUrl,
}: {
  app: ConnectAppMetadata;
  completedScopes: string[];
  appUrl: string | null;
}) {
  return (
    <ConnectStateFrame
      app={app}
      title={
        <Text as="h1" intent="title" withIcon align="center">
          <CheckCircle2Icon className="text-success-foreground" />
          Data connected
        </Text>
      }
      subtitle={
        <Text as="p" intent="large" dim balance>
          {completedScopes.length > 0
            ? `Connected: ${completedScopes.join(", ")}`
            : "Your data has been securely stored on your Personal Server."}
        </Text>
      }
      content={
        <div className="space-y-3">
          {appUrl ? (
            <ConnectLaunchSection
              primaryAction={{
                kind: "link",
                href: appUrl,
                label: `Return to ${app.displayName}`,
              }}
              secondaryContent={
                <Text as="p">
                  or{" "}
                  <a
                    href={APP_ROUTES.dashboard}
                    className="link hover:text-foreground"
                  >
                    Manage account
                  </a>
                </Text>
              }
            />
          ) : (
            <ConnectLaunchSection
              primaryAction={{
                kind: "link",
                href: APP_ROUTES.dashboard,
                label: "Manage your data",
              }}
            />
          )}
        </div>
      }
    />
  );
}

export function ConnectErrorState({
  app,
  isDebugMode,
  error,
  supportHref,
}: {
  app: ConnectAppMetadata;
  isDebugMode: boolean;
  error: string | null;
  supportHref: string;
}) {
  return (
    <ConnectStateFrame
      app={app}
      title={
        <Text
          as="h1"
          intent="title"
          color="destructive"
          withIcon
          align="center"
        >
          <XIcon className="text-destructive-foreground" />
          Something went wrong
        </Text>
      }
      subtitle={
        <Text as="h1" intent="xlarge" dim>
          {isDebugMode
            ? (error ?? "Failed during the authorization phase.")
            : (error ?? "We couldn't configure your connection.")}
        </Text>
      }
      content={
        <ConnectLaunchSection
          primaryAction={{
            kind: "button",
            label: "Reload and try again",
            onClick: () => window.location.reload(),
            leftIcon: <RotateCcwIcon />,
          }}
          secondaryContent={
            <Text as="p">
              Need help?{" "}
              <a
                href={supportHref}
                target="_blank"
                rel="noopener noreferrer"
                className="link hover:text-foreground"
              >
                Contact support&nbsp;
                <ButtonArrow
                  icon={ArrowUpRightIcon}
                  className="size-em inline mt-[-0.125em]"
                />
              </a>
            </Text>
          }
        />
      }
    />
  );
}
