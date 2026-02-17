import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/classes";

type PagePanelProps = ComponentPropsWithoutRef<"div">;

export function PagePanel({ className, ...props }: PagePanelProps) {
  return (
    <div
      className={cn(
        "container bg-background rounded-squish",
        "py-small px-small",
        "min-h-mobile-width",
        "flex flex-col",
        "ring ring-input/20",
        className,
      )}
      {...props}
    />
  );
}
