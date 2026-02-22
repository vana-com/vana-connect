"use client";

import { ArrowUpRightIcon, GithubIcon, ImportIcon } from "lucide-react";
import { useId, useState } from "react";
import { LegalAcceptance } from "@/app/_components/legal-acceptance";
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
    <PageShell showBackButton actions={["yourApps", "logout"]}>
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
          <div className="space-y-0.5">
            <Text as="h2" intent="title" weight="semi">
              Download dataConnect.
            </Text>
            <Text as="p" intent="subtitle" muted>
              Install the app. Connect your data.
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
                // dupe ring on hover style
                "ring-0 ring-transparent transition-shadow duration-200 hover:ring-2 hover:ring-foreground",
              )}
            >
              <DownloadDataConnectCardContent
                downloadPlatformLabel={downloadPlatformLabel}
              />
            </a>
          )}

          <LegalAcceptance
            checkboxId={checkboxId}
            checked={isFoundationLegalAccepted}
            onCheckedChange={setIsFoundationLegalAccepted}
            label="I agree to the dataConnect Terms (including Privacy and EULA)."
            details={
              <>
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
              </>
            }
          />
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
      <div className="flex flex-col items-center gap-3 py-gap">
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
