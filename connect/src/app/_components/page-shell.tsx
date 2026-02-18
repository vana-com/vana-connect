import { ArrowLeftIcon, LogOutIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
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
        "p-w8 pb-w32",
        "flex flex-col",
      )}
    >
      {showBackButton && (
        <Link
          href={backHref}
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
      )}
      {(showYourAppsButton || showLogoutButton) && (
        <div className="absolute top-3 right-0 flex items-center">
          {showYourAppsButton && (
            <Link
              href={yourAppsHref}
              className={cn(
                "inline-flex items-center gap-1.5 h-[48px] px-4",
                "text-muted-foreground",
                "transition-colors hover:text-foreground",
              )}
            >
              Your apps
            </Link>
          )}
          {showLogoutButton && (
            <Link
              href={logoutHref}
              className={cn(
                "inline-flex items-center gap-1.5 h-[48px] px-w8",
                "text-muted-foreground",
                "transition-colors hover:text-foreground",
              )}
            >
              <LogOutIcon aria-hidden="true" className="size-em" />
              Logout
            </Link>
          )}
        </div>
      )}

      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}
