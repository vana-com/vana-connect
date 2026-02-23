import { Slot as SlotPrimitive } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown, type LucideIcon } from "lucide-react";
import type * as React from "react";
import {
  fieldHeight,
  stateFocus,
  stateInvalid,
} from "@/components/typography/field";
import { cn } from "@/lib/classes";

const buttonVariants = cva(
  [
    // layout
    "inline-flex items-center justify-center shrink-0",
    "rounded-button",
    // interactions
    "group cursor-pointer select-none",
    // typography
    "font-medium",
    "whitespace-nowrap",
    // disabled
    "disabled:pointer-events-none disabled:opacity-50",
    // aria & focus states
    stateInvalid,
    stateFocus,
    // svg
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "[&_svg:not([class*='size-']):not([data-slot=spinner])]:size-em",
    "[&_svg[data-slot=spinner]]:size-[0.8em]",
    "[&_svg]:translate-y-[-0.025em]",
    // transitions
    "transition-all",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90 data-[state=open]:bg-primary/90",
        accent:
          "bg-accent text-background hover:bg-accent-foreground data-[state=open]:bg-accent-surface",
        iris: "bg-iris text-background hover:bg-iris-foreground data-[state=open]:bg-iris-surface",
        default: "bg-foreground text-background hover:bg-foreground",
        outline: [
          // shadow-xs
          "border border-ring/30 bg-background",
          // "hover:bg-muted "
          "hover:border-ring active:border-ring",
          "active:ring-ring/50 active:ring-[3px] data-[state=open]:border-ring data-[state=open]:ring-ring/50 data-[state=open]:ring-[3px]",
          // ARIA-driven persistent selection
          "aria-pressed:border-ring aria-pressed:ring-ring/50 aria-pressed:ring-[3px]",
          "aria-selected:border-ring aria-selected:ring-ring/50 aria-selected:ring-[3px]",
        ],
        ghost: "hover:bg-muted hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "bg-destructive-foreground text-destructive-reverse hover:bg-destructive-foreground/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 ",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        pill: [fieldHeight.xs, "rounded-full px-1.5 py-0.5 gap-1", "text-fine"],
        xs: [
          fieldHeight.xs,
          "rounded-button gap-1 px-2 has-[>svg]:px-2",
          "[&_svg:not([class*='size-'])]:size-[0.9em]!",
          "text-fine",
        ],
        sm: [
          fieldHeight.sm,
          "rounded-button gap-1.5 px-2.5 has-[>svg]:px-2.5",
          "text-small",
        ],
        icon: [
          // same height as fieldHeight.default,
          "size-button shrink-0 [&_svg:not([class*=size-])]:size-5.5",
        ],
        default: [
          fieldHeight.default,
          "rounded-button px-4 has-[>svg]:px-3 gap-1.5",
          "text-button",
        ],
        lg: [
          fieldHeight.lg,
          "rounded-button px-6 has-[>svg]:px-4 gap-1.5",
          "text-button",
        ],
        xl: [
          fieldHeight.xl,
          "rounded-button px-6 has-[>svg]:px-4 gap-1.75",
          "[&_svg:not([class*='size-'])]:size-[0.9lh]", // test lh :)
          // "[&_svg:not([class*='size-'])]:size-[1.25em]",
          "text-button",
        ],
      },
      fullWidth: {
        true: "w-full",
      },
    },
    compoundVariants: [
      {
        size: ["pill", "xs", "sm"],
        className: "[&_svg:not([data-slot=spinner])]:translate-y-[-0.05em]",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      // mode: "default",
      // shape: "default",
      // appearance: "default",
    },
  },
);

/**
 * States (short + explicit):
 * - active (:active): pointer is down. Transient press feedback only.
 * - pressed (aria-pressed): toggle control is ON. Persistent. Use for toggles.
 * - selected (aria-selected): this item is chosen in a group/list. Persistent.
 * - legacy selected: `selected` prop sets data-state="open" (kept for compat).
 * - focus-visible: ring via stateFocus.
 *
 * Use:
 * <Button variant="outline" aria-pressed>…</Button>
 * <Button variant="outline" aria-selected>…</Button>
 */
function Button({
  className,
  selected,
  variant,
  size,
  fullWidth,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    selected?: boolean;
    asChild?: boolean;
  }) {
  const Comp = asChild ? SlotPrimitive : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({
          variant,
          size,
          fullWidth,
          className,
        }),
        asChild && props.disabled && "pointer-events-none opacity-50",
      )}
      {...(selected && {
        "data-state": "open",
        "aria-pressed": true,
        "aria-selected": true,
      })}
      {...props}
    />
  );
}

interface ButtonArrowProps extends React.SVGProps<SVGSVGElement> {
  icon?: LucideIcon;
}

/**
 * Styled icon for button suffixes (dropdowns, menus, etc.).
 * Uses `ms-auto` to push to the right edge.
 *
 * @example
 * <Button>Label<ButtonArrow /></Button>
 * <Button>Label<ButtonArrow icon={ArrowRight} /></Button>
 */
function ButtonArrow({
  icon: Icon = ChevronDown,
  className,
  ...props
}: ButtonArrowProps) {
  return (
    <Icon
      data-slot="button-arrow"
      className={cn("ms-auto -me-1", className)}
      {...props}
    />
  );
}

export { Button, ButtonArrow, buttonVariants };
