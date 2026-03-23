import type { RenderCapabilities } from "./capabilities.js";
import { createTheme } from "./theme.js";

export interface FlowSpinnerFrame {
  readonly char: string;
  readonly duration: number;
  readonly dim: boolean;
}

export interface FlowTheme {
  readonly active: (text: string) => string;
  readonly complete: (text: string) => string;
  readonly success: (text: string) => string;
  readonly error: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly heading: (text: string) => string;
  readonly spinnerFrames: readonly FlowSpinnerFrame[];
}

export function createFlowTheme(capabilities: RenderCapabilities): FlowTheme {
  const theme = createTheme(capabilities);

  return {
    active: theme.accent,
    complete: theme.success,
    success: theme.success,
    error: theme.error,
    dim: theme.dim,
    heading: theme.heading,
    spinnerFrames: [
      { char: " ", duration: 180, dim: true },
      { char: "\u00B7", duration: 150, dim: true },
      { char: "\u2727", duration: 120, dim: false },
      { char: "\u2726", duration: 200, dim: false },
      { char: "\u2727", duration: 100, dim: false },
      { char: "\u00B7", duration: 80, dim: true },
      { char: "\u2727", duration: 120, dim: false },
      { char: "\u2726", duration: 500, dim: false },
      { char: "\u2727", duration: 120, dim: false },
      { char: "\u00B7", duration: 150, dim: true },
      { char: " ", duration: 120, dim: true },
    ],
  };
}
