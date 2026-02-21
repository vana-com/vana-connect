import { cva } from "class-variance-authority";

export const stateInvalid =
  "aria-invalid:border-destructive dark:aria-invalid:ring-destructive/40";

// focus-visible: style the control itself when focus indicator should be shown.
export const stateFocus = [
  "outline-none",
  "focus-visible:outline-none",
  "focus-visible:border-ring",
  "focus-visible:ring-ring/50",
  "focus-visible:ring-[3px]",
  "focus-visible:ring-offset-0",
  "focus-visible:ring-offset-background",
];

// focus-within: style a wrapper when any descendant control is focused.
export const stateFocusWithin = [
  "outline-none",
  "focus-within:outline-none",
  "focus-within:border-ring",
  "focus-within:ring-ring/50",
  "focus-within:ring-[3px]",
  "focus-within:ring-offset-0",
  "focus-within:ring-offset-background",
];

export const fieldHeight = {
  xs: "h-button-xs", // 25px
  sm: "h-8", // 32px
  base: "h-9", // 36px
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
    "text-body placeholder:text-foreground-muted",
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
        outline: [
          "border border-ring/30 bg-background",
          "hover:border-ring",
          stateFocus,
        ],
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
