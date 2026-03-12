#!/usr/bin/env node

import { runCli } from "./index.js";

const exitCode = await runCli(process.argv);
if (typeof exitCode === "number") {
  process.exitCode = exitCode;
}
