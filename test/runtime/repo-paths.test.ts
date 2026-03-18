import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findDataConnectorsDir } from "../../src/runtime/repo-paths.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fsp.rm(dir, { recursive: true, force: true })),
  );
});

describe("findDataConnectorsDir", () => {
  it("finds a repo at the current working directory", async () => {
    const repoDir = await createDataConnectorsFixture("repo-root");

    expect(findDataConnectorsDir(repoDir)).toBe(repoDir);
  });

  it("finds a sibling data-connectors repo from another project cwd", async () => {
    const workspaceDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), "vana-connect-workspace-"),
    );
    tempDirs.push(workspaceDir);

    const repoDir = path.join(workspaceDir, "data-connectors");
    await createFixtureAt(repoDir);

    const otherProjectDir = path.join(workspaceDir, "vana-connect");
    await fsp.mkdir(otherProjectDir, { recursive: true });

    expect(findDataConnectorsDir(otherProjectDir)).toBe(repoDir);
  });
});

async function createDataConnectorsFixture(prefix: string): Promise<string> {
  const repoDir = await fsp.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  tempDirs.push(repoDir);
  await createFixtureAt(repoDir);
  return repoDir;
}

async function createFixtureAt(repoDir: string): Promise<void> {
  await fsp.mkdir(path.join(repoDir, "skills", "vana-connect", "scripts"), {
    recursive: true,
  });
  await fsp.writeFile(path.join(repoDir, "registry.json"), "{}\n", "utf8");
}
