import fs from "node:fs";
import path from "node:path";

export function findDataConnectorsDir(cwd = process.cwd()): string | null {
  const envPath = process.env.VANA_DATA_CONNECTORS_DIR;
  const candidates = [
    envPath,
    path.resolve(cwd, "../data-connectors"),
    path.resolve(import.meta.dirname, "../../../data-connectors"),
    path.resolve(import.meta.dirname, "../../../../data-connectors"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "registry.json")) &&
      fs.existsSync(path.join(candidate, "skills", "vana-connect", "scripts"))
    ) {
      return candidate;
    }
  }

  return null;
}
