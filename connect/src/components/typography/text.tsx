import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

const eyebrowStyle =
  "subpixel-antialiased uppercase leading-none tracking-[0.05em]";

export const textVariants = cva(
  [
    // Basic defaults
    "[&_strong]:font-medium",
  ],
  {
    variants: {
      // Primitives: structural building blocks
      // "I need bold text"
      weight: {
        light: "font-light",
        normal: "font-normal",
        medium: "font-medium",
        semi: "font-semibold",
        bold: "font-bold",
      },
      align: {
        left: "text-left",
        center: "text-center",
        right: "text-right",
      },
      color: {
        background: "text-background",
        foreground: "text-foreground",
        foregroundDim: "text-foreground-dim",
        foregroundMuted: "text-foreground-muted",
        muted: "text-muted",
        mutedForeground: "text-muted-foreground",
        accent: "text-accent",
        accentForeground: "text-accent-foreground",
        destructive: "text-destructive-foreground",
        success: "text-success-foreground",
        inherit: "text-inherit",
        // extras
        iris: "text-iris",
      },
      // Patterns: intentional design decisions
      // "I need a section label" (driven by size)
      intent: {
        pill: ["text-pill subpixel-antialiased"],
        pillEyebrow: ["text-pill", eyebrowStyle],
        fine: "text-fine",
        eyebrow: ["text-fine", eyebrowStyle],
        sm: "text-small",
        small: "text-small",
        body: "text-body",
        button: "text-button",
        lg: "text-large",
        large: "text-large",
        xl: "text-xlarge",
        xlarge: "text-xlarge",
        heading: "text-heading",
        subtitle: "text-subtitle",
        title: "text-title text-balance font-[450]",
        display: "text-display text-balance font-[450]",
        hero: "text-hero text-balance font-[450]",
      },
      // opsz 32 matches Inter's static Display font
      optical: {
        auto: "",
        display: '[font-variation-settings:"opsz"_32]',
      },
      link: {
        // style specified in utils.css
        default: "link",
      },
      dim: {
        // TODO: consider using Color Mix for these so they relate back to the currentColor used
        true: "text-foreground-dim",
      },
      muted: {
        true: "text-foreground-muted",
      },
      caps: {
        true: "uppercase",
      },
      inline: {
        true: "leading-none",
      },
      balance: {
        true: "text-balance",
      },
      mono: {
        true: "font-mono",
      },
      truncate: {
        // For text truncation to work properly, the element needs a constrained width (explicit or from its container):
        // 1. min-w-0 prevents overflow in flex/grid parents
        // 2. max-w-full works in non-flex contexts
        // 3. w-full guarantees a defined width; flex-1 is intentionally omitted because it can interfere with ellipsis in nested flex-columns
        true: "truncate min-w-0 max-w-full w-full",
      },
      withIcon: {
        true: [
          "flex items-center gap-1.5",
          "[&_svg:not([class*=size-]):not([data-slot=spinner])]:size-[0.9em]",
          "[&_svg[data-slot=spinner]]:size-[0.8em]",
          // "[&_svg]:transform [&_svg]:translate-y-[-0.1em]",
        ],
      },
      pre: {
        true: "whitespace-pre-wrap font-mono",
      },
      bullet: {
        true: [
          // "relative before:content-['']",
          // "before:absolute before:inline-block before:bg-current",
          // "before:-left-[1.25em] before:top-[0.66em] before:h-[0.05em] before:w-[1em]",
          "list-disc",
        ],
      },
    },
    compoundVariants: [
      // mono displays
      {
        intent: ["heading", "subtitle", "title", "display", "hero"],
        mono: true,
        className: "tracking-[0.0125em]",
      },
      // mono
      {
        mono: true,
        caps: true,
        className: "tracking-[0.05em]",
      },
      // with icon
      {
        withIcon: true,
        intent: ["heading", "title"],
        className: [
          "gap-1",
          "[&:has([data-slot=spinner])]:gap-2.5",
          "[&_svg:not([class*=size-]):not([data-slot=spinner])]:size-[1.1em]",
          "[&_svg[data-slot=spinner]]:size-[0.75em]",
        ],
      },
      {
        withIcon: true,
        intent: ["button"],
        className: "gap-2",
      },
      {
        withIcon: true,
        intent: ["pill", "fine"],
        className: "gap-1",
      },
      {
        withIcon: true,
        align: "center",
        className: "justify-center",
      },
    ],
    defaultVariants: {
      intent: "body",
      color: "foreground",
      weight: "normal",
      optical: "auto",
    },
  },
);

type TextIntent = NonNullable<VariantProps<typeof textVariants>["intent"]>;
const displayIntents = new Set<TextIntent>(["title", "display", "hero"]);

export type TextProps<T extends ElementType = "div"> = VariantProps<
  typeof textVariants
> &
  Omit<ComponentPropsWithoutRef<T>, "color"> & {
    as?: T;
    children: ReactNode;
  };

export const Text = <T extends ElementType = "div">({
  as: Component,
  className,
  intent,
  color,
  weight,
  align,
  caps,
  inline,
  mono,
  balance,
  optical,
  truncate,
  bullet,
  pre,
  link,
  dim,
  muted,
  withIcon,
  children,
  ...props
}: TextProps<T>) => {
  const ResolvedComponent = Component ?? "div";
  const bulletProp = ResolvedComponent === "li" ? true : bullet;
  const preProp = ResolvedComponent === "pre" ? true : pre;
  const resolvedOptical =
    optical ?? (displayIntents.has(intent ?? "body") ? "display" : "auto");

  const formattedChildren: React.ReactNode =
    typeof children === "string" ? formatText(children) : children;

  return (
    <ResolvedComponent
      data-component="text"
      className={cn(
        textVariants({
          intent,
          color,
          weight,
          align,
          caps,
          inline,
          mono,
          balance,
          optical: resolvedOptical,
          truncate,
          pre: preProp,
          bullet: bulletProp,
          link,
          withIcon,
          dim,
          muted,
          className,
        }),
        // Component === "ul" ? "pl-bullet" : ""
      )}
      {...props}
    >
      {formattedChildren}
    </ResolvedComponent>
  );
};

// Doubles: &ldquo; &rdquo;  “ ” "Pretty"
// Singles: &lsquo; &rsquo; ’ ‘ 'Pretty'
function formatText(text: string): string {
  return text
    .replace(/'/g, "\u2019") // Left single quote (&lsquo; or '\u2019')
    .replace(/'/g, "\u2018") // Right single quote (&rsquo; or '\u2018')
    .replace(/"/g, "\u201C") // Left double quote (&ldquo; or '\u201C')
    .replace(/"/g, "\u201D"); // Right double quote (&rdquo; or '\u201D')
}
