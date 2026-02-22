"use client";

import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  DownloadIcon,
  GithubIcon,
  ImportIcon,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { LegalAcceptance } from "@/app/_components/legal-acceptance";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { DcIcon } from "@/components/icons/dc-icon2";
import { DcLogotype } from "@/components/icons/dc-logotype";
import { Text } from "@/components/typography/text";
import {
  CONNECT_CONFIG,
  getAssetUrl,
  type DownloadAsset,
} from "@/config/config";
import { cn } from "@/lib/classes";
import { detectOS, getDownloadPlatformLabel } from "@/lib/platform";

const OS_GROUPS = ["macOS", "Windows", "Linux"] as const;
type OSGroup = (typeof OS_GROUPS)[number];

function useDownloadState() {
  const os = useMemo(() => detectOS(), []);
  const isUnknown = os === "unknown";
  const [showAll, setShowAll] = useState(isUnknown);
  const { assets } = CONNECT_CONFIG.downloads;

  const primaryAsset: DownloadAsset | null = isUnknown
    ? null
    : (assets[os].find((a) => a.isDefault) ?? assets[os][0]);

  return { os, isUnknown, showAll, setShowAll, primaryAsset, assets };
}

function DownloadDataConnectPageContent() {
  const checkboxId = useId();
  const [isFoundationLegalAccepted, setIsFoundationLegalAccepted] =
    useState(false);
  const { combinedTermsUrl, lastUpdatedLabel } =
    CONNECT_CONFIG.legal.foundationSoftwareUse;
  const { dataConnectGithubUrl } = CONNECT_CONFIG.docs;
  const downloadPlatformLabel = getDownloadPlatformLabel();
  const isDisabled = !isFoundationLegalAccepted;

  const { os, isUnknown, showAll, setShowAll, primaryAsset, assets } =
    useDownloadState();

  const primaryHref = primaryAsset ? getAssetUrl(primaryAsset.filename) : "#";

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
        <div className="px-small text-center space-y-small">
          <div className="space-y-0.5">
            <Text as="h2" intent="title" weight="semi">
              Download dataConnect.
            </Text>
            <Text as="p" intent="subtitle" muted>
              Install the app. Connect your data.
            </Text>
          </div>

          {/* Primary download card */}
          {!isUnknown &&
            (isDisabled ? (
              <div
                aria-disabled
                className={cn(downloadButtonStyle, "cursor-not-allowed")}
              >
                <DownloadDataConnectCardContent
                  downloadPlatformLabel={downloadPlatformLabel}
                />
              </div>
            ) : (
              <a
                href={primaryHref}
                className={cn(
                  downloadButtonStyle,
                  "cursor-pointer hover:bg-muted",
                  "ring-0 ring-transparent transition-shadow duration-200 hover:ring-2 hover:ring-foreground",
                )}
              >
                <DownloadDataConnectCardContent
                  downloadPlatformLabel={downloadPlatformLabel}
                />
              </a>
            ))}

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

          {/* Show all downloads toggle */}
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="inline-flex items-center gap-1 text-small text-muted-foreground transition-colors hover:text-foreground"
          >
            Show all downloads
            <ChevronDownIcon
              className={cn(
                "size-[1em] transition-transform duration-200",
                showAll && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          {/* Expanded downloads section */}
          {showAll && (
            <div className="mx-auto w-full lg:w-3/4 text-left space-y-4">
              {OS_GROUPS.map((group) => (
                <AllDownloadsGroup
                  key={group}
                  group={group}
                  groupAssets={assets[group]}
                  isDetected={os === group}
                  isDisabled={isDisabled}
                />
              ))}
            </div>
          )}
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

function AllDownloadsGroup({
  group,
  groupAssets,
  isDetected,
  isDisabled,
}: {
  group: OSGroup;
  groupAssets: readonly DownloadAsset[];
  isDetected: boolean;
  isDisabled: boolean;
}) {
  return (
    <div>
      <Text
        as="h3"
        intent="small"
        weight="medium"
        className={cn("mb-1.5", isDetected && "text-accent-foreground")}
      >
        {group}
        {isDetected && (
          <span className="ml-1.5 text-muted-foreground font-normal">
            (detected)
          </span>
        )}
      </Text>
      <div className="space-y-1">
        {groupAssets.map((asset) => (
          <AssetRow
            key={asset.filename}
            asset={asset}
            isDisabled={isDisabled}
          />
        ))}
      </div>
    </div>
  );
}

function AssetRow({
  asset,
  isDisabled,
}: {
  asset: DownloadAsset;
  isDisabled: boolean;
}) {
  const href = getAssetUrl(asset.filename);

  return isDisabled ? (
    <div
      aria-disabled
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border px-3 py-2",
        "opacity-50 cursor-not-allowed",
      )}
    >
      <div>
        <Text as="span" intent="small" weight="medium">
          {asset.label}
        </Text>
        <Text as="span" intent="fine" muted className="ml-2">
          {asset.description}
        </Text>
      </div>
      <DownloadIcon
        className="size-3.5 text-muted-foreground shrink-0"
        aria-hidden
      />
    </div>
  ) : (
    <a
      href={href}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border px-3 py-2",
        "transition-colors hover:bg-muted hover:border-foreground/20",
      )}
    >
      <div>
        <Text as="span" intent="small" weight="medium">
          {asset.label}
        </Text>
        <Text as="span" intent="fine" muted className="ml-2">
          {asset.description}
        </Text>
      </div>
      <DownloadIcon
        className="size-3.5 text-muted-foreground shrink-0"
        aria-hidden
      />
    </a>
  );
}
