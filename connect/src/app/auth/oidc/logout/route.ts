import type { NextRequest } from "next/server";
import { runOidcLogout } from "../oidc-route-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return runOidcLogout(request);
}
