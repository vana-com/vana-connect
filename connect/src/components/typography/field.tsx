import { cva } from "class-variance-authority";

export const stateInvalid =
  "aria-invalid:border-destructive dark:aria-invalid:ring-destructive/40";

const focusStateBaseTokens = [
  "outline-none",
  "border-ring",
  "ring-ring/50",
  "ring-[3px]",
  "ring-offset-0",
  "ring-offset-background",
] as const;

const createFocusState = (prefix: "focus-visible" | "focus-within") => {
  return [
    "outline-none",
    ...focusStateBaseTokens.map((token) => `${prefix}:${token}`),
  ];
};

export const stateFocus = createFocusState("focus-visible");
export const stateFocusWithin = createFocusState("focus-within");

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
