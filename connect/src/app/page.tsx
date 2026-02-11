"use client";

import { ArrowLeftIcon, ArrowRightIcon, ImportIcon } from "lucide-react";
import Link from "next/link";
import { DcIcon } from "@/components/icons/dc-icon";
import { DcLogotype } from "@/components/icons/dc-logotype";
import { fieldHeight } from "@/components/typography/field";
import { Text } from "@/components/typography/text";
import { Button, ButtonArrow } from "@/components/ui/button";
import { cn } from "@/lib/classes";

// TEST DEFAULTS: intentionally hardcoded for local/testing flow.
const IS_TEST_MODE = true;
const DEFAULT_DOWNLOAD_URL =
  "https://github.com/vana-com/databridge/releases/latest";
const DEFAULT_LAUNCH_URL =
  "dataconnect://?appId=rickroll&scopes=read:chatgpt-conversations";

const BACK_LINK_HREF = "/";
const PRIVACY_POLICY_URL = "#";
const TERMS_OF_SERVICE_URL = "#";
const downloadPlatformLabel = "macOS";

export default function Page() {
  function handleLaunchClick() {
    // NOTE: skip-to-grant decision is owned by desktop app @src/pages/connect.
    const launchUrl = new URL(DEFAULT_LAUNCH_URL);
    launchUrl.searchParams.set("sessionId", `ext-${crypto.randomUUID()}`);
    window.location.href = launchUrl.toString();
  }

  return (
    <div className="min-h-screen p-w8 pb-w32 flex flex-col bg-[#F0F4F8]">
      <Link
        href={BACK_LINK_HREF}
        className={cn(
          "absolute top-3 left-0",
          "inline-flex items-center gap-1.5 px-w8 h-[48px]",
          "text-muted-foreground",
          "transition-colors hover:text-foreground",
        )}
      >
        <ArrowLeftIcon aria-hidden="true" className="size-em" />
        Back
      </Link>

      <div className="flex flex-1 items-center justify-center">
        <div
          className={cn(
            "w-full max-w-[560px]",
            "rounded-squish ring ring-border",
            "bg-background px-small py-small",
            "text-center space-y-small",
          )}
        >
          <div className="space-y-0">
            <Text as="h1" intent="title" weight="semi">
              Connect your data.
            </Text>
            <Text
              as="h2"
              intent="title"
              color="mutedForeground"
              className="mt-0"
            >
              Bring it everywhere.
            </Text>
          </div>

          {IS_TEST_MODE ? (
            <div className="mx-auto w-full rounded-card border border-destructive px-4 py-3 text-left text-destructive **:text-destructive lg:w-3/4">
              <Text as="p" intent="small" weight="semi" className="uppercase">
                Test mode only
              </Text>
              <Text as="p" intent="small">
                Work in progress: native launch flow is not wired yet.
              </Text>
              <Text as="p" intent="small">
                No launch URL yet.
              </Text>
              <Text as="p" intent="small">
                Do not ship this config to production.
              </Text>
            </div>
          ) : null}

          {/* Download app link */}
          <a
            href={DEFAULT_DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "lg:w-3/4 mx-auto",
              "flex flex-col items-center",
              "rounded-card border border-foreground",
              "px-w6 group hover:bg-muted cursor-pointer",
            )}
          >
            <div className="flex flex-col items-center gap-gap py-gap">
              <div
                className={cn(
                  "size-16",
                  "flex items-center justify-center",
                  "rounded-button",
                  "bg-foreground shadow-sm",
                )}
              >
                <DcIcon className="size-12!" />
              </div>
              <DcLogotype height={13} aria-hidden />
            </div>
            <hr className="w-full border-ring/30" />
            <Text
              intent="button"
              weight="medium"
              withIcon
              className={cn(fieldHeight.lg)}
            >
              <ImportIcon className="size-[1.25em]" />
              Download for {downloadPlatformLabel}
            </Text>
          </a>

          {/* Deep link into installed Data Connect app */}
          <div className="lg:w-3/4 mx-auto space-y-gap">
            <Text as="p">Already have Data Connect?</Text>
            <Button size="xl" fullWidth onClick={handleLaunchClick}>
              <DcIcon className="size-[1.5em]!" />
              Launch Data Connect (WIP)
              <ButtonArrow icon={ArrowRightIcon} className="ms-0" />
            </Button>
          </div>

          <div className="pt-2 lg:w-5/6 mx-auto">
            <Text as="p" intent="small" align="center" muted>
              To continue, you will share data with this app. Before using this
              app, you can review its{" "}
              <a
                className="link hover:text-foreground"
                href={PRIVACY_POLICY_URL}
              >
                privacy policy
              </a>{" "}
              and{" "}
              <a
                className="link hover:text-foreground"
                href={TERMS_OF_SERVICE_URL}
              >
                terms of service
              </a>
              .
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}
