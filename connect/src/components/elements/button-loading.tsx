import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Spinner } from "@/components/elements/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classes";

type LoadingButtonProps = ComponentPropsWithoutRef<typeof Button> & {
  isLoading?: boolean;
  loadingLabel?: ReactNode;
  spinnerClassName?: string;
};

export function LoadingButton({
  type = "button",
  disabled,
  isLoading = false,
  loadingLabel,
  spinnerClassName,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button type={type} disabled={disabled || isLoading} {...props}>
      {isLoading ? (
        <>
          <Spinner className={cn("shrink-0", spinnerClassName)} />
          {loadingLabel ?? children ?? "Loading…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
