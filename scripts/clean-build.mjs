import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

await Promise.all([
  fsp.rm(path.join(repoRoot, "dist"), { recursive: true, force: true }),
  fsp.rm(path.join(repoRoot, "tsconfig.tsbuildinfo"), { force: true }),
]);
