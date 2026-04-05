import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getConnectorCacheDir } from "../core/paths.js";

const REGISTRY_URL =
  "https://raw.githubusercontent.com/vana-com/data-connectors/main/registry.json";
// Connector script files live under `connectors/` in the data-connectors
// repo. The registry.json `baseUrl` field also points here; we mirror it
// as a constant so offline/local paths resolve correctly too.
const BASE_URL =
  "https://raw.githubusercontent.com/vana-com/data-connectors/main/connectors";

export interface ConnectorRegistryEntry {
  id?: string;
  name?: string;
  company?: string;
  description?: string;
  scriptPath?: string;
  script_path?: string;
  version?: string;
  checksums?: { script?: string };
  exportFrequency?: string;
  iconURL?: string;
  files?: {
    script?: string;
    metadata?: string;
  };
}

export interface ConnectorMetadata {
  id: string;
  version?: string;
  scopes?: Array<{ scope: string; label: string; description?: string }>;
  exportFrequency?: string;
  iconURL?: string;
}

export interface ConnectorResolution {
  source: string;
  name: string;
  company?: string;
  description?: string;
  connectorPath: string;
  version?: string;
  updated?: boolean;
  previousVersion?: string;
}

export interface AvailableSource {
  id: string;
  name: string;
  company?: string;
  description?: string;
  version?: string;
  exportFrequency?: string;
  scopeLabels?: string[];
  authMode?: "automated" | "interactive" | "legacy";
}

