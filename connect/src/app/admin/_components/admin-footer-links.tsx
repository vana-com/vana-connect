"use client";

import { BookOpenTextIcon, GithubIcon } from "lucide-react";
import { ExternalLink } from "@/components/elements/external-link";

const DOCS_URL = "https://docs.vana.org";
const GITHUB_URL = "https://github.com/vana-com/vana-connect";

export function AdminFooterLinks() {
  return (
    <div className="flex items-center justify-center gap-5">
      <ExternalLink href={GITHUB_URL} leadingIcon={GithubIcon}>
        GitHub
      </ExternalLink>
      <ExternalLink href={DOCS_URL} leadingIcon={BookOpenTextIcon}>
        Documentation
      </ExternalLink>
    </div>
  );
}
