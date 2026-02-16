"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        // layout
        "relative flex w-full min-w-0 items-center group/input-group",
        // shape
        "rounded-none border h-8 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-start]]:h-auto has-[>textarea]:h-auto",
        // colors
        "border-input dark:bg-input/30",
        // focus
        "outline-none has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50",
        // aria-invalid
        "has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-1 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",
        // disabled
        "has-disabled:bg-input/50 has-disabled:opacity-50 dark:has-disabled:bg-input/80",
        // transitions
        "transition-colors",
        // alignment variants
        "has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        // combobox context
        "[[data-slot=combobox-content]_&]:focus-within:border-inherit [[data-slot=combobox-content]_&]:focus-within:ring-0",
        className,
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  [
    // layout
    "flex h-auto items-center justify-center gap-2",
    // typography
    "text-xs font-medium text-muted-foreground cursor-text select-none",
    // spacing
    "py-1.5",
    // states
    "group-data-[disabled=true]/input-group:opacity-50",
    // nested elements
    "[&>kbd]:rounded-none [&>svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      align: {
        "inline-start": [
          // layout
          "order-first",
          // spacing
          "pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]",
        ],
        "inline-end": [
          // layout
          "order-last",
          // spacing
          "pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]",
        ],
        "block-start": [
          // layout
          "order-first w-full justify-start",
          // spacing
          "px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
        ],
        "block-end": [
          // layout
          "order-last w-full justify-start",
          // spacing
          "px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2",
        ],
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  },
);

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return;
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva(
  [
    // layout
    "flex items-center gap-2",
    // typography
    "text-xs",
    // shadow
    "shadow-none",
  ],
  {
    variants: {
      size: {
        xs: [
          // layout
          "h-6 gap-1",
          // shape
          "rounded-none px-1.5",
          // svg
          "[&>svg:not([class*='size-'])]:size-3.5",
        ],
        sm: "",
        "icon-xs": [
          // layout
          "size-6",
          // shape
          "rounded-none p-0 has-[>svg]:p-0",
        ],
        "icon-sm": [
          // layout
          "size-8",
          // shape
          "p-0 has-[>svg]:p-0",
        ],
      },
    },
    defaultVariants: {
      size: "xs",
    },
  },
);

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size"> &
  VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        // layout
        "flex items-center gap-2",
        // typography
        "text-xs text-muted-foreground",
        // svg
        "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "size">) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        // layout
        "flex-1",
        // shape
        "rounded-none border-0",
        // colors
        "bg-transparent dark:bg-transparent",
        // shadow
        "shadow-none ring-0",
        // focus
        "focus-visible:ring-0",
        // disabled
        "disabled:bg-transparent dark:disabled:bg-transparent",
        // aria-invalid
        "aria-invalid:ring-0",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        // layout
        "flex-1 resize-none",
        // shape
        "rounded-none border-0",
        // colors
        "bg-transparent dark:bg-transparent",
        // spacing
        "py-2",
        // shadow
        "shadow-none ring-0",
        // focus
        "focus-visible:ring-0",
        // disabled
        "disabled:bg-transparent dark:disabled:bg-transparent",
        // aria-invalid
        "aria-invalid:ring-0",
        className,
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
};
