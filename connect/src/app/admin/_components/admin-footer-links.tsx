"use client";

import { BookOpenTextIcon, GithubIcon } from "lucide-react";
import { ExternalLink } from "@/components/elements/external-link";
import { CONNECT_CONFIG } from "@/config/config";

export function AdminFooterLinks() {
  const { docsSiteUrl, vanaConnectGithubUrl } = CONNECT_CONFIG.docs;

  return (
    <div
      data-slot="admin-footer-links"
      className="flex items-center justify-center gap-5"
    >
      <ExternalLink href={vanaConnectGithubUrl} leadingIcon={GithubIcon}>
        GitHub
      </ExternalLink>
      <ExternalLink href={docsSiteUrl} leadingIcon={BookOpenTextIcon}>
        Docs
      </ExternalLink>
    </div>
  );
}
