import { NextResponse } from "next/server";
import { signVanaManifest } from "@opendatalabs/connect/server";
import { ConnectError } from "@opendatalabs/connect/core";
import { config } from "@/config";

export async function GET() {
  try {
    const vanaBlock = await signVanaManifest({
      privateKey: config.privateKey,
      appUrl: config.appUrl,
      privacyPolicyUrl: `${config.appUrl}/privacy`,
      termsUrl: `${config.appUrl}/terms`,
      supportUrl: `${config.appUrl}/support`,
      webhookUrl: `${config.appUrl}/api/webhook`,
    });

    const manifest = {
      name: "Career Analyzer",
      short_name: "CareerAI",
      start_url: "/",
      display: "standalone",
      background_color: "#09090b",
      theme_color: "#09090b",
      icons: [
        {
          src: "/icon.png",
          sizes: "192x192",
          type: "image/png",
        },
      ],
      vana: vanaBlock,
    };

    return NextResponse.json(manifest, {
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    const message =
      err instanceof ConnectError ? err.message : "Failed to sign manifest";
    const status = err instanceof ConnectError ? (err.statusCode ?? 500) : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
