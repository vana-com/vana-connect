import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/classes";

type PageShellProps = {
  children: ReactNode;
  backHref?: string;
};

const DEFAULT_BACK_HREF = "/";

export function PageShell({
  children,
  backHref = DEFAULT_BACK_HREF,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "relative min-h-screen bg-[#F0F4F8]",
        "p-w8 pb-w32",
        "flex flex-col",
      )}
    >
      <Link
        href={backHref}
        className={cn(
          "absolute top-3 left-0",
          "inline-flex items-center gap-1.5 px-w8 h-[48px]",
          "text-muted-foreground",
          "transition-colors hover:text-foreground",
        )}
      >
        <ArrowLeftIcon aria-hidden="true" className="size-em" />
        Back
      </Link>

      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}
