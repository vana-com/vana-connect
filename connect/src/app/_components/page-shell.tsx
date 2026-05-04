import { ArrowLeftIcon, BoxIcon, KeyRoundIcon, LogOutIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutActionButton } from "@/app/_components/logout-action-button";
import { getPageShellActionButtonClassName } from "@/app/_components/page-shell-action-button-class";
import { APP_ROUTES } from "@/app/routes";
import { cn } from "@/lib/classes";

type PageShellProps = {
  children: ReactNode;
  backHref?: string;
  showBackButton?: boolean;
  actions?: PageShellActionInput[];
  contentPlacement?: "center" | "start";
};

type PageShellAction = {
  href: string;
  icon: ReactNode;
  label: ReactNode;
  className?: string;
  kind?: PageShellActionPreset;
};
type PageShellActionPreset = "logout" | "access" | "yourApps" | "dataConnect";
type PageShellActionInput = PageShellActionPreset | PageShellAction;

export function PageShell({
  children,
  backHref = APP_ROUTES.root,
  showBackButton = false,
  actions = [],
  contentPlacement = "center",
}: PageShellProps) {
  const resolvedActions = actions.map((action) =>
    resolvePageShellAction(action, {
      logoutHref: APP_ROUTES.logout,
      accessHref: APP_ROUTES.accountAccess,
      yourAppsHref: APP_ROUTES.admin,
      downloadDataConnectHref: APP_ROUTES.downloadDataConnect,
    }),
  );
  const hasHeader = showBackButton || resolvedActions.length > 0;

  return (
    <div
      data-slot="page-shell"
      className={cn(
        "relative min-h-screen bg-canvas",
        "p-w8 [@media(min-height:801px)]:pb-w32",
        "flex flex-col gap-w8",
      )}
    >
      {hasHeader && (
        <div
          data-slot="page-shell-nav"
          className="flex min-h-[48px] w-full items-start justify-between gap-w4"
        >
          <div className="flex min-w-0 items-center">
            {showBackButton && (
              <Link
                href={backHref}
                className={cn(
                  "inline-flex h-[48px] items-center gap-1.5",
                  "text-muted-foreground",
                  "transition-colors hover:text-foreground",
                )}
              >
                <ArrowLeftIcon aria-hidden="true" className="size-em" />
                Back
              </Link>
            )}
          </div>
          {resolvedActions.length > 0 && (
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1">
              {resolvedActions.map((action, index) =>
                action.kind === "logout" ? (
                  <LogoutActionButton
                    key={`${action.href}-${index}`}
                    href={action.href}
                    className={action.className}
                  >
                    {action.label}
                  </LogoutActionButton>
                ) : (
                  <NavLink
                    key={`${action.href}-${index}`}
                    href={action.href}
                    icon={action.icon}
                    className={action.className}
                  >
                    {action.label}
                  </NavLink>
                ),
              )}
            </div>
          )}
        </div>
      )}

      <div
        data-slot="page-shell-content"
        className={
          contentPlacement === "start"
            ? "flex flex-1 items-start justify-center"
            : "flex flex-1 items-center justify-center"
        }
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
  const buttonClassName = getPageShellActionButtonClassName(className);
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
    accessHref: string;
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
      kind: "dataConnect",
    };
  }
  if (action === "access") {
    return {
      href: hrefs.accessHref,
      icon: <KeyRoundIcon aria-hidden="true" />,
      label: "Access",
      kind: "access",
    };
  }
  if (action === "yourApps") {
    return {
      href: hrefs.yourAppsHref,
      icon: <BoxIcon aria-hidden="true" />,
      label: "Your apps",
      kind: "yourApps",
    };
  }
  return {
    href: hrefs.logoutHref,
    icon: <LogOutIcon aria-hidden="true" />,
    label: "Logout",
    kind: "logout",
  };
}
