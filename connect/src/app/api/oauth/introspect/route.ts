/**
 * OAuth introspection proxy for trusted Vana services (Personal Server).
 *
 * See docs/auth-redesign/01-architecture.md §1.9 and §9.
 *
 * Why proxy instead of letting PS call Hydra admin directly:
 *   - account.vana.org owns one set of Hydra admin credentials. Embedding
 *     them in every PS deployment is a blast-radius and operational
 *     headache.
 *   - PS needs the user's `linked_wallets` to map vanaUserId → wallet
 *     address. Only account.vana.org has that mapping.
 *
 * Wire format: RFC 7662 introspection request, plus the enrichment with
 * `linked_wallets[]` for active sessions.
 *
 * Auth: none required (Hydra introspection itself is unauthenticated for
 * standard introspection; we add rate-limiting per IP in middleware).
 */

import { NextResponse, type NextRequest } from "next/server";
import { fetchGoogleIdTokenForAudience } from "@/lib/auth/google-id-token";
import { findLinkedWalletsByUser } from "@/lib/db/account";

export const runtime = "nodejs";

type IntrospectionResult = {
  active: boolean;
  sub?: string;
  aud?: string[] | string;
  exp?: number;
  iat?: number;
  iss?: string;
  scope?: string;
  client_id?: string;
  token_type?: string;
  token_use?: string;
  ext?: Record<string, unknown>;
};

type EnrichedResult = IntrospectionResult & {
  linked_wallets?: Array<{
    vana_wallet_id: string;
    address: string;
    chain_type: string;
    is_primary: boolean;
  }>;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const hydraAdminUrl = process.env.HYDRA_ADMIN_URL;
  const hydraAdminAudience =
    process.env.HYDRA_ADMIN_AUDIENCE ?? hydraAdminUrl ?? "";
  if (!hydraAdminUrl) {
    return NextResponse.json(
      { error: "HYDRA_ADMIN_URL not configured" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  // Accept the token in the request body. RFC 7662 says
  // application/x-www-form-urlencoded; we accept JSON for convenience.
  let token: string | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await req.json()) as { token?: unknown };
      if (typeof body.token === "string") token = body.token;
    } catch {
      // fall through
    }
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    token = params.get("token");
  }
  if (!token) {
    return NextResponse.json(
      { error: "Missing token" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Forward to Hydra admin introspection.
  const adminBearer = await fetchGoogleIdTokenForAudience(hydraAdminAudience);
  const url = `${hydraAdminUrl.replace(/\/+$/, "")}/admin/oauth2/introspect`;
  const formBody = new URLSearchParams({ token });
  let hydraResponse: Response;
  try {
    hydraResponse = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        ...(adminBearer ? { authorization: `Bearer ${adminBearer}` } : {}),
      },
      body: formBody.toString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Hydra unreachable",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  if (!hydraResponse.ok) {
    return NextResponse.json(
      { active: false },
      { status: 200, headers: CORS_HEADERS },
    );
  }

  const result = (await hydraResponse.json()) as IntrospectionResult;

  // Enrich with linked_wallets if active and sub is a vana_user_id.
  const enriched: EnrichedResult = { ...result };
  if (
    result.active &&
    typeof result.sub === "string" &&
    /^vana_user_[0-9a-f]{32}$/.test(result.sub)
  ) {
    try {
      const wallets = await findLinkedWalletsByUser(result.sub);
      enriched.linked_wallets = wallets.map((w) => ({
        vana_wallet_id: w.id,
        address: w.address,
        chain_type: w.chain_type,
        is_primary: w.is_primary,
      }));
    } catch {
      // If the DB enrichment fails, return the bare introspection result.
      // PS will fall back to other auth mechanisms or 401.
    }
  }

  return NextResponse.json(enriched, {
    status: 200,
    headers: CORS_HEADERS,
  });
}
