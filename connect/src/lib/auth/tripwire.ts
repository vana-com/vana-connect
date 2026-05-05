/**
 * Provider Containment runtime tripwire.
 *
 * See docs/auth-redesign/01-architecture.md §1.1 (PCI) and §11.
 *
 * Dev/staging only: scans response bodies on the way out for tokens that
 * match a provider-DID regex (`did:privy:`, `did:para:`, `did:dynamic:`).
 * If found, replaces the response with a 500 + diagnostic body and logs
 * loudly so the developer notices and fixes the leak before merging.
 *
 * Disabled in production via NODE_ENV check. Production routes are
 * defended by:
 *   - Compile-time `VanaUserId` brand (rejects raw strings).
 *   - Code-review checklist.
 *   - Provider SDKs imported only from whitelisted boundaries.
 *
 * Usage from a Next.js route handler:
 *
 *     export const POST = withTripwire(async (req) => { ... });
 *
 * Or wrap an existing handler at module load:
 *
 *     export default withTripwire(handler);
 */

const PROVIDER_DID_RE = /did:(privy|para|dynamic):/i;

const TRIPWIRE_DISABLED = process.env.NODE_ENV === "production";

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json");
}

/**
 * Scan a body string for provider-DID leakage. Returns the matched substring
 * if found, or null. The first ~120 chars around the match are returned for
 * diagnostic purposes; the full body is not echoed back.
 */
export function scanForProviderLeak(body: string): {
  match: string;
  context: string;
} | null {
  const m = PROVIDER_DID_RE.exec(body);
  if (!m) return null;
  const start = Math.max(0, m.index - 40);
  const end = Math.min(body.length, m.index + 80);
  return {
    match: body.slice(m.index, m.index + 40),
    context: body.slice(start, end),
  };
}

/** Wrap a Next.js route handler with the tripwire. */
export function withTripwire<Args extends unknown[]>(
  handler: (...args: Args) => Response | Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const res = await handler(...args);
    if (TRIPWIRE_DISABLED) return res;
    if (!(res instanceof Response)) return res;
    if (!isJsonResponse(res)) return res;
    const cloned = res.clone();
    let body: string;
    try {
      body = await cloned.text();
    } catch {
      return res;
    }
    const leak = scanForProviderLeak(body);
    if (!leak) return res;

    // Loud log + 500 with diagnostic. Stack trace included so the developer
    // can find the originating call site fast.
    const stack = new Error("PROVIDER_CONTAINMENT_VIOLATION").stack;
    console.error(
      "[tripwire] PROVIDER_CONTAINMENT_VIOLATION — response body contains provider DID",
      { match: leak.match, context: leak.context, stack },
    );
    return new Response(
      JSON.stringify({
        error: "PROVIDER_CONTAINMENT_VIOLATION",
        match: leak.match,
        context: leak.context,
        message:
          "A response body contained a provider DID (e.g. did:privy:*). " +
          "Provider identifiers must not appear outside vana_provider_links " +
          "and the wallet-providers/* adapters. See " +
          "docs/auth-redesign/01-architecture.md §1.1 (PCI).",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  };
}
