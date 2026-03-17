import ora, { type Ora } from "ora";

import { detectRenderCapabilities } from "./capabilities.js";
import { createSymbols } from "./symbols.js";
import { createTheme } from "./theme.js";

export interface ConnectRenderer {
  title(source: string): void;
  scopeActive(scope: string): void;
  scopeDone(scope: string, detail?: string): void;
  scopeFailed(scope: string, error: string): void;
  success(message: string): void;
  detail(message: string): void;
  next(command: string): void;
  fail(message: string): void;
  bell(): void;
  cleanup(): void;
  /** Pause rendering for prompts (stops spinner) */
  pauseForPrompt(): void;
  /** Resume rendering after prompts */
  resumeAfterPrompt(): void;
}

export function createConnectRenderer(): ConnectRenderer {
  const capabilities = detectRenderCapabilities();
  const theme = createTheme(capabilities);
  const symbols = createSymbols(capabilities);
  const isTTY = capabilities.interactive;

  let spinner: Ora | null = null;
  let activeScope: string | null = null;

  function writeLine(line: string): void {
    process.stderr.write(`${line}\n`);
  }

  /** Move cursor up one line and clear it */
  function clearPreviousLine(): void {
    if (isTTY) {
      process.stderr.write("\x1b[1A\x1b[2K");
    }
  }

  function stopSpinner(): void {
    if (spinner) {
      spinner.stop();
      // Clear the spinner line
      if (isTTY) {
        clearPreviousLine();
      }
      spinner = null;
    }
  }

  function startScopeSpinner(scope: string): void {
    if (!isTTY) return;
    spinner = ora({
      text: scope,
      prefixText: " ",
      color: "blue",
      stream: process.stderr,
      discardStdin: false,
    }).start();
  }

  return {
    title(source: string): void {
      writeLine(`  ${theme.heading(`Connect ${source}`)}`);
      writeLine("");
    },

    scopeActive(scope: string): void {
      // If there's an active scope that hasn't been completed yet, skip
      if (activeScope === scope) return;

      // If there's a previous active scope with a spinner, stop it
      // (it will be replaced by a done/failed line from the caller)
      if (activeScope && spinner) {
        stopSpinner();
      }

      activeScope = scope;
      startScopeSpinner(scope);
    },

    scopeDone(scope: string, detail?: string): void {
      // If this scope had an active spinner, clear it
      if (activeScope === scope) {
        stopSpinner();
        activeScope = null;
      }

      const check = theme.success(symbols.success);
      const detailSuffix = detail ? ` ${theme.muted(`\u2014 ${detail}`)}` : "";
      writeLine(`  ${check} ${scope}${detailSuffix}`);
    },

    scopeFailed(scope: string, error: string): void {
      if (activeScope === scope) {
        stopSpinner();
        activeScope = null;
      }

      const x = theme.error(symbols.error);
      const detailSuffix = error ? ` ${theme.muted(`\u2014 ${error}`)}` : "";
      writeLine(`  ${x} ${scope}${detailSuffix}`);
    },

    success(message: string): void {
      stopSpinner();
      activeScope = null;
      writeLine("");
      writeLine(
        `  ${theme.success(symbols.success)} ${theme.heading(message)}`,
      );
    },

    detail(message: string): void {
      writeLine(`  ${theme.muted(message)}`);
    },

    next(command: string): void {
      writeLine(`  ${theme.muted("Next:")} ${theme.heading(command)}`);
    },

    fail(message: string): void {
      stopSpinner();
      activeScope = null;
      writeLine("");
      writeLine(`  ${theme.error(symbols.error)} ${message}`);
    },

    bell(): void {
      process.stderr.write("\x07");
    },

    cleanup(): void {
      stopSpinner();
    },

    pauseForPrompt(): void {
      stopSpinner();
    },

    resumeAfterPrompt(): void {
      if (activeScope) {
        startScopeSpinner(activeScope);
      }
    },
  };
}
