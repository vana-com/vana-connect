import { detectRenderCapabilities } from "./capabilities.js";
import { createFlowTheme } from "./flow-theme.js";

interface ScopeLine {
  name: string;
  state: "active" | "done" | "failed";
  detail?: string; // e.g. "8 found" or error message
}

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
  const canAnimate = capabilities.interactive;
  const theme = createFlowTheme(capabilities);

  let titleText = "";
  const scopes: ScopeLine[] = [];
  let successMessage = "";
  const detailLines: string[] = [];
  let spinnerFrameIndex = 0;
  let spinnerElapsed = 0;
  let spinnerInterval: ReturnType<typeof setInterval> | null = null;
  let lastRenderedLineCount = 0;
  let isComplete = false;
  let isFailure = false;

  function renderSpinnerChar(): string {
    const frame = theme.spinnerFrames[spinnerFrameIndex];
    const char = frame.dim
      ? theme.dim(theme.active(frame.char))
      : theme.active(frame.char);
    return char;
  }

  function renderLine(scope: ScopeLine): string {
    if (scope.state === "done") {
      const check = theme.complete("\u2713");
      const detail = scope.detail
        ? ` ${theme.dim(`\u2014 ${scope.detail}`)}`
        : "";
      return `  ${check} ${scope.name}${detail}`;
    }
    if (scope.state === "failed") {
      const x = theme.error("\u2717");
      const detail = scope.detail
        ? ` ${theme.dim(`\u2014 ${scope.detail}`)}`
        : "";
      return `  ${x} ${scope.name}${detail}`;
    }
    // active
    const spinner = renderSpinnerChar();
    return `  ${spinner} ${scope.name}`;
  }

  function render(): string {
    const lines: string[] = [];

    // Title
    lines.push(`  ${theme.heading(titleText)}`);
    lines.push("");

    // Scope lines
    for (const scope of scopes) {
      lines.push(renderLine(scope));
    }

    // If complete, show success/failure + details
    if (isComplete && successMessage) {
      lines.push("");
      const prefix = isFailure
        ? theme.error("\u2717")
        : theme.success("\u2713");
      lines.push(`  ${prefix} ${theme.heading(successMessage)}`);
      for (const line of detailLines) {
        lines.push(`  ${theme.dim(line)}`);
      }
    }

    return lines.join("\n");
  }

  function paint() {
    if (!canAnimate) return;

    // Clear previous render
    if (lastRenderedLineCount > 0) {
      process.stderr.write(`\x1b[${lastRenderedLineCount}A`);
      for (let i = 0; i < lastRenderedLineCount; i++) {
        process.stderr.write("\x1b[2K\n");
      }
      process.stderr.write(`\x1b[${lastRenderedLineCount}A`);
    }

    const output = render();
    lastRenderedLineCount = output.split("\n").length;
    process.stderr.write(output + "\n");
  }

  function startSpinner() {
    if (!canAnimate || spinnerInterval) return;
    spinnerInterval = setInterval(() => {
      spinnerElapsed += 30;
      const frame = theme.spinnerFrames[spinnerFrameIndex];
      if (spinnerElapsed >= frame.duration) {
        spinnerElapsed = 0;
        spinnerFrameIndex =
          (spinnerFrameIndex + 1) % theme.spinnerFrames.length;
      }
      paint();
    }, 30);
  }

  function stopSpinner() {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
    }
  }

  return {
    title(source: string): void {
      titleText = `Connect ${source}`;
      if (!canAnimate) {
        process.stderr.write(`  ${theme.heading(titleText)}\n\n`);
      }
    },

    scopeActive(scope: string): void {
      // Don't add duplicate active scope
      const existing = scopes.find(
        (s) => s.name === scope && s.state === "active",
      );
      if (existing) return;

      // Auto-complete any previously active scopes
      for (const s of scopes) {
        if (s.state === "active") {
          s.state = "done";
          if (!canAnimate) {
            const check = theme.complete("\u2713");
            const detailStr = s.detail
              ? ` ${theme.dim(`\u2014 ${s.detail}`)}`
              : "";
            process.stderr.write(`  ${check} ${s.name}${detailStr}\n`);
          }
        }
      }
      // Reset spinner for new scope
      spinnerFrameIndex = 0;
      spinnerElapsed = 0;

      scopes.push({ name: scope, state: "active" });
      startSpinner();
      paint();
    },

    scopeDone(scope: string, detail?: string): void {
      const existing = scopes.find(
        (s) => s.name === scope && s.state === "active",
      );
      if (existing) {
        existing.state = "done";
        existing.detail = detail;
      } else {
        // Scope appeared and completed immediately
        scopes.push({ name: scope, state: "done", detail });
      }
      // Reset spinner for next active scope
      spinnerFrameIndex = 0;
      spinnerElapsed = 0;

      if (!canAnimate) {
        const check = theme.complete("\u2713");
        const detailStr = detail ? ` ${theme.dim(`\u2014 ${detail}`)}` : "";
        process.stderr.write(`  ${check} ${scope}${detailStr}\n`);
      }
      paint();
    },

    scopeFailed(scope: string, error: string): void {
      const existing = scopes.find(
        (s) => s.name === scope && s.state === "active",
      );
      if (existing) {
        existing.state = "failed";
        existing.detail = error;
      } else {
        scopes.push({ name: scope, state: "failed", detail: error });
      }
      if (!canAnimate) {
        const x = theme.error("\u2717");
        const detailStr = error ? ` ${theme.dim(`\u2014 ${error}`)}` : "";
        process.stderr.write(`  ${x} ${scope}${detailStr}\n`);
      }
      paint();
    },

    success(message: string): void {
      stopSpinner();
      // Resolve any still-active scopes to done
      for (const scope of scopes) {
        if (scope.state === "active") {
          scope.state = "done";
        }
      }
      isComplete = true;
      successMessage = message;
      if (!canAnimate) {
        const check = theme.success("\u2713");
        process.stderr.write(`\n  ${check} ${theme.heading(message)}\n`);
      }
      paint();
    },

    detail(message: string): void {
      detailLines.push(message);
      if (!canAnimate) {
        process.stderr.write(`  ${theme.dim(message)}\n`);
      }
      paint();
    },

    next(command: string): void {
      detailLines.push(`Next: ${command}`);
      if (!canAnimate) {
        process.stderr.write(
          `  ${theme.dim("Next:")} ${theme.heading(command)}\n`,
        );
      }
      paint();
    },

    fail(message: string): void {
      stopSpinner();
      isFailure = true;
      // Resolve any still-active scopes to failed
      for (const scope of scopes) {
        if (scope.state === "active") {
          scope.state = "failed";
        }
      }
      isComplete = true;
      successMessage = message;
      if (!canAnimate) {
        const x = theme.error("\u2717");
        process.stderr.write(`\n  ${x} ${message}\n`);
      }
      paint();
    },

    bell(): void {
      process.stderr.write("\x07");
    },

    cleanup(): void {
      stopSpinner();
    },

    pauseForPrompt(): void {
      stopSpinner();
      // Final paint to show current state
      paint();
      process.stderr.write("\n");
    },

    resumeAfterPrompt(): void {
      // Reset line count so next paint starts fresh below the prompt
      lastRenderedLineCount = 0;
      startSpinner();
    },
  };
}
