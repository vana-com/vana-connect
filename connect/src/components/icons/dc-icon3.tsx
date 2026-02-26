import { useId } from "react";
import {
  Svg as SvgComponent,
  type SvgIconProps,
} from "@/components/elements/svg";

export const DcIcon = (props: SvgIconProps) => {
  const idPrefix = useId().replace(/:/g, "");
  const bgGradientId = `${idPrefix}-bg-gradient`;
  const leftFilterId = `${idPrefix}-left-filter`;
  const rightFilterId = `${idPrefix}-right-filter`;

  return (
    <SvgComponent useBoxSize={true} viewBox="0 0 832 832" {...props}>
      <rect width="832" height="832" rx="183" fill={`url(#${bgGradientId})`} />
      <g filter={`url(#${leftFilterId})`}>
        <path
          d="M188.955 197.596C309.404 197.596 407.047 295.552 407.047 416C407.047 536.449 309.404 634.405 188.955 634.405C187.051 634.405 185.153 634.38 183.262 634.332C161.511 633.772 150.635 633.492 140.716 623.315C130.797 613.137 130.797 599.88 130.797 573.367V258.633C130.797 232.12 130.797 218.864 140.716 208.686C150.636 198.508 161.511 198.229 183.262 197.669C185.154 197.621 187.051 197.596 188.955 197.596Z"
          fill="white"
        />
      </g>
      <g filter={`url(#${rightFilterId})`}>
        <path
          d="M657.638 634.404C537.19 634.404 439.547 536.449 439.547 416.001C439.547 295.552 537.19 197.596 657.638 197.596C659.542 197.596 661.44 197.621 663.332 197.669C685.082 198.229 695.958 198.509 705.877 208.686C715.797 218.864 715.797 232.121 715.797 258.634L715.797 573.368C715.797 599.88 715.797 613.136 705.877 623.314C695.957 633.492 685.082 633.772 663.331 634.331C661.44 634.379 659.542 634.404 657.638 634.404Z"
          fill="white"
        />
      </g>
      <defs>
        <filter
          id={leftFilterId}
          x="90.1716"
          y="161.846"
          width="357.5"
          height="527.809"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="14.625" />
          <feGaussianBlur stdDeviation="20.3125" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_2351_5732"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2351_5732"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="-35.75" />
          <feGaussianBlur stdDeviation="17.875" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0"
          />
          <feBlend
            mode="normal"
            in2="shape"
            result="effect2_innerShadow_2351_5732"
          />
        </filter>
        <filter
          id={rightFilterId}
          x="398.922"
          y="161.846"
          width="357.5"
          height="527.808"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="14.625" />
          <feGaussianBlur stdDeviation="20.3125" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_2351_5732"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2351_5732"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="-35.75" />
          <feGaussianBlur stdDeviation="17.875" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0"
          />
          <feBlend
            mode="normal"
            in2="shape"
            result="effect2_innerShadow_2351_5732"
          />
        </filter>
        <linearGradient
          id={bgGradientId}
          x1="416"
          y1="0"
          x2="416"
          y2="832"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.100024" stopColor="#304DC0" />
          <stop offset="0.578171" stopColor="#121265" />
          <stop offset="0.956731" stopColor="#090939" />
        </linearGradient>
      </defs>
    </SvgComponent>
  );
};
