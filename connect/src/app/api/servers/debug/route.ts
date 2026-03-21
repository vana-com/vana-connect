import { NextResponse } from "next/server";

export async function GET() {
  const envCheck: Record<string, boolean> = {};
  for (const key of [
    "DATABASE_URL",
    "GCP_PROJECT",
    "GCP_SERVICE_ACCOUNT_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_ZONE_ID",
    "PS_CONTAINER_IMAGE",
  ]) {
    envCheck[key] = !!process.env[key];
  }

  let providerError: string | null = null;
  try {
    const { getServerProvider } = await import("@/lib/server-provider");
    getServerProvider();
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ envCheck, providerError });
}
