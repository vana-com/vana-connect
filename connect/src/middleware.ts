import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  parseFromSearchParams,
  toConnectUrl,
} from "@/app/_lib/handoff-contract";
import { APP_ROUTES } from "@/app/routes";

function buildCanonicalConnectUrl(requestUrl: URL): URL | null {
  const handoffContext = parseFromSearchParams(requestUrl.searchParams);
  if (!handoffContext) return null;
  return new URL(toConnectUrl(handoffContext), requestUrl);
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
