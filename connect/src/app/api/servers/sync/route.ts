import { NextResponse } from "next/server";
import { findAllActiveServers, updateServer } from "@/lib/db/neon";
import { getServerProvider } from "@/lib/server-provider";

/**
 * POST /api/servers/sync — Background state synchronization.
 *
 * Called by Vercel Cron every 60s. Polls the cloud provider for each
 * active server and updates the DB state if it has changed.
 *
 * Protected by CRON_SECRET to prevent external calls.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getServerProvider();
  const servers = await findAllActiveServers();

  let updated = 0;
  for (const server of servers) {
    if (!server.provider_id) continue;

    try {
      const liveStatus = await provider.status(server.provider_id);

      if (liveStatus.state !== server.state) {
        await updateServer(server.id, { state: liveStatus.state });
        updated++;
      }
    } catch (err) {
      console.error(`Sync failed for ${server.id}:`, err);
    }
  }

  return NextResponse.json({ synced: servers.length, updated });
}
