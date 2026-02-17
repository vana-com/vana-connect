import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn(className)} {...props} />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // layout
        "inline-flex w-fit items-center justify-center",
        // spacing
        "gap-1 p-1",
        // shape
        "rounded-none",
        // colors
        "bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // layout
        "inline-flex items-center justify-center whitespace-nowrap",
        // spacing
        "px-3 py-1.5",
        // shape
        "rounded-none",
        // typography
        "text-xs font-medium",
        // focus
        "outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
        // states
        "data-[state=active]:bg-background data-[state=active]:text-foreground",
        // disabled
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        // transitions
        "transition-colors",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        // focus
        "outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
