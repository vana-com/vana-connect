"use client";

import { ArrowRightLeftIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { VanaV } from "@/components/icons/vana-v";
import type { ConnectAppMetadata } from "../_lib/app-registry";

const CONNECT_HEADER_BLOCK_MIN_HEIGHT = 130;
const CONNECT_STATE_BLOCK_GAP = 32;
const CONNECT_BODY_BLOCK_MIN_HEIGHT = 101;

export function ConnectStateFrame({
  app,
  title,
  subtitle,
  content,
}: {
  app: ConnectAppMetadata;
  title: ReactNode;
  subtitle?: ReactNode;
  content?: ReactNode;
}) {
  return (
    <div>
      <div
        className="flex items-center justify-center"
        style={{ minHeight: `${CONNECT_HEADER_BLOCK_MIN_HEIGHT}px` }}
      >
        <ConnectStateHeader app={app} title={title} subtitle={subtitle} />
      </div>
      <div aria-hidden style={{ height: `${CONNECT_STATE_BLOCK_GAP}px` }} />
      <div
        className="flex items-start justify-center"
        style={{ minHeight: `${CONNECT_BODY_BLOCK_MIN_HEIGHT}px` }}
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
  app: ConnectAppMetadata;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="space-y-gap">
      <div className="flex items-center justify-center gap-2">
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

function ConnectSourceAppIcon({ app }: { app: ConnectAppMetadata }) {
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
