"use client";

import { ArrowUpRightIcon, GithubIcon, ImportIcon } from "lucide-react";
import { type CSSProperties, useId, useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { DcIcon } from "@/components/icons/dc-icon2";
import { DcLogotype } from "@/components/icons/dc-logotype";
import { Text } from "@/components/typography/text";
import { CONNECT_CONFIG } from "@/config/config";
import { cn } from "@/lib/classes";
import { getDownloadPlatformLabel } from "@/lib/platform";

function DownloadDataConnectPageContent() {
  const checkboxId = useId();
  const [isFoundationLegalAccepted, setIsFoundationLegalAccepted] =
    useState(false);
  const { combinedTermsUrl, lastUpdatedLabel } =
    CONNECT_CONFIG.legal.foundationSoftwareUse;
  const { dataConnectUrl } = CONNECT_CONFIG.downloads;
  const { dataConnectGithubUrl } = CONNECT_CONFIG.docs;
  const downloadPlatformLabel = getDownloadPlatformLabel();
  const isLegacyDownloadCardDisabled = !isFoundationLegalAccepted;

  return (
    <PageShell showLogoutButton>
      <PagePanel
        className="justify-center text-center space-y-small"
        footer={
          <a
            href={dataConnectGithubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-small text-muted-foreground transition-colors hover:text-foreground"
          >
            <GithubIcon className="size-em" aria-hidden />
            View dataConnect on GitHub
            <ArrowUpRightIcon className="size-[0.9em] -ml-px" aria-hidden />
          </a>
        }
      >
        <div
          className={cn(
            // "mx-auto w-full max-w-xl",
            // "rounded-squish ring ring-border bg-background",
            "px-small text-center space-y-small",
          )}
        >
          <div className="space-y-1.5">
            <Text as="h2" intent="title" weight="semi">
              Download dataConnect
            </Text>
            <Text
              as="p"
              intent="xlarge"
              color="mutedForeground"
              className="mt-0"
            >
              Install the app to connect your data everywhere.
            </Text>
          </div>

          {/* Old button design */}
          {isLegacyDownloadCardDisabled ? (
            <div
              aria-disabled
              className={cn(downloadButtonStyle, "px-w6 cursor-not-allowed")}
            >
              <DownloadDataConnectCardContent
                downloadPlatformLabel={downloadPlatformLabel}
              />
            </div>
          ) : (
            <a
              href={dataConnectUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                downloadButtonStyle,
                "px-w6 cursor-pointer hover:bg-muted",
              )}
            >
              <DownloadDataConnectCardContent
                downloadPlatformLabel={downloadPlatformLabel}
              />
            </a>
          )}

          {/* Legal acceptance */}
          <div className=" text-left space-y-1.5">
            <label
              htmlFor={checkboxId}
              className="flex cursor-pointer items-start gap-3"
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={isFoundationLegalAccepted}
                onChange={(event) =>
                  setIsFoundationLegalAccepted(event.currentTarget.checked)
                }
                className="mt-0.5 size-4 shrink-0 accent-current"
              />
              <Text as="span" intent="small" dim>
                I agree to the dataConnect Terms (including Privacy and EULA).
              </Text>
            </label>
            <Text as="p" intent="small" dim className="pl-7">
              Read the full terms:{" "}
              <a
                href={combinedTermsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link hover:text-foreground"
              >
                dataConnect terms
              </a>{" "}
              ({lastUpdatedLabel}).
            </Text>
          </div>
        </div>
      </PagePanel>
    </PageShell>
  );
}

const downloadButtonStyle = [
  "mx-auto w-full lg:w-3/4",
  "flex flex-col items-center rounded-card border border-foreground",
  "px-w6",
];

export default function DownloadDataConnectPage() {
  return <DownloadDataConnectPageContent />;
}

function DownloadDataConnectCardContent({
  downloadPlatformLabel,
}: {
  downloadPlatformLabel: string;
}) {
  return (
    <>
      <div
        className="flex flex-col items-center gap-3 py-gap"
        style={
          {
            "--logo-tint": "#1e3a8a",
            "--logo-tint-strength": "12%",
          } as CSSProperties
        }
      >
        <div
          className={cn(
            "size-16 flex items-center justify-center",
            "rounded-[30%] [corner-shape:squircle]",
            "bg-foreground shadow-sm",
            "overflow-hidden",
          )}
        >
          <DcIcon className="size-16!" />
        </div>
        {/* <DcIcon className="size-16!" /> */}
        <DcLogotype height={16} role="img" aria-label="dataConnect" />
      </div>
      <hr className="w-full border-ring/30" />
      <Text intent="button" weight="medium" withIcon className="h-12">
        <ImportIcon className="size-[1.25em]" />
        Download for {downloadPlatformLabel}
      </Text>
    </>
  );
}
