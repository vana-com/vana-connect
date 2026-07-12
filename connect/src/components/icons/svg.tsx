import type { ComponentPropsWithoutRef } from "react";

interface SvgStyleProps {
  boxSize?: string;
  useBoxSize?: boolean;
}

export type SvgIconProps = ComponentPropsWithoutRef<"svg"> & SvgStyleProps;

export const Svg = ({
  useBoxSize = true,
  boxSize = "1em",
  viewBox = "0 0 32 32",
  className,
  style,
  ...props
}: SvgIconProps) => (
  <svg
    className={className}
    fill="none"
    style={{
      ...(useBoxSize ? { width: boxSize, height: boxSize } : {}),
      ...style,
    }}
    viewBox={viewBox}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  />
);
