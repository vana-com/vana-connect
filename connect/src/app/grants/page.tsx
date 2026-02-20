"use client";

import { ArrowRightIcon, ArrowRightLeftIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { resolveGrantAppRef } from "@/app/grants/app-query";
import { resolveGrantApp } from "@/app/grants/app-registry";
import { resolveGrantLaunchUrl } from "@/app/grants/launch-url";
import { DcIcon } from "@/components/icons/dc-icon2";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { VanaV } from "@/components/icons/vana-v";
import { Text } from "@/components/typography/text";
import { Button, ButtonArrow } from "@/components/ui/button";
import { cn } from "@/lib/classes";

const DEFAULT_SCOPE_STUB = "read:chatgpt-conversations";
const GRANTS_TEST_DEEPLINK_URL =
  process.env.NEXT_PUBLIC_GRANTS_TEST_DEEPLINK_URL;

function GrantsPageContent() {
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const downloadDataConnectHref = rawQuery
    ? `/download-data-connect?${rawQuery}`
    : "/download-data-connect";
  const appRef = resolveGrantAppRef(searchParams);
  const app = resolveGrantApp(appRef);

  function handleLaunchClick() {
    // Canonical integration is a relay deepLinkUrl passthrough.
    // While backend wiring is pending, we keep a local `vana://connect` fallback.
    const launchUrl = resolveGrantLaunchUrl({
      relayDeepLinkUrl:
        searchParams.get("deepLinkUrl") || searchParams.get("deep_link_url"),
      testDeepLinkUrl: GRANTS_TEST_DEEPLINK_URL,
      sessionId: searchParams.get("sessionId"),
      secret: searchParams.get("secret"),
      appId: app.id,
      scopes: searchParams.get("scopes") || DEFAULT_SCOPE_STUB,
    });
    window.location.href = launchUrl;
  }

  return (
    // No back button for either continue_to_grants or return_to_app modes here!
    <PageShell showBackButton={false} showLogoutButton>
      <PagePanel
        className={cn("text-center justify-center space-y-small")}
        footer={
          <Text as="p" intent="small" align="center" muted>
            Interested in building apps on Vana?{" "}
            <Link href="/admin" className="link hover:text-foreground">
              Learn more
              <ArrowRightIcon
                aria-hidden
                className="inline size-[0.9em] ml-px"
              />
            </Link>
          </Text>
        }
      >
        <div className="space-y-gap">
          <div className="flex items-center justify-center gap-3">
            <PlatformIcon
              iconName={app.displayName}
              imageSrc={app.iconUrl}
              imageAlt={`${app.displayName} icon`}
              fallbackLabel={app.displayName.charAt(0)}
              size={44}
              inset={4}
              style={{ backgroundColor: app.iconBg, color: app.iconFg }}
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
            <Text as="h1" intent="title">
              You don't have any data.
            </Text>
            <Text as="h1" intent="xlarge" dim>
              To connect your data, download dataConnect.
            </Text>
          </div>
        </div>

        {/* DEEP LINK LAUNCH into installed Data Connect app */}
        <div className="lg:w-3/4 mx-auto space-y-gap">
          <Button
            size="xl"
            fullWidth
            onClick={handleLaunchClick}
            className="ring-0 ring-transparent ring-offset-2 ring-offset-background transition-shadow duration-200 hover:ring-2 hover:ring-foreground"
          >
            <DcIcon
              className="size-[2.25em]!"
              style={
                {
                  "--logo-bg-stop-0": "transparent",
                  "--logo-bg-stop-1": "transparent",
                } as React.CSSProperties
              }
            />
            Launch dataConnect
            <ButtonArrow icon={ArrowRightIcon} className="ms-0" />
          </Button>

          {/* Download dataConnect */}
          <Text as="p">
            Don’t have it?{" "}
            <Link
              href={downloadDataConnectHref}
              className="link hover:text-foreground"
            >
              Download dataConnect&nbsp;
              <ButtonArrow
                icon={ArrowRightIcon}
                className="size-em inline mt-[-0.125em]"
              />
            </Link>
          </Text>
        </div>
      </PagePanel>
    </PageShell>
  );
}

export default function GrantsPage() {
  return (
    <Suspense fallback={null}>
      <GrantsPageContent />
    </Suspense>
  );
}
