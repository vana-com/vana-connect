import { createColors } from "picocolors";

import type { RenderCapabilities } from "./capabilities.js";

const VANA_ACCENT = [65, 65, 252] as const;
const VANA_SUCCESS = [0, 213, 11] as const;
const VANA_DESTRUCTIVE = [231, 0, 11] as const;
const VANA_MUTED = [112, 112, 112] as const;
const VANA_WARNING = [186, 139, 0] as const;

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
  return createPaletteTheme(capabilities, {
    richSuccess: VANA_ACCENT,
    standardSuccess: "blue",
    standardInfo: "blue",
  });
}

export function createClassicTheme(
  capabilities: RenderCapabilities,
): RenderTheme {
  return createPaletteTheme(capabilities, {
    richSuccess: VANA_SUCCESS,
    standardSuccess: "green",
    standardInfo: "cyan",
  });
}

function createPaletteTheme(
  capabilities: RenderCapabilities,
  options: {
    richSuccess: readonly [number, number, number];
    standardSuccess: "blue" | "green";
    standardInfo: "blue" | "cyan";
  },
): RenderTheme {
  const colors = createColors(capabilities.color);
  const formatCode = (text: string) => `\`${text}\``;
  const richMuted = (text: string) => rgb(...VANA_MUTED, text);
  if (capabilities.tier === "rich") {
    return {
      accent: (text) => rgb(...VANA_ACCENT, text),
      heading: (text) => colors.bold(text),
      label: (text) => richMuted(colors.bold(text)),
      muted: (text) => richMuted(text),
      dim: (text) => colors.dim(text),
      success: (text) => rgb(...options.richSuccess, text),
      warning: (text) => rgb(...VANA_WARNING, text),
      error: (text) => rgb(...VANA_DESTRUCTIVE, text),
      info: (text) => rgb(...VANA_ACCENT, text),
      code: (text) => colors.bold(formatCode(text)),
    };
  }

  const standardSuccess =
    options.standardSuccess === "green" ? colors.green : colors.blue;
  const standardInfo =
    options.standardInfo === "cyan" ? colors.cyan : colors.blue;

  return {
    accent: (text) => colors.blue(text),
    heading: (text) => colors.bold(text),
    label: (text) => colors.bold(colors.gray(text)),
    muted: (text) => colors.gray(text),
    dim: (text) => colors.dim(text),
    success: (text) => standardSuccess(text),
    warning: (text) => colors.yellow(text),
    error: (text) => colors.red(text),
    info: (text) => standardInfo(text),
    code: (text) => colors.bold(formatCode(text)),
  };
}

function rgb(red: number, green: number, blue: number, text: string): string {
  return `\u001B[38;2;${red};${green};${blue}m${text}\u001B[39m`;
}
