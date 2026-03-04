import { ConnectError } from "@opendatalabs/connect/core";
import { signVanaManifest } from "@opendatalabs/connect/server";
import { NextResponse } from "next/server";
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
      name: "Peak Think",
      short_name: "Peak Think",
      start_url: "/",
      display: "standalone",
      background_color: "#0a0b14",
      theme_color: "#0a0b14",
      icons: [
        {
          src: "/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
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
