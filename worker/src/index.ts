/**
 * Cloudflare Worker: fallback handler for *.myvana.app
 *
 * Traffic for active personal servers is routed directly through Cloudflare
 * Tunnels (CNAME → {tunnelId}.cfargotunnel.com). This Worker only handles
 * requests that don't match any tunnel — i.e., servers that haven't been
 * provisioned or are stopped.
 */

function extractSubdomain(hostname: string): string | null {
  const suffix = ".myvana.app";
  if (!hostname.endsWith(suffix)) return null;

  const sub = hostname.slice(0, -suffix.length);
  if (!sub || sub.includes(".")) return null;

  return sub;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = extractSubdomain(url.hostname);

    if (!userId) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(
      JSON.stringify({
        error: "not_found",
        message:
          "No personal server is running at this address. It may not have been provisioned yet, or it may be stopped.",
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
};
