import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // layout
        "w-full min-w-0 h-8",
        // shape
        "rounded-none border px-2.5 py-1",
        // typography
        "text-xs md:text-xs placeholder:text-muted-foreground",
        // colors
        "bg-transparent border-input dark:bg-input/30",
        // focus
        "outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
        // aria-invalid
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        // disabled
        "disabled:bg-input/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:disabled:bg-input/80",
        // transitions
        "transition-colors",
        // file input
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
