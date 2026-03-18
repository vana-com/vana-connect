import type { RenderCapabilities } from "./capabilities.js";

export interface RenderSymbols {
  readonly success: string;
  readonly error: string;
  readonly warning: string;
  readonly info: string;
  readonly bullet: string;
  readonly arrow: string;
}

export function createSymbols(capabilities: RenderCapabilities): RenderSymbols {
  if (!capabilities.unicode) {
    return {
      success: "OK",
      error: "x",
      warning: "!",
      info: "i",
      bullet: "-",
      arrow: "->",
    };
  }

  return {
    success: "✓",
    error: "✕",
    warning: "!",
    info: "•",
    bullet: "•",
    arrow: "→",
  };
}
