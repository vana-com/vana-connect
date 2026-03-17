import os from "node:os";
import path from "node:path";

import {
  type RenderCapabilities,
  detectRenderCapabilities,
} from "./capabilities.js";
import { createSymbols, type RenderSymbols } from "./symbols.js";
import { createTheme, type RenderTheme } from "./theme.js";

type Tone = "accent" | "success" | "warning" | "error" | "muted" | "info";
const KEY_VALUE_LABEL_WIDTH = 14;

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
      return `${theme.accent(symbols.arrow)} ${theme.heading(text)}`;
    },
    keyValue(label, value, tone = "muted") {
      const rawLabel = `${label}:`;
      const paddedLabel =
        rawLabel.length >= KEY_VALUE_LABEL_WIDTH
          ? rawLabel
          : rawLabel.padEnd(KEY_VALUE_LABEL_WIDTH);
      return `  ${theme.label(paddedLabel)} ${applyTone(theme, tone, value)}`;
    },
    sourceTitle(name, badges = []) {
      if (badges.length === 0) {
        return theme.heading(name);
      }
      return `${theme.heading(name)} ${badges.join(" ")}`;
    },
    detail(text) {
      return `  ${theme.muted(text)}`;
    },
    bullet(text) {
      return `  ${theme.muted(symbols.bullet)} ${text}`;
    },
    badge(text, tone = "muted") {
      return `${theme.muted("[")}${applyTone(theme, tone, text)}${theme.muted("]")}`;
    },
  };
}

export function formatDisplayPath(
  filePath: string,
  homeDir = os.homedir(),
): string {
  if (filePath === homeDir) {
    return "~";
  }

  if (filePath.startsWith(`${homeDir}${path.sep}`)) {
    return `~${filePath.slice(homeDir.length)}`;
  }

  return filePath;
}

export function tableRow(
  columns: Array<{ text: string; width: number }>,
): string {
  return columns
    .map((col) =>
      col.text.length >= col.width ? col.text : col.text.padEnd(col.width),
    )
    .join("  ");
}

export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return iso;
  }
  const diffMs = now - then;
  if (diffMs < 0) {
    return "just now";
  }
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
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
