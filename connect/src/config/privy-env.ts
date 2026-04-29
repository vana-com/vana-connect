/**
 * Resolve the public Privy environment variables that
 * `<PrivyProvider>` requires. Centralized so build/prerender failures surface
 * a Vana-owned message instead of an opaque Privy SDK throw, and so we can
 * unit-test the parsing rules in isolation.
 *
 * `appId` and `clientId` are the only values that ship to the browser bundle
 * (`NEXT_PUBLIC_*`); everything else lives server-side.
 */

const APP_ID_VAR = "NEXT_PUBLIC_PRIVY_APP_ID";
const CLIENT_ID_VAR = "NEXT_PUBLIC_PRIVY_CLIENT_ID";

// Privy app ids have appeared in both 25-char and 27-char forms across Vana
// projects. Validate shape, placeholders, and obvious quoting errors locally
// without pinning to one historical length.
const MIN_APP_ID_LENGTH = 25;
const MIN_CLIENT_ID_LENGTH = 10;
const PLACEHOLDER_VALUES = new Set([
  "",
  "undefined",
  "null",
  "todo",
  "changeme",
  "placeholder",
  "your-privy-app-id",
  "your-privy-client-id",
]);

export type PrivyPublicEnv =
  | { status: "ok"; appId: string; clientId: string }
  | { status: "missing"; reason: string };

function readId(
  raw: string | undefined,
  options: { minLength?: number } = {},
): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    return null;
  }
  // Privy ids are URL-safe identifiers; reject whitespace or quotes that
  // typically indicate a misquoted shell variable.
  if (/[\s"']/.test(trimmed)) return null;
  return trimmed;
}

export function resolvePrivyPublicEnv(
  source: Record<string, string | undefined> = {
    [APP_ID_VAR]: process.env[APP_ID_VAR],
    [CLIENT_ID_VAR]: process.env[CLIENT_ID_VAR],
  },
): PrivyPublicEnv {
  const appId = readId(source[APP_ID_VAR], {
    minLength: MIN_APP_ID_LENGTH,
  });
  const clientId = readId(source[CLIENT_ID_VAR], {
    minLength: MIN_CLIENT_ID_LENGTH,
  });

  const missing: string[] = [];
  if (appId === null) missing.push(APP_ID_VAR);
  if (clientId === null) missing.push(CLIENT_ID_VAR);

  if (appId === null || clientId === null) {
    return {
      status: "missing",
      reason: `Privy auth is not configured. Missing or invalid: ${missing.join(", ")}.`,
    };
  }

  return { status: "ok", appId, clientId };
}
