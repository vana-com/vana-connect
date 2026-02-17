import { Separator as SeparatorPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        // layout
        "shrink-0",
        // colors
        "bg-border",
        // horizontal
        "data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full",
        // vertical
        "data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
