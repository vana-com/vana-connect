import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/e2e/test-connect-flow.ts"],
    testTimeout: 60_000,
  },
});
