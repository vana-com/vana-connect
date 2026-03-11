import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { APP_ROUTES } from "@/app/routes";
import { Text } from "@/components/typography/text";

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
    </div>
  );
}
