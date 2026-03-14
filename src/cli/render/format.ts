import {
  type RenderCapabilities,
  detectRenderCapabilities,
} from "./capabilities.js";
import { createSymbols, type RenderSymbols } from "./symbols.js";
import { createTheme, type RenderTheme } from "./theme.js";

type Tone = "accent" | "success" | "warning" | "error" | "muted" | "info";

export interface HumanRenderer {
  readonly capabilities: RenderCapabilities;
  readonly symbols: RenderSymbols;
  readonly theme: RenderTheme;
  blank(): string;
  title(text: string): string;
  success(text: string): string;
  section(text: string): string;
  keyValue(label: string, value: string, tone?: Tone): string;
  sourceTitle(name: string, badges?: string[]): string;
  detail(text: string): string;
  bullet(text: string): string;
  badge(text: string, tone?: Tone): string;
}

export function createHumanRenderer(): HumanRenderer {
  const capabilities = detectRenderCapabilities();
  const theme = createTheme(capabilities);
  const symbols = createSymbols(capabilities);

  return {
    capabilities,
    symbols,
    theme,
    blank() {
      return "";
    },
    title(text) {
      return theme.heading(text);
    },
    success(text) {
      return `${theme.success(symbols.success)} ${theme.heading(text)}`;
    },
    section(text) {
      return `${theme.accent(symbols.arrow)} ${theme.accent(text)}`;
    },
    keyValue(label, value, tone = "muted") {
      return `${theme.label(`${label}:`)} ${applyTone(theme, tone, value)}`;
    },
    sourceTitle(name, badges = []) {
      if (badges.length === 0) {
        return theme.heading(name);
      }
      return `${theme.heading(name)} ${badges.join(" ")}`;
    },
    detail(text) {
      return `  ${theme.dim(text)}`;
    },
    bullet(text) {
      return `${theme.muted(symbols.bullet)} ${text}`;
    },
    badge(text, tone = "muted") {
      return applyTone(theme, tone, `[${text}]`);
    },
  };
}

function applyTone(theme: RenderTheme, tone: Tone, text: string): string {
  switch (tone) {
    case "accent":
      return theme.accent(text);
    case "success":
      return theme.success(text);
    case "warning":
      return theme.warning(text);
    case "error":
      return theme.error(text);
    case "info":
      return theme.info(text);
    case "muted":
    default:
      return theme.muted(text);
  }
}
