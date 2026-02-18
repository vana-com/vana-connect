"use client";

import {
  ArrowUpRightIcon,
  BookOpenTextIcon,
  GithubIcon,
  type LucideIcon,
} from "lucide-react";

const DOCS_URL = "https://docs.vana.org";
const GITHUB_URL = "https://github.com/vana-com/vana-connect";

type FooterExternalLinkProps = {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
};

function FooterExternalLink({
  href,
  icon: Icon,
  children,
}: FooterExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-small text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon className="size-4" aria-hidden />
      {children}
      <ArrowUpRightIcon className="size-3.5" aria-hidden />
    </a>
  );
}

export function AdminFooterLinks() {
  return (
    <div className="flex items-center justify-center gap-5">
      <FooterExternalLink href={GITHUB_URL} icon={GithubIcon}>
        GitHub
      </FooterExternalLink>
      <FooterExternalLink href={DOCS_URL} icon={BookOpenTextIcon}>
        Documentation
      </FooterExternalLink>
    </div>
  );
}
