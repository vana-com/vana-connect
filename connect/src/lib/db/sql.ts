import { neon } from "@neondatabase/serverless";
import postgres from "postgres";

let localSql: postgres.Sql | null = null;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return url;
}

export function isLocalPostgresDatabase(
  url = process.env.DATABASE_URL,
): boolean {
  if (process.env.DATABASE_DRIVER === "postgres") return true;
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function getLocalPostgresSql(): postgres.Sql {
  if (!localSql) {
    localSql = postgres(getDatabaseUrl(), {
      idle_timeout: 20,
      max: 10,
    });
  }
  return localSql;
}

export function getSql(): ReturnType<typeof neon> {
  const url = getDatabaseUrl();
  if (isLocalPostgresDatabase(url)) {
    return getLocalPostgresSql() as unknown as ReturnType<typeof neon>;
  }
  return neon(url);
}
