import { createColors } from "picocolors";

// Vana accent blue
const ACCENT = [65, 65, 252] as const;
const SUCCESS = [0, 213, 11] as const;
const ERROR = [231, 0, 11] as const;

interface ConnectRendererOptions {
  isTTY: boolean;
  color: boolean;
}

interface ScopeLine {
  name: string;
  state: "active" | "done" | "failed";
  detail?: string; // e.g. "8 found" or error message
}

export function createConnectRenderer(options: ConnectRendererOptions) {
  const canAnimate = options.isTTY;
  const _colors = createColors(options.color);

  // Smooth double-beat with dark pause between cycles
  // dark → · → ✧ → ✦ (first beat) → ✧ → · → ✧ → ✦ (second beat, holds) → ✧ → · → dark
  const SPINNER_FRAMES = [
    { char: " ", duration: 180, dim: true },
    { char: "·", duration: 150, dim: true },
    { char: "✧", duration: 120, dim: false },
    { char: "✦", duration: 200, dim: false },
    { char: "✧", duration: 100, dim: false },
    { char: "·", duration: 80, dim: true },
    { char: "✧", duration: 120, dim: false },
    { char: "✦", duration: 500, dim: false },
    { char: "✧", duration: 120, dim: false },
    { char: "·", duration: 150, dim: true },
    { char: " ", duration: 120, dim: true },
  ];

  let title = "";
  const scopes: ScopeLine[] = [];
  let successMessage = "";
  let detailLines: string[] = [];
  let spinnerFrameIndex = 0;
  let spinnerElapsed = 0;
  let spinnerInterval: ReturnType<typeof setInterval> | null = null;
  let lastRenderedLineCount = 0;
  let isComplete = false;

  function rgb(r: number, g: number, b: number, text: string): string {
    if (!options.color) return text;
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
  }

  function dim(text: string): string {
    return options.color ? `\x1b[2m${text}\x1b[22m` : text;
  }

  function bold(text: string): string {
    return options.color ? `\x1b[1m${text}\x1b[22m` : text;
  }

  function renderSpinnerChar(): string {
    const frame = SPINNER_FRAMES[spinnerFrameIndex];
    const char = frame.dim
      ? dim(rgb(...ACCENT, frame.char))
      : rgb(...ACCENT, frame.char);
    return char;
  }

  function renderLine(scope: ScopeLine): string {
    if (scope.state === "done") {
      const check = rgb(...SUCCESS, "✓");
      const detail = scope.detail ? ` ${dim(`— ${scope.detail}`)}` : "";
      return `  ${check} ${scope.name}${detail}`;
    }
    if (scope.state === "failed") {
      const x = rgb(...ERROR, "✗");
      const detail = scope.detail ? ` ${dim(`— ${scope.detail}`)}` : "";
      return `  ${x} ${scope.name}${detail}`;
    }
    // active
    const spinner = renderSpinnerChar();
    return `  ${spinner} ${scope.name}`;
  }

  function render(): string {
    const lines: string[] = [];

    // Title
    lines.push(`  ${bold(title)}`);
    lines.push("");

    // Scope lines
    for (const scope of scopes) {
      lines.push(renderLine(scope));
    }

    // If complete, show success
    if (isComplete && successMessage) {
      lines.push("");
      lines.push(`  ${bold(successMessage)}`);
      for (const line of detailLines) {
        lines.push(`  ${dim(line)}`);
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
      const frame = SPINNER_FRAMES[spinnerFrameIndex];
      if (spinnerElapsed >= frame.duration) {
        spinnerElapsed = 0;
        spinnerFrameIndex = (spinnerFrameIndex + 1) % SPINNER_FRAMES.length;
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
    /** Set the flow title (e.g., "Connect GitHub") */
    setTitle(t: string) {
      title = t;
      if (!canAnimate) {
        process.stderr.write(`  ${bold(t)}\n\n`);
      }
    },

    /** A scope started being collected */
    scopeStarted(name: string) {
      scopes.push({ name, state: "active" });
      startSpinner();
      if (!canAnimate) {
        // Non-TTY: nothing to print yet, wait for completion
      }
      paint();
    },

    /** A scope completed successfully */
    scopeCompleted(name: string, detail?: string) {
      const scope = scopes.find((s) => s.name === name && s.state === "active");
      if (scope) {
        scope.state = "done";
        scope.detail = detail;
      } else {
        // Scope appeared and completed immediately
        scopes.push({ name, state: "done", detail });
      }
      // Reset spinner for next active scope
      spinnerFrameIndex = 0;
      spinnerElapsed = 0;

      if (!canAnimate) {
        const check = rgb(...SUCCESS, "✓");
        const detailStr = detail ? ` ${dim(`— ${detail}`)}` : "";
        process.stderr.write(`  ${check} ${name}${detailStr}\n`);
      }
      paint();
    },

    /** A scope failed */
    scopeFailed(name: string, error?: string) {
      const scope = scopes.find((s) => s.name === name && s.state === "active");
      if (scope) {
        scope.state = "failed";
        scope.detail = error;
      } else {
        scopes.push({ name, state: "failed", detail: error });
      }
      if (!canAnimate) {
        const x = rgb(...ERROR, "✗");
        const detailStr = error ? ` ${dim(`— ${error}`)}` : "";
        process.stderr.write(`  ${x} ${name}${detailStr}\n`);
      }
      paint();
    },

    /** Mark an info line (like "Signed in") as completed */
    phaseCompleted(label: string) {
      scopes.push({ name: label, state: "done" });
      if (!canAnimate) {
        const check = rgb(...SUCCESS, "✓");
        process.stderr.write(`  ${check} ${label}\n`);
      }
      paint();
    },

    /** Show success summary */
    complete(message: string, details: string[]) {
      stopSpinner();
      isComplete = true;
      successMessage = message;
      detailLines = details;
      if (!canAnimate) {
        process.stderr.write(`\n  ${bold(message)}\n`);
        for (const line of details) {
          process.stderr.write(`  ${dim(line)}\n`);
        }
      }
      paint();
      // Terminal bell
      process.stderr.write("\x07");
    },

    /** Show failure */
    fail(message: string, details: string[]) {
      stopSpinner();
      isComplete = true;
      successMessage = message;
      detailLines = details;
      if (!canAnimate) {
        process.stderr.write(`\n  ${message}\n`);
        for (const line of details) {
          process.stderr.write(`  ${dim(line)}\n`);
        }
      }
      paint();
    },

    /** Clean up (call in finally block) */
    destroy() {
      stopSpinner();
    },

    /** Pause rendering for prompts (stops spinner, prints newlines) */
    pauseForPrompt() {
      stopSpinner();
      // Final paint to show current state
      paint();
      process.stderr.write("\n");
    },

    /** Resume rendering after prompts */
    resumeAfterPrompt() {
      // Reset line count so next paint starts fresh below the prompt
      lastRenderedLineCount = 0;
      startSpinner();
    },
  };
}
