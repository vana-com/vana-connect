import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/classes";

export function getPageShellActionButtonClassName(className?: string) {
  return buttonVariants({
    variant: "ghost",
    size: "sm",
    className: cn(
      "px-w6 bg-foreground/[0.03] text-foreground-dim font-normal",
      "hover:bg-iris/[0.07]! hover:text-iris",
      className,
    ),
  });
}
