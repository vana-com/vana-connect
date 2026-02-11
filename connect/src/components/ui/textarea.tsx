import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // layout
        "flex w-full min-h-16 field-sizing-content",
        // shape
        "rounded-none border px-2.5 py-2",
        // typography
        "text-xs md:text-xs placeholder:text-muted-foreground",
        // colors
        "bg-transparent border-input dark:bg-input/30",
        // focus
        "outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
        // aria-invalid
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        // disabled
        "disabled:bg-input/50 disabled:cursor-not-allowed disabled:opacity-50 dark:disabled:bg-input/80",
        // transitions
        "transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
