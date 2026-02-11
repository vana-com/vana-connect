import type { ComponentProps } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/classes";

type ActionButtonProps = ComponentProps<typeof Button>;

export function ActionButton({
  className,
  children,
  variant = "outline",
  size = "xl",
  fullWidth = true,
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      className={cn("px-4", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

type ActionPanelProps = ComponentProps<"div"> &
  Pick<ActionButtonProps, "fullWidth" | "size" | "variant">;

export function ActionPanel({
  className,
  children,
  variant = "outline",
  size = "xl",
  fullWidth = true,
  ...props
}: ActionPanelProps) {
  return (
    <div
      className={cn(
        buttonVariants({ variant, size, fullWidth }),
        "cursor-default px-4",
        // "bg-background/40 hover:bg-background/40 hover:border-ring/20",
        "hover:border-ring/20",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
