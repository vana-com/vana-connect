import { ArrowLeftIcon, BoxIcon, LogOutIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/classes";

type PageShellProps = {
  children: ReactNode;
  backHref?: string;
  showBackButton?: boolean;
  logoutHref?: string;
  showLogoutButton?: boolean;
  yourAppsHref?: string;
  showYourAppsButton?: boolean;
};

const DEFAULT_BACK_HREF = "/";
const DEFAULT_LOGOUT_HREF = "/";
const TOP_NAV_BUTTON_CLASS = buttonVariants({
  variant: "ghost",
  size: "sm",
  className: cn(
    "px-w6 bg-foreground/[0.03] text-foreground-dim font-normal",
    "hover:bg-iris/[0.07]! hover:text-iris",
  ),
});

export function PageShell({
  children,
  backHref = DEFAULT_BACK_HREF,
  showBackButton = true,
  logoutHref = DEFAULT_LOGOUT_HREF,
  showLogoutButton = false,
  yourAppsHref = "/admin/apps",
  showYourAppsButton = false,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "relative min-h-screen bg-[#F0F4F8]",
        "p-w8 xl:pb-w32",
        "flex flex-col",
      )}
    >
      {showBackButton && (
        <Link
          href={backHref}
          className={cn(
            "absolute top-gap left-0",
            "inline-flex items-center gap-1.5 px-w8 h-[48px]",
            "text-muted-foreground",
            "transition-colors hover:text-foreground",
          )}
        >
          <ArrowLeftIcon aria-hidden="true" className="size-em" />
          Back
        </Link>
      )}
      {(showYourAppsButton || showLogoutButton) && (
        <div className="absolute top-gap right-gap flex items-center gap-2">
          {showYourAppsButton && (
            <Link href={yourAppsHref} className={TOP_NAV_BUTTON_CLASS}>
              <BoxIcon aria-hidden="true" />
              Your apps
            </Link>
          )}
          {showLogoutButton && (
            <Link href={logoutHref} className={TOP_NAV_BUTTON_CLASS}>
              <LogOutIcon aria-hidden="true" />
              Logout
            </Link>
          )}
        </div>
      )}

      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}
