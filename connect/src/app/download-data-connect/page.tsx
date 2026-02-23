"use client";

import { usePrivy } from "@privy-io/react-auth";
import { GithubIcon, ImportIcon, LaptopIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { LegalAcceptance } from "@/app/_components/legal-acceptance";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { APP_ROUTES } from "@/app/routes";
import { ExternalLink } from "@/components/elements/external-link";
import { SlidingTabs } from "@/components/elements/sliding-tabs";
import { DcIcon } from "@/components/icons/dc-icon2";
import { DcLogotype } from "@/components/icons/dc-logotype";
import { Text } from "@/components/typography/text";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import {
  CONNECT_CONFIG,
  type DownloadAsset,
  getAssetUrl,
} from "@/config/config";
import { cn } from "@/lib/classes";
import { detectOS, getDownloadPlatformLabel } from "@/lib/platform";

const OS_GROUPS = ["macOS", "Windows", "Linux"] as const;
type OSGroup = (typeof OS_GROUPS)[number];

function useDownloadState() {
  const os = useMemo(() => detectOS(), []);
  const isUnknown = os === "unknown";
  const { assets } = CONNECT_CONFIG.downloads;

  const primaryAsset: DownloadAsset | null = isUnknown
    ? null
    : (assets[os].find((a) => a.isDefault) ?? assets[os][0]);

  const initialGroup: OSGroup = isUnknown ? "macOS" : (os as OSGroup);

  return { os, isUnknown, primaryAsset, assets, initialGroup };
}

function DownloadDataConnectPageContent() {
  const { authenticated } = usePrivy();
  const checkboxId = useId();
  const [isFoundationLegalAccepted, setIsFoundationLegalAccepted] =
    useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [isCheckboxChecked, setIsCheckboxChecked] = useState(false);
  const [pendingDownloadHref, setPendingDownloadHref] = useState<string | null>(
    null,
  );
  const { combinedTermsUrl, lastUpdatedLabel } =
    CONNECT_CONFIG.legal.foundationSoftwareUse;
  const { dataConnectGithubUrl } = CONNECT_CONFIG.docs;
  const downloadPlatformLabel = getDownloadPlatformLabel();

  const { isUnknown, primaryAsset, assets, initialGroup } = useDownloadState();
  const [selectedGroup, setSelectedGroup] = useState<OSGroup>(initialGroup);
  const osTabs = useMemo(
    () =>
      OS_GROUPS.map((group) => ({
        value: group,
        label: (
          <Text as="span" intent="small" weight="medium" color="inherit">
            {group}
          </Text>
        ),
      })),
    [],
  );

  const primaryHref = primaryAsset ? getAssetUrl(primaryAsset.filename) : "#";
  const canPrimaryDownload = !isUnknown && primaryAsset !== null;
  const shellActions = authenticated
    ? (["yourApps", "logout"] as const)
    : (["yourApps"] as const);
  const backHref = authenticated ? APP_ROUTES.admin : APP_ROUTES.login;

  function handleDownloadIntent(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (isFoundationLegalAccepted) return;
    event.preventDefault();
    setPendingDownloadHref(href);
    setIsLegalModalOpen(true);
  }

  function handleAgreeAndDownload() {
    if (!pendingDownloadHref) return;
    setIsFoundationLegalAccepted(true);
    setIsLegalModalOpen(false);
    window.location.assign(pendingDownloadHref);
    setPendingDownloadHref(null);
  }

  function handleLegalDialogOpenChange(open: boolean) {
    setIsLegalModalOpen(open);
    if (!open) {
      setPendingDownloadHref(null);
      setIsCheckboxChecked(false);
    }
  }

  return (
    <PageShell showBackButton backHref={backHref} actions={[...shellActions]}>
      <PagePanel
        className="justify-center text-center space-y-small"
        footer={
          <ExternalLink href={dataConnectGithubUrl} leadingIcon={GithubIcon}>
            DataConnect on GitHub
          </ExternalLink>
        }
      >
        <div className="px-small text-center space-y-small">
          <div className="space-y-0.5">
            <Text as="h2" intent="title" weight="semi">
              Download DataConnect.
            </Text>
            <Text as="p" intent="subtitle" muted>
              Install the app. Connect your data.
            </Text>
          </div>

          {/* Primary download card */}
          {canPrimaryDownload ? (
            <a
              href={primaryHref}
              onClick={(event) => handleDownloadIntent(event, primaryHref)}
              className={cn(
                contentStyle,
                "flex flex-col items-center rounded-card px-w6",
                downloadButtonStyle,
              )}
            >
              <DownloadDataConnectCardContent
                downloadPlatformLabel={downloadPlatformLabel}
              />
            </a>
          ) : (
            <div className="h-[173px]" aria-hidden />
          )}

          {/* Other downloads */}
          <div className={cn(contentStyle, "text-left space-y-4")}>
            <Text as="p" intent="small" dim withIcon align="center">
              <LaptopIcon aria-hidden />
              Other downloads
            </Text>

            <div>
              <SlidingTabs
                tabs={osTabs}
                value={selectedGroup}
                onValueChange={(value) => setSelectedGroup(value as OSGroup)}
                listClassName="w-full rounded-card border border-foreground/30 bg-background p-1"
                listItemClassName="flex-1 min-w-0"
                tabClassName={cn(
                  // Layout
                  "w-full flex justify-center rounded-sm px-2.5",
                  // Tab height (--tab-h drives both h and label leading)
                  "[--tab-h:2rem] h-[var(--tab-h)]",
                  // Vertical-center label via line-height = tab height
                  "[&>*]:leading-[var(--tab-h)]",
                )}
                indicatorClassName={cn(
                  "inset-0 rounded-sm",
                  "bg-(--canvas-accent-25-black-5)",
                )}
                indicatorLayoutId="download-os-selected-indicator"
              />

              <div className="min-h-[92px] overflow-auto pt-5 -mt-3 border rounded-b-card">
                <AllDownloadsGroup
                  groupAssets={assets[selectedGroup]}
                  onDownloadIntent={handleDownloadIntent}
                />
              </div>
            </div>
          </div>
        </div>
      </PagePanel>

      <AlertDialog
        open={isLegalModalOpen}
        onOpenChange={handleLegalDialogOpenChange}
      >
        <AlertDialogContent
          size="sm"
          className={cn(
            "rounded-squish text-left max-w-[380px]!",
            // spacing
            "p-w6 space-y-1",
          )}
        >
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle>
              <Text as="span" intent="subtitle" weight="semi">
                One quick step
              </Text>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-body text-foreground">
              Accept terms once to download DataConnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <hr />
          <LegalAcceptance
            checkboxId={checkboxId}
            checked={isCheckboxChecked}
            onCheckedChange={setIsCheckboxChecked}
            label="I agree to the DataConnect Terms (including Privacy and EULA)"
            details={
              <>
                Read the{" "}
                <a
                  href={combinedTermsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link hover:text-foreground"
                >
                  DataConnect terms
                </a>{" "}
                ({lastUpdatedLabel})
              </>
            }
          />

          <AlertDialogFooter className="pt-gap">
            <AlertDialogCancel size="sm">Not now</AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              onClick={handleAgreeAndDownload}
              disabled={!isCheckboxChecked}
            >
              Agree and download
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

const contentStyle = "mx-auto w-full lg:w-5/6";

const downloadButtonStyle = [
  "border border-foreground",
  "cursor-pointer hover:bg-muted",
  "ring-0 ring-transparent transition-shadow duration-200 hover:ring-2 hover:ring-foreground",
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
        <DcLogotype height={16} role="img" aria-label="DataConnect" />
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
  groupAssets,
  onDownloadIntent,
}: {
  groupAssets: readonly DownloadAsset[];
  onDownloadIntent: (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => void;
}) {
  return (
    <div className="space-y-px">
      {groupAssets.map((asset) => (
        <AssetRow
          key={asset.filename}
          asset={asset}
          onDownloadIntent={onDownloadIntent}
        />
      ))}
    </div>
  );
}

function AssetRow({
  asset,
  onDownloadIntent,
}: {
  asset: DownloadAsset;
  onDownloadIntent: (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => void;
}) {
  const href = getAssetUrl(asset.filename);

  return (
    <a
      href={href}
      onClick={(event) => onDownloadIntent(event, href)}
      className={cn(
        "group",
        "flex items-center justify-between gap-2 px-2 py-2.5",
        "rounded-button",
        "hover:bg-(--canvas-accent-25-black-5)/40",
      )}
    >
      <div className="pl-1 flex-1">
        <Text as="span" intent="small" weight="medium">
          {asset.label}
        </Text>
        {/* {asset.description && (
          <Text as="span" intent="fine" muted className="ml-2">
            {asset.description}
          </Text>
        )} */}
      </div>
      <div
        className={cn(
          buttonVariants({ variant: "outline", size: "xs" }),
          "group-hover:bg-background group-hover:border-foreground",
        )}
      >
        Download
      </div>
    </a>
  );
}
