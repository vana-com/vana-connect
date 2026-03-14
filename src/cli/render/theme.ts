import { createColors } from "picocolors";

import type { RenderCapabilities } from "./capabilities.js";

export interface RenderTheme {
  readonly accent: (text: string) => string;
  readonly heading: (text: string) => string;
  readonly label: (text: string) => string;
  readonly muted: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly success: (text: string) => string;
  readonly warning: (text: string) => string;
  readonly error: (text: string) => string;
  readonly info: (text: string) => string;
  readonly code: (text: string) => string;
}

export function createTheme(capabilities: RenderCapabilities): RenderTheme {
  const colors = createColors(capabilities.color);

  return {
    accent: (text) => colors.blue(text),
    heading: (text) => colors.bold(text),
    label: (text) => colors.bold(text),
    muted: (text) => colors.gray(text),
    dim: (text) => colors.dim(text),
    success: (text) => colors.green(text),
    warning: (text) => colors.yellow(text),
    error: (text) => colors.red(text),
    info: (text) => colors.cyan(text),
    code: (text) => colors.bold(text),
  };
}
