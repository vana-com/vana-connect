/**
 * Standalone worker script: checks for the latest CLI version and writes
 * the result to a cache file. Runs as a detached child process spawned by
 * the main CLI — exits silently on any failure.
 *
 * argv: [node, script, currentVersion, installMethod, outputPath]
 */
import fs from "node:fs/promises";
import path from "node:path";

const [, , currentVersion, installMethod, outputPath] = process.argv;

async function main(): Promise<void> {
  if (!currentVersion || !installMethod || !outputPath) {
    process.exit(0);
  }

  let latestVersion: string | null = null;

  switch (installMethod) {
    case "homebrew": {
      const res = await fetch(
        "https://formulae.brew.sh/api/formula/vana.json",
        { signal: AbortSignal.timeout(10_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { versions?: { stable?: string } };
        latestVersion = data.versions?.stable ?? null;
      }
      break;
    }
    case "installer": {
      const res = await fetch(
        "https://api.github.com/repos/vana-com/vana-connect/releases/latest",
        {
          headers: { "User-Agent": "@opendatalabs/connect" },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { tag_name?: string };
        latestVersion = data.tag_name?.replace(/^v/, "") ?? null;
      }
      break;
    }
    default: {
      const res = await fetch(
        "https://registry.npmjs.org/@opendatalabs/connect/latest",
        { signal: AbortSignal.timeout(10_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { version?: string };
        latestVersion = data.version ?? null;
      }
    }
  }

  if (latestVersion) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const cache = {
      lastCheckedAt: new Date().toISOString(),
      latestVersion,
      currentVersion,
    };
    await fs.writeFile(outputPath, `${JSON.stringify(cache, null, 2)}\n`);
  }
}

main().catch(() => process.exit(0));
