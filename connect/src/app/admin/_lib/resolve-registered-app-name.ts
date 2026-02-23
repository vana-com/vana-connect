const SITE_METADATA_TIMEOUT_MS = 3500;

/*
  What this file does:
  * tries to resolve a human-friendly app name for a given URL,
  * first calls /api/site-metadata?url=... and uses payload.name if available,
  * falls back to a hostname-derived title (e.g. "my-app.io" -> "My App"),
  * gives up safely and returns the original URL string if parsing fails.
*/

export async function resolveRegisteredAppName(url: string): Promise<string> {
  const metadataName = await readSiteMetadataName(url);
  if (metadataName) {
    return metadataName;
  }
  return resolveHostFallbackName(url);
}

async function readSiteMetadataName(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    SITE_METADATA_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `/api/site-metadata?url=${encodeURIComponent(url)}`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { name?: string | null };
    return typeof payload.name === "string" && payload.name.trim().length > 0
      ? payload.name.trim()
      : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function resolveHostFallbackName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const firstSegment = hostname.split(".")[0] ?? hostname;
    return firstSegment
      .split(/[-_]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
  } catch {
    return url;
  }
}
