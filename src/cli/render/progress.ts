import ora, { type Ora } from "ora";

import { detectRenderCapabilities } from "./capabilities.js";

export interface ProgressHandle {
  start(text: string): void;
  update(text: string): void;
  succeed(text: string): void;
  fail(text: string): void;
  stop(): void;
}

export function createProgressHandle(options?: {
  enabled?: boolean;
}): ProgressHandle {
  const capabilities = detectRenderCapabilities();
  if (!options?.enabled || !capabilities.interactive) {
    return createNoopHandle();
  }

  let spinner: Ora | null = null;

  return {
    start(text: string) {
      if (spinner) {
        spinner.stop();
      }
      spinner = ora({
        text,
        isEnabled: true,
        discardStdin: false,
      }).start();
    },
    update(text: string) {
      if (!spinner) {
        this.start(text);
        return;
      }
      spinner.text = text;
    },
    succeed(text: string) {
      if (!spinner) {
        spinner = ora({ text, isEnabled: true, discardStdin: false });
      }
      spinner.succeed(text);
      spinner = null;
    },
    fail(text: string) {
      if (!spinner) {
        spinner = ora({ text, isEnabled: true, discardStdin: false });
      }
      spinner.fail(text);
      spinner = null;
    },
    stop() {
      spinner?.stop();
      spinner = null;
    },
  };
}

function createNoopHandle(): ProgressHandle {
  return {
    start() {},
    update() {},
    succeed() {},
    fail() {},
    stop() {},
  };
}
