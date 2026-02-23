import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HANDOFF_URL_PARAM_KEYS } from "@/app/(connect)/_shared/handoff-contract";
import { APP_ROUTES } from "@/app/routes";

function buildCanonicalConnectUrl(requestUrl: URL): URL | null {
  const sessionId = requestUrl.searchParams.get("sessionId");
  if (!sessionId) return null;

  const targetUrl = new URL(APP_ROUTES.connect, requestUrl);

  for (const key of HANDOFF_URL_PARAM_KEYS) {
    const value = requestUrl.searchParams.get(key);
    if (value) {
      targetUrl.searchParams.set(key, value);
    }
  }

  return targetUrl;
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== APP_ROUTES.root) {
    return NextResponse.next();
  }

  const targetUrl = buildCanonicalConnectUrl(request.nextUrl);
  if (!targetUrl) {
    return NextResponse.next();
  }

  return NextResponse.redirect(targetUrl);
}

export const config = {
  matcher: ["/"],
};
