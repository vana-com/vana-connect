import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { fieldVariants } from "@/components/typography/field";
import { cn } from "@/lib/utils";

type InputProps = Omit<ComponentProps<"input">, "size"> &
  VariantProps<typeof fieldVariants>;

function Input({
  className,
  type,
  variant = "outline",
  size = "sm",
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldVariants({ variant, size }),
        // input layout
        "min-w-0",
        // input colors
        "bg-transparent border-input",
        // disabled
        "disabled:bg-input/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:disabled:bg-input/80",
        // file input
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
