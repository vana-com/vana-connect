"use client";

import { ArrowUpRightIcon, type LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Text } from "@/components/typography/text";
import { cn } from "@/lib/classes";

type ExternalLinkProps = Omit<ComponentPropsWithoutRef<"a">, "children"> & {
  children: ReactNode;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon | null;
  leadingIconClassName?: string;
  trailingIconClassName?: string;
  textClassName?: string;
};

export function ExternalLink({
  children,
  className,
  leadingIcon: LeadingIcon,
  trailingIcon: TrailingIcon = ArrowUpRightIcon,
  leadingIconClassName,
  trailingIconClassName,
  target = "_blank",
  rel = "noopener noreferrer",
  textClassName,
  ...props
}: ExternalLinkProps) {
  return (
    <a
      target={target}
      rel={rel}
      className={cn(
        "inline-flex items-center gap-1.5 text-small text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      {LeadingIcon ? (
        <LeadingIcon
          className={cn("size-em", leadingIconClassName)}
          aria-hidden
        />
      ) : null}
      {typeof children === "string" ? (
        <Text
          as="span"
          intent="small"
          color="inherit"
          className={textClassName}
        >
          {children}
        </Text>
      ) : (
        children
      )}
      {TrailingIcon ? (
        <TrailingIcon
          className={cn("size-[0.9em] -ml-px", trailingIconClassName)}
          aria-hidden
        />
      ) : null}
    </a>
  );
}
