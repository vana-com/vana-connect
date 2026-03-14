#!/usr/bin/env node

import { runCli } from "./index.js";

for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      process.exit(0);
    }
    throw error;
  });
}

const exitCode = await runCli(process.argv);
if (typeof exitCode === "number") {
  process.exitCode = exitCode;
}
