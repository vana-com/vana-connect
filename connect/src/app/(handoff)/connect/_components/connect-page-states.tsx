"use client";

import { ArrowUpRightIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { APP_ROUTES } from "@/app/routes";
import { Spinner } from "@/components/elements/spinner";
import { Text } from "@/components/typography/text";
import { ButtonArrow } from "@/components/ui/button";
import type { ConnectAppMetadata } from "../_lib/app-registry";
import { resolveConnectReadyMode } from "../_lib/ready-mode";
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
  isMobile = false,
}: {
  app: ConnectAppMetadata;
  requestedDataLabel: string | null;
  deepLinkUrl: string;
  downloadDataConnectHref: string;
  isLocalServerAuthFromDataConnect?: boolean;
  isMobile?: boolean;
}) {
  const isHttpsRedirect = deepLinkUrl.startsWith("https://");
  const resolvedRequestedDataLabel =
    resolveRequestedDataLabel(requestedDataLabel);
  const mode = resolveConnectReadyMode({
    isHttpsRedirect,
    isMobile,
    isLocalServerAuthFromDataConnect,
  });

  useEffect(() => {
    if (isHttpsRedirect) {
      window.location.assign(deepLinkUrl);
    }
  }, [isHttpsRedirect, deepLinkUrl]);

  if (mode === "https-redirect") {
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

  // Mobile on the vana:// path: the scheme is desktop-only, so the deep-link
  // button opens the wrong app or nothing (BUI-449). Offer a cross-device
  // hand-off instead of a dead-end. `requestedDataLabel`/title are unchanged so
  // the user still sees what they're approving.
  if (mode === "mobile-handoff") {
    return (
      <ConnectStateFrame
        app={app}
        title={
          <Text as="h1" intent="title">
            {`${app.displayName} wants access to your ${resolvedRequestedDataLabel}`}
          </Text>
        }
        subtitle={
          <Text as="p" intent="large" dim balance>
            Approving this needs DataConnect, which runs on a computer. Copy
            this link, open it on your desktop, and finish there.
          </Text>
        }
        content={<ConnectMobileHandoffContent />}
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

function ConnectMobileHandoffContent() {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    const link = typeof window === "undefined" ? "" : window.location.href;
    const clipboard =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (clipboard?.writeText) {
      clipboard.writeText(link).then(
        () => setCopied(true),
        () => setCopied(false),
      );
    }
  }, []);

  // No "Get DataConnect" download link here: DataConnect is desktop-only, so
  // pointing a phone at a desktop installer is a dead end (BUI-449). The hand-off
  // is "take this link to a computer", not "install something here".
  return (
    <ConnectLaunchSection
      primaryAction={{
        kind: "button",
        onClick: onCopy,
        label: copied ? "Link copied — open it on your computer" : "Copy link",
      }}
      secondaryContent={
        <Text as="p" intent="small" muted>
          Send the link to yourself and open it on a computer to finish.
        </Text>
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
