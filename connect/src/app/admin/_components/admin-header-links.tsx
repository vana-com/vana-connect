import { BoxIcon, GithubIcon } from "lucide-react";
import { NavLink } from "@/app/_components/page-shell";
import { getPageShellActionButtonClassName } from "@/app/_components/page-shell-action-button-class";
import { CONNECT_CONFIG } from "@/config/config";

type AdminHeaderLinksProps = {
  showYourApps?: boolean;
};

export function AdminHeaderLinks({
  showYourApps = true,
}: AdminHeaderLinksProps) {
  return (
    <div
      data-slot="admin-header-links"
      className="absolute right-3 top-3 flex items-center gap-0"
    >
      <a
        href={CONNECT_CONFIG.docs.exampleAppUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={getPageShellActionButtonClassName("bg-transparent px-1.5!")}
      >
        <GithubIcon aria-hidden />
        Example
      </a>
      {showYourApps ? (
        <NavLink
          href="/admin/apps"
          icon={<BoxIcon aria-hidden="true" />}
          className="bg-transparent"
        >
          Your apps
        </NavLink>
      ) : (
        <NavLink
          href="/admin"
          icon={<BoxIcon aria-hidden="true" />}
          className="bg-transparent"
        >
          Register app
        </NavLink>
      )}
    </div>
  );
}
