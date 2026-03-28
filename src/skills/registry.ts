import fs from "node:fs/promises";
import path from "node:path";

import {
  findSkillsDir,
  getSkillInstallDirs,
  getSkillsCacheDir,
} from "./paths.js";

const SKILLS_REGISTRY_URL =
  "https://raw.githubusercontent.com/vana-com/vana-connect/main/skills/registry.json";
const SKILLS_BASE_URL =
  "https://raw.githubusercontent.com/vana-com/vana-connect/main/skills";

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
 * Install a skill to all detected agent skill directories.
 *
 * Installs to `~/.agents/skills/vana-{id}/` (universal) and
 * `~/.claude/skills/vana-{id}/` if Claude Code is detected.
 */
export async function installSkill(
  skillId: string,
  skillsDir?: string,
): Promise<{ installedPath: string; installedPaths: string[] }> {
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

  const installDirs = getSkillInstallDirs();
  const installedPaths: string[] = [];

  for (const baseDir of installDirs) {
    const installDir = path.join(baseDir, `vana-${match.id}`);
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

    installedPaths.push(installDir);
  }

  return { installedPath: installedPaths[0], installedPaths };
}

/**
 * Read installed skills from all known agent skills directories.
 * Checks both `~/.agents/skills/` and `~/.claude/skills/` for `vana-*` dirs.
 * Deduplicates by skill ID.
 */
export async function readInstalledSkills(): Promise<
  Array<{ id: string; path: string }>
> {
  const installDirs = getSkillInstallDirs();
  const seen = new Set<string>();
  const installed: Array<{ id: string; path: string }> = [];

  for (const baseDir of installDirs) {
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith("vana-")) {
          continue;
        }
        const id = entry.name.replace(/^vana-/, "");
        if (seen.has(id)) continue;

        const skillPath = path.join(baseDir, entry.name, "SKILL.md");
        try {
          await fs.access(skillPath);
          seen.add(id);
          installed.push({
            id,
            path: path.join(baseDir, entry.name),
          });
        } catch {
          // Directory exists but no SKILL.md — skip.
        }
      }
    } catch {
      // Directory doesn't exist — skip.
    }
  }

  return installed;
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
