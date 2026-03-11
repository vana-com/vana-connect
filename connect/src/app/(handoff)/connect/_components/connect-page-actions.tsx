"use client";

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { APP_ROUTES } from "@/app/routes";
import { DcIcon } from "@/components/icons/dc-icon3";
import { Text } from "@/components/typography/text";
import { Button, ButtonArrow } from "@/components/ui/button";
import { cn } from "@/lib/classes";

export function GetDataConnectLink({ href }: { href?: string }) {
  return (
    <Link
      href={href ?? APP_ROUTES.downloadDataConnect}
      className="link hover:text-foreground"
    >
      Get DataConnect&nbsp;
      <ButtonArrow
        icon={ArrowRightIcon}
        className="size-em inline mt-[-0.125em]"
      />
    </Link>
  );
}

type ConnectPrimaryAction =
  | {
      kind: "deep-link";
      href: string;
      label: string;
      leftIcon?: ReactNode;
    }
  | {
      kind: "link";
      href: string;
      label: string;
      leftIcon?: ReactNode;
    }
  | {
      kind: "button";
      onClick: () => void;
      label: string;
      leftIcon?: ReactNode;
    };

export function ConnectLaunchSection({
  primaryAction,
  secondaryContent,
}: {
  primaryAction: ConnectPrimaryAction;
  secondaryContent?: ReactNode;
}) {
  return (
    <div className="lg:w-3/4 mx-auto space-y-gap">
      <ConnectPrimaryActionButton action={primaryAction} />
      {secondaryContent ? secondaryContent : null}
    </div>
  );
}

function ConnectPrimaryActionButton({
  action,
}: {
  action: ConnectPrimaryAction;
}) {
  const buttonClassName = cn([
    "ring-0 ring-transparent ring-offset-2 ring-offset-background transition-shadow duration-200 hover:ring-2 hover:ring-foreground",
    "bg-dc text-background hover:bg-iris data-[state=open]:bg-dc/70",
  ]);
  const isDeepLink = action.kind === "deep-link";
  const content = (
    <>
      {action.leftIcon}
      {isDeepLink ? (
        <div className="pr-1.25">
          <DcIcon
            className="size-[2.25em]! rounded-[22%] outline-iris-surface/50 outline-1 outline-offset-1"
            style={
              {
                "--logo-bg-stop-0": "transparent",
                "--logo-bg-stop-1": "transparent",
              } as React.CSSProperties
            }
          />
        </div>
      ) : null}
      {action.label}
      {isDeepLink ? (
        <ButtonArrow icon={ArrowRightIcon} className="ms-0" />
      ) : null}
    </>
  );

  if (action.kind === "button") {
    return (
      <Button
        size="xl"
        color="iris"
        fullWidth
        onClick={action.onClick}
        className={buttonClassName}
        type="button"
      >
        {content}
      </Button>
    );
  }

  if (action.kind === "link") {
    return (
      <Button
        asChild
        size="xl"
        color="iris"
        fullWidth
        className={buttonClassName}
      >
        <Link href={action.href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button
      asChild
      size="xl"
      color="iris"
      fullWidth
      className={buttonClassName}
    >
      <a href={action.href}>{content}</a>
    </Button>
  );
}

export function DefaultDownloadSecondary({ href }: { href?: string }) {
  return (
    <Text as="p">
      Don&apos;t have it? <GetDataConnectLink href={href} />
    </Text>
  );
}
