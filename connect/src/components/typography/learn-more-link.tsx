import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { CONNECT_CONFIG } from "@/config/config";
import { cn } from "@/lib/classes";

type LearnMoreLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "href" | "children"
> & {
  href?: string;
  children?: ReactNode;
};

export function LearnMoreLink({
  href = CONNECT_CONFIG.docs.learnMoreUrl,
  children,
  className,
  ...props
}: LearnMoreLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("link", className)}
      {...props}
    >
      {children ?? "Learn more."}
    </a>
  );
}
