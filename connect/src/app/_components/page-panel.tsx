import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/classes";

type PagePanelProps = ComponentPropsWithoutRef<"div"> & {
  footer?: ReactNode;
  footerClassName?: string;
  reserveFooterSpace?: boolean;
};

export function PagePanel({
  className,
  children,
  footer,
  footerClassName,
  reserveFooterSpace = true,
  ...props
}: PagePanelProps) {
  return (
    <div data-slot="page-panel" className="flex flex-col flex-1 gap-5">
      <div
        className={cn(
          "container bg-background rounded-squish",
          "py-small px-small",
          "min-h-mobile-width",
          "flex flex-col",
          "ring ring-input/20",
          // to anchor inner navs
          "relative",
          className,
        )}
        {...props}
      >
        {children}
      </div>
      {(reserveFooterSpace || footer) && (
        <div
          data-slot="page-panel-footer"
          className={cn(
            "flex items-center justify-center",
            "min-h-5",
            !footer && "pointer-events-none select-none",
            footerClassName,
          )}
          aria-hidden={!footer}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
