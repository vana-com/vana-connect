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
import { DcIcon } from "@/components/icons/dc-icon";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { VanaV } from "@/components/icons/vana-v";
import { Text } from "@/components/typography/text";
import { Button, ButtonArrow } from "@/components/ui/button";
import { cn } from "@/lib/classes";

const DEFAULT_DOWNLOAD_URL =
  "https://github.com/vana-com/databridge/releases/latest";
const DEFAULT_SCOPE_STUB = "read:chatgpt-conversations";
const GRANTS_TEST_DEEPLINK_URL =
  process.env.NEXT_PUBLIC_GRANTS_TEST_DEEPLINK_URL;

function GrantsPageContent() {
  const searchParams = useSearchParams();
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
      <div className="w-full space-y-gap">
        <PagePanel className={cn("text-center justify-center space-y-small")}>
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
                To connect your data, download Data Connect.
              </Text>
            </div>
          </div>

          {/* DEEP LINK LAUNCH into installed Data Connect app */}
          <div className="lg:w-3/4 mx-auto space-y-gap">
            <Button size="xl" fullWidth onClick={handleLaunchClick}>
              <DcIcon className="size-[1.5em]!" />
              Launch Data Connect
              <ButtonArrow icon={ArrowRightIcon} className="ms-0" />
            </Button>

            {/* Download Data Connect */}
            <Text as="p">
              Don’t have it?{" "}
              <a
                href={DEFAULT_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="link hover:text-foreground"
              >
                Download Data Connect
              </a>
              .
            </Text>
          </div>

          {/*
            Intentionally hidden for now: this page currently routes users to install/launch Data Connect first. Re-enable this legal copy once web grant consent is active in this flow.
           */}
          {/* <div className="pt-2 lg:w-5/6 mx-auto">
            <Text as="p" intent="small" align="center" muted>
              To continue, you will share data with this app. Before using this
              app, you can review its{" "}
              <a className="link hover:text-foreground" href={privacyPolicyUrl}>
                privacy policy
              </a>{" "}
              and{" "}
              <a className="link hover:text-foreground" href={termsOfServiceUrl}>
                terms of service
              </a>
              .
            </Text>
          </div> */}
        </PagePanel>

        <Text as="p" intent="small" align="center" muted>
          Interested in building apps?{" "}
          <Link href="/admin" className="link hover:text-foreground">
            Configure a builder app
          </Link>
          .
        </Text>
      </div>
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
