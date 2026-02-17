"use client";

import { Label as LabelPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        // layout
        "flex items-center gap-2",
        // typography
        "text-xs leading-none select-none",
        // disabled (group)
        "group-data-[disabled=true]:opacity-50 group-data-[disabled=true]:pointer-events-none",
        // disabled (peer)
        "peer-disabled:opacity-50 peer-disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
