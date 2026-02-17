import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Text, type TextProps } from "@/components/typography/text";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type EyebrowBadgeProps = ComponentPropsWithoutRef<typeof Badge> & {
  children: ReactNode;
  textClassName?: string;
  textProps?: Omit<TextProps<"span">, "as" | "children" | "intent">;
};

export function EyebrowBadge({
  children,
  className,
  textClassName,
  textProps,
  ...props
}: EyebrowBadgeProps) {
  return (
    <Badge className={cn("h-5 px-1.5 rounded-soft", className)} {...props}>
      <Text
        as="span"
        intent="pillEyebrow"
        color="inherit"
        weight="normal"
        className={textClassName}
        {...textProps}
      >
        {children}
      </Text>
    </Badge>
  );
}
