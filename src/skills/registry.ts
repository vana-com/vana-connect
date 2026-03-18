import fs from "node:fs/promises";
import path from "node:path";

import {
  findSkillsDir,
  getClaudeSkillsDir,
  getSkillsCacheDir,
} from "./paths.js";

const SKILLS_REGISTRY_URL =
  "https://raw.githubusercontent.com/vana-com/vana-connect/feat/connect-cli-v1/skills/registry.json";
const SKILLS_BASE_URL =
  "https://raw.githubusercontent.com/vana-com/vana-connect/feat/connect-cli-v1/skills";

export interface SkillRegistryEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  files: { skill: string; supplemental?: string[] };
}

export interface AvailableSkill {
  id: string;
  name: string;
  description: string;
  version: string;
}

interface SkillsRegistry {
  skills?: SkillRegistryEntry[];
}

/**
 * List all available skills from the registry.
 * Tries a local `skills/` directory first, then falls back to remote.
 */
export async function listAvailableSkills(
  skillsDir?: string,
): Promise<AvailableSkill[]> {
  const registry = await loadSkillsRegistry(skillsDir);
  return (registry.skills ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    version: entry.version,
  }));
}

/**
 * Fetch a skill's files to the local cache directory.
 * @returns The path to the cached SKILL.md
 */
export async function fetchSkillToCache(
  skillId: string,
  cacheDir?: string,
  skillsDir?: string,
): Promise<{ skillPath: string }> {
  const resolvedCacheDir = cacheDir ?? getSkillsCacheDir();
  const registry = await loadSkillsRegistry(skillsDir);
  const match = (registry.skills ?? []).find(
    (entry) => entry.id.toLowerCase() === skillId.toLowerCase(),
  );

  if (!match) {
    throw new Error(`No skill found with id "${skillId}".`);
  }

  // Fetch the main skill file
  await copyOrFetchSkillFile(
    match.files.skill,
    resolvedCacheDir,
    skillsDir ?? findSkillsDir() ?? undefined,
  );

  // Fetch supplemental files if any
  if (match.files.supplemental) {
    for (const supplementalPath of match.files.supplemental) {
      await copyOrFetchSkillFile(
        supplementalPath,
        resolvedCacheDir,
        skillsDir ?? findSkillsDir() ?? undefined,
      ).catch(() => {
        // Supplemental file fetch failure is non-fatal.
      });
    }
  }

  return {
    skillPath: path.join(resolvedCacheDir, match.files.skill),
  };
}

/**
 * Install a skill to the agent's skills directory.
 *
 * 1. Fetches the skill SKILL.md to cache
 * 2. Copies to `~/.claude/skills/vana-{id}/SKILL.md`
 * 3. Copies supplemental files if present
 * 4. Returns the installed path
 */
export async function installSkill(
  skillId: string,
  skillsDir?: string,
): Promise<{ installedPath: string }> {
  const cacheDir = getSkillsCacheDir();
  const registry = await loadSkillsRegistry(skillsDir);
  const match = (registry.skills ?? []).find(
    (entry) => entry.id.toLowerCase() === skillId.toLowerCase(),
  );

  if (!match) {
    throw new Error(`No skill found with id "${skillId}".`);
  }

  // Fetch to cache first
  await fetchSkillToCache(skillId, cacheDir, skillsDir);

  // Install to Claude Code skills directory
  const claudeSkillsDir = getClaudeSkillsDir();
  const installDir = path.join(claudeSkillsDir, `vana-${match.id}`);
  await fs.mkdir(installDir, { recursive: true });

  // Copy the main skill file
  const cachedSkillPath = path.join(cacheDir, match.files.skill);
  const installedSkillPath = path.join(installDir, "SKILL.md");
  const content = await fs.readFile(cachedSkillPath);
  await fs.writeFile(installedSkillPath, content);

  // Copy supplemental files if any
  if (match.files.supplemental) {
    for (const supplementalRelPath of match.files.supplemental) {
      const cachedPath = path.join(cacheDir, supplementalRelPath);
      // Determine the relative path from the skill's directory
      const skillDirPrefix = match.id + "/";
      const relFromSkillDir = supplementalRelPath.startsWith(skillDirPrefix)
        ? supplementalRelPath.slice(skillDirPrefix.length)
        : path.basename(supplementalRelPath);
      const installedPath = path.join(installDir, relFromSkillDir);
      try {
        await fs.mkdir(path.dirname(installedPath), { recursive: true });
        const fileContent = await fs.readFile(cachedPath);
        await fs.writeFile(installedPath, fileContent);
      } catch {
        // Non-fatal if supplemental file is missing from cache.
      }
    }
  }

  return { installedPath: installDir };
}

/**
 * Read installed skills from the Claude Code skills directory.
 * Looks for directories matching `vana-*` in `~/.claude/skills/`.
 */
export async function readInstalledSkills(): Promise<
  Array<{ id: string; path: string }>
> {
  const claudeSkillsDir = getClaudeSkillsDir();
  try {
    const entries = await fs.readdir(claudeSkillsDir, { withFileTypes: true });
    const installed: Array<{ id: string; path: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("vana-")) {
        continue;
      }
      const skillPath = path.join(claudeSkillsDir, entry.name, "SKILL.md");
      try {
        await fs.access(skillPath);
        installed.push({
          id: entry.name.replace(/^vana-/, ""),
          path: path.join(claudeSkillsDir, entry.name),
        });
      } catch {
        // Directory exists but no SKILL.md — skip.
      }
    }
    return installed;
  } catch {
    return [];
  }
}

async function loadSkillsRegistry(skillsDir?: string): Promise<SkillsRegistry> {
  const resolvedDir = skillsDir ?? findSkillsDir() ?? undefined;

  if (resolvedDir) {
    try {
      const localRegistry = await fs.readFile(
        path.join(resolvedDir, "registry.json"),
        "utf8",
      );
      return JSON.parse(localRegistry) as SkillsRegistry;
    } catch {
      // Fall through to remote fetch.
    }
  }

  const response = await fetch(SKILLS_REGISTRY_URL, {
    headers: { "User-Agent": "@opendatalabs/connect" },
  });
  if (!response.ok) {
    throw new Error(`Failed to load skills registry: ${response.status}`);
  }
  return (await response.json()) as SkillsRegistry;
}

async function copyOrFetchSkillFile(
  relativePath: string,
  cacheDir: string,
  skillsDir?: string,
): Promise<void> {
  const destination = path.join(cacheDir, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });

  if (skillsDir) {
    const localPath = path.join(skillsDir, relativePath);
    try {
      const content = await fs.readFile(localPath);
      await fs.writeFile(destination, content);
      return;
    } catch {
      // Fall through to remote fetch.
    }
  }

  const response = await fetch(`${SKILLS_BASE_URL}/${relativePath}`, {
    headers: { "User-Agent": "@opendatalabs/connect" },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${relativePath}: ${response.status}`);
  }
  const content = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, content);
}
