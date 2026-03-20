/**
 * Cloudflare Worker: Personal Server Router
 *
 * Routes requests on *.myvana.app:
 * 1. Extract user ID from subdomain
 * 2. Look up cloud VM in Neon DB (with KV cache) — if found, proxy to VM IP
 * 3. Otherwise return 404
 */

import { neon } from "@neondatabase/serverless";

interface Env {
  DATABASE_URL: string;
  SERVER_CACHE: KVNamespace;
}

type ServerRow = {
  vm_ip: string | null;
  state: string;
};

const CACHE_TTL_SECONDS = 60;

function extractSubdomain(hostname: string): string | null {
  const suffix = ".myvana.app";
  if (!hostname.endsWith(suffix)) return null;

  const sub = hostname.slice(0, -suffix.length);
  if (!sub || sub.includes(".")) return null;

  return sub;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const userId = extractSubdomain(url.hostname);

    if (!userId) {
      return new Response("Not Found", { status: 404 });
    }

    // Check KV cache first
    const cacheKey = `vm:${userId}`;
    const cachedIp = await env.SERVER_CACHE.get(cacheKey);

    if (cachedIp) {
      if (cachedIp === "__none__") {
        return new Response("Server not found", { status: 404 });
      }
      return proxyToVm(request, cachedIp);
    }

    // Look up the user's cloud server in the DB
    try {
      const sql = neon(env.DATABASE_URL);
      const rows = await sql`
        SELECT vm_ip, state
        FROM personal_servers
        WHERE user_id = ${userId}
        LIMIT 1
      `;

      const server = rows[0] as ServerRow | undefined;

      if (server?.vm_ip && server.state === "running") {
        await env.SERVER_CACHE.put(cacheKey, server.vm_ip, {
          expirationTtl: CACHE_TTL_SECONDS,
        });
        return proxyToVm(request, server.vm_ip);
      }

      await env.SERVER_CACHE.put(cacheKey, "__none__", {
        expirationTtl: CACHE_TTL_SECONDS,
      });
    } catch (err) {
      console.error("DB lookup error:", err);
    }

    return new Response("Server not found", { status: 404 });
  },
};

function proxyToVm(request: Request, vmIp: string): Promise<Response> {
  const target = new URL(request.url);
  target.hostname = vmIp;
  target.port = "80";
  target.protocol = "http:";

  return fetch(
    new Request(target.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    }),
  );
}
