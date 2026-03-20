import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getVanaHome } from "../core/paths.js";

/**
 * Returns the local cache directory for downloaded skills.
 * @returns Absolute path to `~/.vana/skills/`
 */
export function getSkillsCacheDir(): string {
  return path.join(getVanaHome(), "skills");
}

/**
 * Walks up from `cwd` looking for a `skills/registry.json` file.
 * Returns the path to the `skills/` directory if found, or `null`.
 *
 * Also checks for the env override `VANA_SKILLS_DIR`.
 */
export function findSkillsDir(cwd = process.cwd()): string | null {
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

  pushCandidate(process.env.VANA_SKILLS_DIR);

  let currentDir = path.resolve(cwd);
  while (true) {
    pushCandidate(path.join(currentDir, "skills"));

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "registry.json"))) {
      return candidate;
    }
  }

  return null;
}

/**
 * Returns the universal agent skills directory (cross-agent standard).
 * @returns Absolute path to `~/.agents/skills/`
 */
export function getAgentsSkillsDir(): string {
  return path.join(os.homedir(), ".agents", "skills");
}

/**
 * Returns the Claude Code skills directory.
 * @returns Absolute path to `~/.claude/skills/`
 */
export function getClaudeSkillsDir(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

/**
 * Detects whether Claude Code is installed by checking for `~/.claude/`.
 */
export function isClaudeCodeInstalled(): boolean {
  return fs.existsSync(path.join(os.homedir(), ".claude"));
}

/**
 * Returns all directories where skills should be installed.
 * Always includes the universal `.agents/skills/` path.
 * Adds `~/.claude/skills/` if Claude Code is detected.
 */
export function getSkillInstallDirs(): string[] {
  const dirs = [getAgentsSkillsDir()];
  if (isClaudeCodeInstalled()) {
    dirs.push(getClaudeSkillsDir());
  }
  return dirs;
}
