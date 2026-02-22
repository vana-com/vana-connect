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
  downloadDataConnectHref?: string;
  showDownloadDataConnectButton?: boolean;
};

const DEFAULT_BACK_HREF = "/";
const DEFAULT_LOGOUT_HREF = "/";
const DEFAULT_YOUR_APPS_HREF = "/admin";
const DEFAULT_DOWNLOAD_DATA_CONNECT_HREF = "/download-data-connect";

export function PageShell({
  children,
  backHref = DEFAULT_BACK_HREF,
  showBackButton = true,
  logoutHref = DEFAULT_LOGOUT_HREF,
  showLogoutButton = false,
  yourAppsHref = DEFAULT_YOUR_APPS_HREF,
  showYourAppsButton = false,
  downloadDataConnectHref = DEFAULT_DOWNLOAD_DATA_CONNECT_HREF,
  showDownloadDataConnectButton = false,
}: PageShellProps) {
  return (
    <div
      data-slot="page-shell"
      className={cn(
        "relative min-h-screen bg-[#F0F4F8]",
        "p-w8 [@media(min-height:801px)]:pb-w32",
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
      {(showYourAppsButton ||
        showDownloadDataConnectButton ||
        showLogoutButton) && (
        <div className="absolute top-gap right-gap flex items-center gap-2">
          {showDownloadDataConnectButton && (
            <NavLink
              href={downloadDataConnectHref}
              icon={<BoxIcon aria-hidden="true" />}
            >
              DataConnect
            </NavLink>
          )}
          {showYourAppsButton && (
            <NavLink href={yourAppsHref} icon={<BoxIcon aria-hidden="true" />}>
              Your apps
            </NavLink>
          )}
          {showLogoutButton && (
            <NavLink href={logoutHref} icon={<LogOutIcon aria-hidden="true" />}>
              Logout
            </NavLink>
          )}
        </div>
      )}

      <div
        data-slot="page-shell-content"
        className="flex flex-1 items-center justify-center"
      >
        {children}
      </div>
    </div>
  );
}

export function NavLink({
  href,
  icon,
  children,
  className,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const buttonClassName = buttonVariants({
    variant: "ghost",
    size: "sm",
    className: cn(
      "px-w6 bg-foreground/[0.03] text-foreground-dim font-normal",
      "hover:bg-iris/[0.07]! hover:text-iris",
      className,
    ),
  });
  return (
    <Link href={href} className={buttonClassName}>
      {icon}
      {children}
    </Link>
  );
}
