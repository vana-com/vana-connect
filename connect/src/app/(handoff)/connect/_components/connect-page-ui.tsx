"use client";

import {
  ArrowRightIcon,
  ArrowRightLeftIcon,
  ArrowUpRightIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { APP_ROUTES } from "@/app/routes";
import { Spinner } from "@/components/elements/spinner";
import { DcIcon } from "@/components/icons/dc-icon2";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { VanaV } from "@/components/icons/vana-v";
import { Text } from "@/components/typography/text";
import { Button, ButtonArrow } from "@/components/ui/button";
import type { resolveConnectApp } from "../_lib/app-registry";

type ConnectApp = ReturnType<typeof resolveConnectApp>;

// Lock panel internals to a fixed vertical budget across all states so
// subtitle wraps (e.g. "missing session") do not re-center the whole panel.
const CONNECT_HEADER_BLOCK_HEIGHT = 130;
const CONNECT_STATE_BLOCK_GAP = 32;
const CONNECT_BODY_BLOCK_HEIGHT = 101;
// Reserve footer space to prevent state-switch jump.
const CONNECT_PANEL_FOOTER_SPACER_HEIGHT = 20;

export function ConnectFooterSpacer() {
  return (
    <div
      className="w-full"
      style={{ height: `${CONNECT_PANEL_FOOTER_SPACER_HEIGHT}px` }}
      aria-hidden
    />
  );
}

export function ConnectPanelFooter() {
  return (
    <div className="flex flex-col items-center">
      <Text as="p" intent="small" align="center" muted>
        Interested in building apps on Vana?{" "}
        <Link href={APP_ROUTES.admin} className="link hover:text-foreground">
          Learn more
          <ArrowRightIcon aria-hidden className="inline size-[0.9em] ml-px" />
        </Link>
      </Text>
      <ConnectFooterSpacer />
    </div>
  );
}

export function ConnectMissingSessionState({ app }: { app: ConnectApp }) {
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

export function ConnectNoSessionFallbackState({ app }: { app: ConnectApp }) {
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
          buttonLabel="Open DataConnect downloads"
          onButtonClick={() => {
            window.location.assign(APP_ROUTES.downloadDataConnect);
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

export function ConnectLoadingState({ app }: { app: ConnectApp }) {
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
  deepLinkUrl,
  downloadDataConnectHref,
}: {
  app: ConnectApp;
  deepLinkUrl: string;
  downloadDataConnectHref: string;
}) {
  return (
    <ConnectStateFrame
      app={app}
      title={
        <Text as="h1" intent="title">
          You don&apos;t have any data.
        </Text>
      }
      subtitle={
        <Text as="h1" intent="xlarge" dim>
          To connect your data, download DataConnect.
        </Text>
      }
      content={
        <ConnectLaunchSection
          deepLinkUrl={deepLinkUrl}
          downloadDataConnectHref={downloadDataConnectHref}
          buttonLabel="Launch DataConnect"
        />
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
  app: ConnectApp;
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
          buttonLabel="Reload and try again"
          onButtonClick={() => window.location.reload()}
          primaryLeftIcon={<RotateCcwIcon />}
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

function ConnectStateFrame({
  app,
  title,
  subtitle,
  content,
}: {
  app: ConnectApp;
  title: ReactNode;
  subtitle?: ReactNode;
  content?: ReactNode;
}) {
  return (
    <div>
      {/* Fixed frame: 130 + 32 + 101. Keep this invariant unless all states are re-measured. */}
      <div
        className="flex items-center justify-center"
        style={{ height: `${CONNECT_HEADER_BLOCK_HEIGHT}px` }}
      >
        <ConnectStateHeader app={app} title={title} subtitle={subtitle} />
      </div>
      <div aria-hidden style={{ height: `${CONNECT_STATE_BLOCK_GAP}px` }} />
      <div
        className="flex items-start justify-center"
        style={{ height: `${CONNECT_BODY_BLOCK_HEIGHT}px` }}
      >
        {content ?? <div className="h-full" aria-hidden />}
      </div>
    </div>
  );
}

function ConnectStateHeader({
  app,
  title,
  subtitle,
}: {
  app: ConnectApp;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="space-y-gap">
      <div className="flex items-center justify-center gap-3">
        <ConnectSourceAppIcon
          key={`${app.displayName}-${app.iconUrls.join("|")}`}
          app={app}
        />
        <ArrowRightLeftIcon className="size-5.5" />
        <PlatformIcon
          iconName="Vana"
          Icon={VanaV}
          size={44}
          inset={10}
          className="bg-iris-surface text-iris"
        />
      </div>
      <div className="space-y-1.5">
        {title}
        {subtitle}
      </div>
    </div>
  );
}

function ConnectSourceAppIcon({ app }: { app: ConnectApp }) {
  const [iconIndex, setIconIndex] = useState(0);
  const activeIconUrl = app.iconUrls.at(iconIndex);

  return (
    <PlatformIcon
      iconName={app.displayName}
      imageSrc={activeIconUrl}
      imageAlt={`${app.displayName} icon`}
      fallbackLabel={app.fallbackLabel}
      size={44}
      inset={0}
      style={{ backgroundColor: app.iconBg, color: app.iconFg }}
      onImageError={() => {
        setIconIndex((current) => current + 1);
      }}
    />
  );
}

function ConnectLaunchSection({
  deepLinkUrl,
  downloadDataConnectHref,
  buttonLabel,
  onButtonClick,
  primaryLeftIcon,
  secondaryContent,
}: {
  deepLinkUrl?: string;
  downloadDataConnectHref?: string;
  buttonLabel: string;
  onButtonClick?: () => void;
  primaryLeftIcon?: ReactNode;
  secondaryContent?: ReactNode;
}) {
  const shouldShowLaunchIcon = Boolean(deepLinkUrl);
  const shouldShowArrow = Boolean(deepLinkUrl);

  return (
    <div className="lg:w-3/4 mx-auto space-y-gap">
      <ConnectPrimaryButton
        deepLinkUrl={deepLinkUrl}
        onClick={onButtonClick}
        label={buttonLabel}
        leftIcon={primaryLeftIcon}
        showLaunchIcon={shouldShowLaunchIcon}
        showArrow={shouldShowArrow}
      />
      {secondaryContent ?? (
        <Text as="p">
          Don&apos;t have it?{" "}
          <Link
            href={downloadDataConnectHref ?? APP_ROUTES.downloadDataConnect}
            className="link hover:text-foreground"
          >
            Download DataConnect&nbsp;
            <ButtonArrow
              icon={ArrowRightIcon}
              className="size-em inline mt-[-0.125em]"
            />
          </Link>
        </Text>
      )}
    </div>
  );
}

function ConnectPrimaryButton({
  deepLinkUrl,
  onClick,
  label,
  leftIcon,
  showLaunchIcon,
  showArrow,
}: {
  deepLinkUrl?: string;
  onClick?: () => void;
  label: string;
  leftIcon?: ReactNode;
  showLaunchIcon?: boolean;
  showArrow?: boolean;
}) {
  const buttonClassName =
    "ring-0 ring-transparent ring-offset-2 ring-offset-background transition-shadow duration-200 hover:ring-2 hover:ring-foreground";

  const content = (
    <>
      {leftIcon}
      {showLaunchIcon && (
        <DcIcon
          className="size-[2.25em]!"
          style={
            {
              "--logo-bg-stop-0": "transparent",
              "--logo-bg-stop-1": "transparent",
            } as React.CSSProperties
          }
        />
      )}
      {label}
      {showArrow && <ButtonArrow icon={ArrowRightIcon} className="ms-0" />}
    </>
  );

  if (deepLinkUrl) {
    return (
      <Button asChild size="xl" fullWidth className={buttonClassName}>
        <a href={deepLinkUrl}>{content}</a>
      </Button>
    );
  }

  return (
    <Button
      size="xl"
      fullWidth
      onClick={onClick}
      className={buttonClassName}
      type="button"
    >
      {content}
    </Button>
  );
}
