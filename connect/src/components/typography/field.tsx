import { cva } from "class-variance-authority";

export const stateInvalid =
  "aria-invalid:border-destructive dark:aria-invalid:ring-destructive/40";

export const stateFocus = [
  // remove outline
  "outline-none",
  "focus-visible:outline-none",
  // ring
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  // ring offset
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
];

export const fieldHeight = {
  xs: "h-button-xs", // 25px
  sm: "h-8", // 32px
  base: "h-9", // 36px (UNUSED except for icon buttons)
  default: "h-button", // 44px
  lg: "h-tab", // 54px
  xl: "h-16", // 64px
};

export const fieldVariants = cva(
  [
    // layout
    "flex w-full",
    "rounded-button px-3 py-1",

    // typography
    "text-body placeholder:text-foreground-dim",

    // transitions
    "transition-[color,box-shadow]",

    // focus & validation states
    stateInvalid,
    "outline-none",

    // disabled state
    "disabled:cursor-not-allowed disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        default: "border-none bg-muted",
        outline: ["border border-input", stateFocus],
      },
      size: {
        sm: fieldHeight.sm,
        default: fieldHeight.default,
        lg: fieldHeight.lg,
        xl: fieldHeight.xl,
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
