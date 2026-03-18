import fs from "node:fs";
import path from "node:path";

export function findDataConnectorsDir(cwd = process.cwd()): string | null {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (value: string | undefined) => {
    if (!value) {
      return;
    }
    const resolved = path.resolve(value);
    if (seen.has(resolved)) {
      return;
    }
    seen.add(resolved);
    candidates.push(resolved);
  };

  pushCandidate(process.env.VANA_DATA_CONNECTORS_DIR);

  let currentDir = path.resolve(cwd);
  while (true) {
    pushCandidate(currentDir);
    pushCandidate(path.join(currentDir, "data-connectors"));

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

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
