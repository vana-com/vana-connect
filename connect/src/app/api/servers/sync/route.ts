import { NextResponse } from "next/server";
import { findAllActiveServers, updateServer } from "@/lib/db/neon";
import { getServerProvider } from "@/lib/server-provider";

const CONCURRENCY = 10;

/**
 * Process items with a concurrency limit.
 */
async function mapConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const p = fn(item)
      .then(() => {
        succeeded++;
      })
      .catch((err) => {
        failed++;
        console.error("Sync task failed:", err);
      })
      .finally(() => {
        executing.delete(p);
      });
    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return { succeeded, failed };
}

/**
 * POST /api/servers/sync — Background state synchronization.
 *
 * Called by Vercel Cron every 60s. Polls the cloud provider for each
 * active server and updates the DB state if it has changed.
 *
 * Processes servers in parallel (concurrency: 10) to stay within
 * Vercel function timeout limits at scale.
 *
 * Protected by CRON_SECRET to prevent external calls.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getServerProvider();
  const servers = await findAllActiveServers();

  let updated = 0;

  const { succeeded, failed } = await mapConcurrent(
    servers.filter((s) => s.provider_id),
    CONCURRENCY,
    async (server) => {
      const liveStatus = await provider.status(server.provider_id!);

      if (liveStatus.state !== server.state) {
        await updateServer(server.id, { state: liveStatus.state });
        updated++;
      }
    },
  );

  return NextResponse.json({
    total: servers.length,
    checked: succeeded + failed,
    updated,
    failed,
  });
}
