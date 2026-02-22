import { ArrowLeftIcon, BoxIcon, LogOutIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/classes";

type PageShellProps = {
  children: ReactNode;
  backHref?: string;
  showBackButton?: boolean;
  actions?: PageShellActionInput[];
};

type PageShellAction = {
  href: string;
  icon: ReactNode;
  label: ReactNode;
  className?: string;
};
type PageShellActionPreset = "logout" | "yourApps" | "dataConnect";
type PageShellActionInput = PageShellActionPreset | PageShellAction;

const DEFAULT_BACK_HREF = "/";
const DEFAULT_LOGOUT_HREF = "/logout";
const DEFAULT_YOUR_APPS_HREF = "/admin";
const DEFAULT_DOWNLOAD_DATA_CONNECT_HREF = "/download-data-connect";

export function PageShell({
  children,
  backHref = DEFAULT_BACK_HREF,
  showBackButton = false,
  actions = [],
}: PageShellProps) {
  const resolvedActions = actions.map((action) =>
    resolvePageShellAction(action, {
      logoutHref: DEFAULT_LOGOUT_HREF,
      yourAppsHref: DEFAULT_YOUR_APPS_HREF,
      downloadDataConnectHref: DEFAULT_DOWNLOAD_DATA_CONNECT_HREF,
    }),
  );

  return (
    <div
      data-slot="page-shell"
      className={cn(
        "relative min-h-screen bg-canvas",
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
      {resolvedActions.length > 0 && (
        <div className="absolute top-gap right-gap flex items-center gap-2">
          {resolvedActions.map((action, index) => (
            <NavLink
              key={`${action.href}-${index}`}
              href={action.href}
              icon={action.icon}
              className={action.className}
            >
              {action.label}
            </NavLink>
          ))}
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

function resolvePageShellAction(
  action: PageShellActionInput,
  hrefs: {
    logoutHref: string;
    yourAppsHref: string;
    downloadDataConnectHref: string;
  },
): PageShellAction {
  if (typeof action !== "string") return action;

  if (action === "dataConnect") {
    return {
      href: hrefs.downloadDataConnectHref,
      icon: <BoxIcon aria-hidden="true" />,
      label: "DataConnect",
    };
  }
  if (action === "yourApps") {
    return {
      href: hrefs.yourAppsHref,
      icon: <BoxIcon aria-hidden="true" />,
      label: "Your apps",
    };
  }
  return {
    href: hrefs.logoutHref,
    icon: <LogOutIcon aria-hidden="true" />,
    label: "Logout",
  };
}
