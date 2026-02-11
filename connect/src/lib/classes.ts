import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Create a custom twMerge that recognizes all custom selectors using validators
// Full list of custom selectors: https://tailwindcss.com/docs/colors#working-with-colors
const customTwMerge = extendTailwindMerge({
  extend: {
    theme: {
      // Custom font sizes (text-*)
      text: [
        "pill",
        "fine",
        "small",
        "body",
        "button",
        "large",
        "xlarge",
        "heading",
        "subtitle",
        "title",
        "display",
        "hero",
      ],
      // Custom colors (text-*)
      color: [
        // Project semantic colors
        "frostgray",
        "stonebeige",
        "success",
      ],
      // Custom border radius values (rounded-*)
      radius: [
        "soft",
        "button",
        "card",
        "squish",
        "dialog",
        "sm",
        "md",
        "lg",
        "xl",
      ],
      // Custom spacing values (p-*, m-*, gap-*, etc.)
      spacing: [
        "em",
        "nav",
        "header",
        "footer",
        "tab",
        "banner",
        "bar",
        "button",
        "button-xs",
        "mobile-width",
        "desktop-width",
        // insets
        "inset",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}
