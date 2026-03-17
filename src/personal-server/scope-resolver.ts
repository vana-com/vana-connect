import type { ConnectorMetadata } from "../connectors/registry.js";

export interface ScopeMapping {
  scope: string;
  data: unknown;
}

/** Keys that are connector metadata, not user data. */
const EXCLUDED_KEYS = new Set([
  "exportSummary",
  "timestamp",
  "version",
  "platform",
]);

/**
 * Resolve connector output keys to personal server scopes.
 *
 * Strategy (matches DataConnect production):
 * 1. If any output keys contain ".", use them directly as scopes
 * 2. Otherwise, use connector metadata to map: metadata scope "github.profile"
 *    → look for key "profile" in result
 * 3. If no metadata, fall back to "{source}.{key}" for every non-metadata key
 *    (exclude: exportSummary, timestamp, version, platform)
 *
 * @param source - The connector source name (e.g. "github")
 * @param result - The connector output as key-value pairs
 * @param metadata - Optional connector metadata with scope definitions
 * @returns An array of scope mappings
 */
export function resolveScopes(
  source: string,
  result: Record<string, unknown>,
  metadata: ConnectorMetadata | null,
): ScopeMapping[] {
  const keys = Object.keys(result);

  // Strategy 1: If any keys are already dotted scopes, use them directly.
  const dottedKeys = keys.filter(
    (key) => key.includes(".") && !EXCLUDED_KEYS.has(key),
  );
  if (dottedKeys.length > 0) {
    return dottedKeys.map((key) => ({ scope: key, data: result[key] }));
  }

  // Strategy 2: Use metadata scopes to map flat keys.
  if (metadata?.scopes && metadata.scopes.length > 0) {
    const mappings: ScopeMapping[] = [];
    for (const { scope } of metadata.scopes) {
      // Extract the key portion after the dot, e.g. "github.profile" → "profile"
      const dotIndex = scope.indexOf(".");
      const key = dotIndex >= 0 ? scope.slice(dotIndex + 1) : scope;
      if (key in result) {
        mappings.push({ scope, data: result[key] });
      }
    }
    return mappings;
  }

  // Strategy 3: Fall back to "{source}.{key}" for every non-metadata key.
  return keys
    .filter((key) => !EXCLUDED_KEYS.has(key))
    .map((key) => ({ scope: `${source}.${key}`, data: result[key] }));
}
