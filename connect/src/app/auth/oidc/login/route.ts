import type { NextRequest } from "next/server";
import { runOidcLogin } from "../oidc-route-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return runOidcLogin(request);
}
