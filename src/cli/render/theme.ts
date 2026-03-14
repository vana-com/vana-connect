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
  if (capabilities.tier === "rich") {
    return {
      accent: (text) => rgb(65, 65, 252, text),
      heading: (text) => colors.bold(text),
      label: (text) => colors.bold(text),
      muted: (text) => rgb(115, 115, 115, text),
      dim: (text) => colors.dim(text),
      success: (text) => rgb(0, 213, 11, text),
      warning: (text) => rgb(186, 139, 0, text),
      error: (text) => rgb(220, 38, 38, text),
      info: (text) => rgb(65, 65, 252, text),
      code: (text) => colors.bold(text),
    };
  }

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

function rgb(red: number, green: number, blue: number, text: string): string {
  return `\u001B[38;2;${red};${green};${blue}m${text}\u001B[39m`;
}
