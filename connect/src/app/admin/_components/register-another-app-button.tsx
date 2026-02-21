"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classes";

type RegisterAnotherAppButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "asChild" | "children"
> & {
  children?: React.ReactNode;
  href?: string;
};

export function RegisterAnotherAppButton({
  href,
  className,
  type,
  children = "Register another app",
  ...props
}: RegisterAnotherAppButtonProps) {
  const content = (
    <>
      <div className="rounded-full border p-0.5 text-current group-hover:border-ring">
        <PlusIcon className="size-em" />
      </div>
      {children}
    </>
  );

  if (href) {
    return (
      <Button
        asChild
        size="sm"
        variant="outline"
        className={cn("text-foreground-muted hover:text-foreground", className)}
        {...props}
      >
        <Link href={href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button
      type={type ?? "button"}
      size="sm"
      variant="outline"
      className={cn("text-foreground-muted hover:text-foreground", className)}
      {...props}
    >
      {content}
    </Button>
  );
}
