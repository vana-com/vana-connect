import { useId } from "react";
import {
  Svg as SvgComponent,
  type SvgIconProps,
} from "@/components/elements/svg";

export const DcIcon = (props: SvgIconProps) => {
  const logoGradientId = useId().replace(/:/g, "");
  const tint = (color: string) =>
    `color-mix(in oklab, ${color} calc(100% - var(--logo-tint-strength, 0%)), var(--logo-tint, #1e3a8a) var(--logo-tint-strength, 0%))`;

  return (
    <SvgComponent useBoxSize={true} viewBox="0 0 200 200" {...props}>
      <path
        d="M125 175V108.333C125 106.123 124.122 104.004 122.559 102.441C120.996 100.878 118.877 100 116.667 100H83.3333C81.1232 100 79.0036 100.878 77.4408 102.441C75.878 104.004 75 106.123 75 108.333V175"
        stroke={`url(#${logoGradientId})`}
        strokeWidth="15.7895"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M25 83.3347C24.9994 80.9103 25.5278 78.5149 26.5482 76.3157C27.5687 74.1165 29.0566 72.1664 30.9083 70.6014L89.2417 20.6014C92.2499 18.059 96.0613 16.6641 100 16.6641C103.939 16.6641 107.75 18.059 110.758 20.6014L169.092 70.6014C170.943 72.1664 172.431 74.1165 173.452 76.3157C174.472 78.5149 175.001 80.9103 175 83.3347V158.335C175 162.755 173.244 166.994 170.118 170.12C166.993 173.245 162.754 175.001 158.333 175.001H41.6667C37.2464 175.001 33.0072 173.245 29.8816 170.12C26.7559 166.994 25 162.755 25 158.335V83.3347Z"
        stroke={`url(#${logoGradientId})`}
        strokeWidth="15.7895"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient
          id={logoGradientId}
          x1="100"
          y1="16.6641"
          x2="100"
          y2="175.001"
          gradientUnits="userSpaceOnUse"
        >
          <stop style={{ stopColor: tint("var(--logo-stop-0, #888888)") }} />
          <stop
            offset="1"
            style={{ stopColor: tint("var(--logo-stop-1, #161616)") }}
          />
        </linearGradient>
      </defs>
    </SvgComponent>
  );
};
