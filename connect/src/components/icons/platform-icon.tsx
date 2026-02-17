import Image from "next/image";
import type { ComponentProps, ComponentType, CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared platform icon utilities for displaying connector icons.
 * Used by Home.tsx and ConnectorUpdates.tsx.
 */

interface PlatformIconProps extends Omit<ComponentProps<"div">, "children"> {
  iconName: string;
  Icon?: ComponentType<{
    className?: string;
    style?: CSSProperties;
    "aria-hidden"?: boolean;
  }>;
  imageSrc?: string;
  imageAlt?: string;
  size?: number;
  inset?: number;
  fallbackLabel?: string;
  fallbackScale?: number;
  ariaHidden?: boolean;
}

const iconWrapper = "flex items-center justify-center rounded-button";

/**
 * Platform icon component
 * Displays a platform logo or first-letter fallback
 */
export function PlatformIcon({
  iconName,
  Icon,
  imageSrc,
  imageAlt = "",
  size = 32,
  inset = 4,
  className,
  style,
  fallbackLabel,
  fallbackScale = 0.75,
  ariaHidden,
  "aria-hidden": ariaHiddenProp,
  ...props
}: PlatformIconProps) {
  const resolvedAriaHidden = ariaHidden ?? ariaHiddenProp ?? true;
  const clampedInset = Math.max(0, inset);
  const innerSize = Math.max(1, size - clampedInset * 2);
  const wrapperStyle = {
    ...style,
    width: `${size}px`,
    height: `${size}px`,
  };

  if (imageSrc) {
    return (
      <div
        className={cn(iconWrapper, className)}
        aria-hidden={resolvedAriaHidden}
        style={wrapperStyle}
        {...props}
      >
        <Image
          src={imageSrc}
          alt={imageAlt}
          width={innerSize}
          height={innerSize}
          className="rounded-full object-cover"
          unoptimized
        />
      </div>
    );
  }

  if (Icon) {
    return (
      <div
        className={cn(iconWrapper, className)}
        aria-hidden={resolvedAriaHidden}
        style={wrapperStyle}
        {...props}
      >
        <Icon
          style={{ width: `${innerSize}px`, height: `${innerSize}px` }}
          aria-hidden
        />
      </div>
    );
  }

  // Fallback: show first letter
  const label = fallbackLabel?.trim() || iconName.charAt(0);
  const fontSize = Math.round(innerSize * fallbackScale);
  return (
    <div
      className={cn(
        iconWrapper,
        "text-background bg-foreground font-semibold",
        className,
      )}
      aria-hidden={resolvedAriaHidden}
      style={wrapperStyle}
      {...props}
    >
      <span
        className={cn("flex items-center justify-center")}
        style={{
          fontSize: `${fontSize}px`,
          width: `${innerSize}px`,
          height: `${innerSize}px`,
        }}
      >
        <span className="font-semibold">{label}</span>
      </span>
    </div>
  );
}