export async function listAvailableSources(
  dataConnectorsDir?: string,
): Promise<AvailableSource[]> {
  const registry = await loadRegistry(dataConnectorsDir);
  const sources = await Promise.all(
    (registry.connectors ?? []).map(async (entry) => {
      const source = toAvailableSource(entry);
      if (!source) {
        return null;
      }

      source.authMode = await detectAuthMode(entry, dataConnectorsDir);
      return source;
    }),
  );

  return sources
    .filter((value): value is AvailableSource => Boolean(value))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function resolveConnector(
  source: string,
  connectorCacheDir: string,
  dataConnectorsDir?: string,
): Promise<ConnectorResolution | null> {
  const registry = await loadRegistry(dataConnectorsDir);
  const normalizedSource = source.toLowerCase();
  const match = (registry.connectors ?? []).find((entry) => {
    const id = (entry.id ?? "").toLowerCase();
    const name = (entry.name ?? "").toLowerCase();
    return (
      id === normalizedSource ||
      name === normalizedSource ||
      id.includes(normalizedSource) ||
      name.includes(normalizedSource)
    );
  });

  if (!match) {
    return null;
  }

  const scriptPath = match.scriptPath ?? match.script_path;
  const resolvedScriptPath = scriptPath ?? match.files?.script;
  if (!resolvedScriptPath) {
    return null;
  }

  return {
    source: normalizeSourceName(match.id ?? match.name ?? source) ?? source,
    name: match.name ?? normalizeSourceName(match.id ?? source) ?? source,
    company: match.company,
    description: undefined,
    connectorPath: path.join(connectorCacheDir, resolvedScriptPath),
    version: match.version,
  };
}

export async function findCachedConnectorScript(
  source: string,
  connectorCacheDir: string,
): Promise<string | null> {
  const normalizedSource = source.toLowerCase();
  try {
    const entries = await fs.readdir(connectorCacheDir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const companyDir = path.join(connectorCacheDir, entry.name);
      const files = await fs.readdir(companyDir);
      for (const file of files) {
        if (
          file.endsWith("-playwright.js") &&
          file.replace(/-playwright\.js$/, "").toLowerCase() ===
            normalizedSource
        ) {
          return path.join(companyDir, file);
        }
      }
    }
  } catch {
    // Cache dir may not exist
  }
  return null;
}

export async function fetchConnectorToCache(
  source: string,
  connectorCacheDir: string,
  dataConnectorsDir?: string,
  currentVersion?: string,
): Promise<ConnectorResolution> {
  let registry: { connectors?: ConnectorRegistryEntry[] };
  try {
    registry = await loadRegistry(dataConnectorsDir);
  } catch (error) {
    // Offline fallback: if currentVersion provided and cache exists, return cached
    if (currentVersion) {
      const cachedPath = await findCachedConnectorScript(
        source,
        connectorCacheDir,
      );
      if (cachedPath) {
        return {
          source: normalizeSourceName(source) ?? source,
          name: normalizeSourceName(source) ?? source,
          connectorPath: cachedPath,
          version: currentVersion,
          updated: false,
        };
      }
    }
    throw error;
  }
  const normalizedSource = source.toLowerCase();
  const match = (registry.connectors ?? []).find((entry) => {
    const id = (entry.id ?? "").toLowerCase();
    const name = (entry.name ?? "").toLowerCase();
    const normalizedId = normalizeSourceName(entry.id)?.toLowerCase() ?? "";
    return (
      id === normalizedSource ||
      name === normalizedSource ||
      normalizedId === normalizedSource ||
      id.includes(normalizedSource) ||
      name.includes(normalizedSource) ||
      normalizedId.includes(normalizedSource)
    );
  });

  if (!match) {
    throw new Error(`No connector is available for ${source} right now.`);
  }

  const scriptRelPath =
    match.files?.script ?? match.scriptPath ?? match.script_path;
  const metadataRelPath =
    match.files?.metadata ?? scriptRelPath?.replace(/\.js$/i, ".json");

  if (!scriptRelPath) {
    throw new Error(
      `Connector metadata for ${source} is missing a script path.`,
    );
  }

  // Version-aware caching: skip download when versions match and file exists
  if (match.version && currentVersion && match.version === currentVersion) {
    const cachedScriptPath = path.join(connectorCacheDir, scriptRelPath);
    try {
      await fs.access(cachedScriptPath);
      return {
        source: normalizeSourceName(match.id ?? match.name ?? source) ?? source,
        name: match.name ?? normalizeSourceName(match.id ?? source) ?? source,
        company: match.company,
        description: match.description,
        connectorPath: cachedScriptPath,
        version: match.version,
        updated: false,
      };
    } catch {
      // File missing despite version match — fall through to download
    }
  }

  await copyOrFetchFile(scriptRelPath, connectorCacheDir, dataConnectorsDir);

  // Verify checksum if one is specified in the registry.
  if (match.checksums?.script) {
    const scriptDest = path.join(connectorCacheDir, scriptRelPath);
    const content = await fs.readFile(scriptDest);
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const expected = match.checksums.script.replace(/^sha256:/i, "");
    if (hash !== expected) {
      await fs.rm(scriptDest, { force: true });
      throw new Error(
        `Checksum mismatch for ${source} connector script (expected ${expected}, got ${hash}).`,
      );
    }
  }

  if (metadataRelPath) {
    await copyOrFetchFile(
      metadataRelPath,
      connectorCacheDir,
      dataConnectorsDir,
    ).catch(() => {
      // Metadata may not exist for every connector.
    });
  }

  // Cache the icon if available.
  if (match.iconURL) {
    const normalizedSource =
      normalizeSourceName(match.id ?? match.name ?? source) ?? source;
    const ext = path.extname(new URL(match.iconURL).pathname) || ".png";
    const iconDest = path.join(
      connectorCacheDir,
      `${normalizedSource}.icon${ext}`,
    );
    await fetchIcon(match.iconURL, iconDest).catch(() => {
      // Icon download failure is non-fatal.
    });
  }

  return {
    source: normalizeSourceName(match.id ?? match.name ?? source) ?? source,
    name: match.name ?? normalizeSourceName(match.id ?? source) ?? source,
    company: match.company,
    description: match.description,
    connectorPath: path.join(connectorCacheDir, scriptRelPath),
    version: match.version,
    updated: true,
    previousVersion: currentVersion,
  };
}

async function loadRegistry(
  dataConnectorsDir?: string,
): Promise<{ connectors?: ConnectorRegistryEntry[] }> {
  if (dataConnectorsDir) {
    try {
      const localRegistry = await fs.readFile(
        path.join(dataConnectorsDir, "registry.json"),
        "utf8",
      );
      return JSON.parse(localRegistry) as {
        connectors?: ConnectorRegistryEntry[];
      };
    } catch {
      // Fall through to remote fetch.
    }
  }

  const response = await fetch(REGISTRY_URL, {
    headers: { "User-Agent": "@opendatalabs/connect" },
  });
  if (!response.ok) {
    throw new Error(`Failed to load connector registry: ${response.status}`);
  }
  return (await response.json()) as { connectors?: ConnectorRegistryEntry[] };
}

async function copyOrFetchFile(
  relativePath: string,
  connectorCacheDir: string,
  dataConnectorsDir?: string,
): Promise<void> {
  const destination = path.join(connectorCacheDir, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });

  if (dataConnectorsDir) {
    const localPath = path.join(dataConnectorsDir, relativePath);
    try {
      const content = await fs.readFile(localPath);
      await fs.writeFile(destination, content);
      return;
    } catch {
      // Fall through to remote fetch.
    }
  }

  const response = await fetch(`${BASE_URL}/${relativePath}`, {
    headers: { "User-Agent": "@opendatalabs/connect" },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${relativePath}: ${response.status}`);
  }
  const content = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, content);
}

async function detectAuthMode(
  entry: ConnectorRegistryEntry,
  dataConnectorsDir?: string,
): Promise<AvailableSource["authMode"] | undefined> {
  const relativePath =
    entry.files?.script ?? entry.scriptPath ?? entry.script_path;

  if (!relativePath) {
    return undefined;
  }

  let script = "";

  // Try the connector cache first (most up-to-date after fetch)
  const cacheDir = getConnectorCacheDir();
  try {
    script = await fs.readFile(path.join(cacheDir, relativePath), "utf8");
  } catch {
    // Not cached — try local data-connectors checkout
    if (dataConnectorsDir) {
      try {
        script = await fs.readFile(
          path.join(dataConnectorsDir, relativePath),
          "utf8",
        );
      } catch {
        script = "";
      }
    }
  }

  if (!script) {
    return undefined;
  }

  if (/page\.requestInput\(/.test(script)) {
    return "interactive";
  }

  if (/page\.(showBrowser|promptUser)\(/.test(script)) {
    return "legacy";
  }

  return "automated";
}

function normalizeSourceName(source: string | undefined): string | null {
  if (!source) {
    return null;
  }

  return source.replace(/-playwright$/i, "");
}

function toAvailableSource(
  entry: ConnectorRegistryEntry,
): AvailableSource | null {
  const id = normalizeSourceName(entry.id ?? entry.name);
  if (!id) {
    return null;
  }

  return {
    id,
    name: entry.name ?? id,
    company: entry.company,
    description: entry.description,
    version: entry.version,
    exportFrequency: entry.exportFrequency,
  };
}

export async function readCachedConnectorMetadata(
  source: string,
  cacheDir: string,
): Promise<ConnectorMetadata | null> {
  try {
    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const metadataPath = path.join(
        cacheDir,
        entry.name,
        `${source}-playwright.json`,
      );
      try {
        const raw = await fs.readFile(metadataPath, "utf8");
        return JSON.parse(raw) as ConnectorMetadata;
      } catch {
        // Not found in this subdirectory.
      }
    }
  } catch {
    // Cache directory may not exist yet.
  }
  return null;
}

async function fetchIcon(url: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const response = await fetch(url, {
    headers: { "User-Agent": "@opendatalabs/connect" },
  });
  if (!response.ok) {
    throw new Error(`Failed to download icon: ${response.status}`);
  }
  const content = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, content);
}
