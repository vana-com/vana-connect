import type { CSSProperties } from "react";

export const dotPatternSvg = `
<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <circle cx="1" cy="1" r="1" fill="#000" fill-opacity="0.09" />
</svg>
`.trim();

export const dotPatternDataUrl = `url("data:image/svg+xml,${encodeURIComponent(
  dotPatternSvg,
)}")`;

export const dotPatternStyle: CSSProperties = {
  backgroundImage: dotPatternDataUrl,
  backgroundAttachment: "fixed",
};
