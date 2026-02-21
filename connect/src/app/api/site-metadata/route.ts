import { NextResponse } from "next/server";

const SITE_FETCH_TIMEOUT_MS = 3500;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ name: null }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return NextResponse.json({ name: null }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ name: null }, { status: 400 });
  }

  if (!isPublicSiteUrl(parsedUrl)) {
    return NextResponse.json({ name: null }, { status: 400 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SITE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        accept: "text/html,application/xhtml+xml",
      },
      // Keep first draft simple and safe: do not follow redirects for metadata.
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });

    if (isRedirect(response.status)) {
      return NextResponse.json({ name: null }, { status: 200 });
    }

    if (!response.ok) {
      return NextResponse.json({ name: null }, { status: 200 });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json({ name: null }, { status: 200 });
    }

    const html = await response.text();
    const name = resolveNameFromHtml(html);
    return NextResponse.json({ name: name ?? null });
  } catch {
    return NextResponse.json({ name: null }, { status: 200 });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function isPublicSiteUrl(url: URL): boolean {
  return !isPrivateHostname(url.hostname);
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!normalized) {
    return true;
  }

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  const ipv4 = parseIpv4(normalized);
  if (ipv4 && isPrivateIpv4(ipv4)) {
    return true;
  }

  if (isPrivateIpv6(normalized)) {
    return true;
  }

  return false;
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const values: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }

    const value = Number(part);
    if (value < 0 || value > 255) {
      return null;
    }
    values.push(value);
  }

  return values;
}

function isPrivateIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  return (
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) // private
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::1" || // loopback
    normalized === "::" || // unspecified
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") || // unique local
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") // link-local fe80::/10
  );
}

function resolveNameFromHtml(html: string): string | null {
  const head = html.slice(0, 20_000);
  const ogSiteName = readMetaContent(head, "og:site_name");
  if (ogSiteName) {
    return ogSiteName;
  }

  const ogTitle = readMetaContent(head, "og:title");
  if (ogTitle) {
    return ogTitle;
  }

  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch?.[1]) {
    return null;
  }

  return cleanValue(titleMatch[1]);
}

function readMetaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]*(?:property|name)=["']${escapeRegExp(property)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const match = html.match(pattern);
  if (!match?.[1]) {
    return null;
  }
  return cleanValue(match[1]);
}

function cleanValue(value: string): string | null {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
