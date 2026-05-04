#!/usr/bin/env node
// Apply connect/migrations/*.sql to the account Postgres database.
// Idempotent: tracks applied filenames in `_migrations` and skips anything
// already recorded. Each migration runs inside a single transaction.
//
// Local databases run by default. Remote databases require BOTH an env opt-in
// and a CLI opt-in:
//   ACCOUNT_DB_MIGRATE_ALLOW_REMOTE=true node connect/scripts/migrate-account-db.mjs --allow-remote

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "..", "migrations");
const allowRemoteArg = process.argv.includes("--allow-remote");
const allowRemoteEnv = process.env.ACCOUNT_DB_MIGRATE_ALLOW_REMOTE === "true";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error("DATABASE_URL is not a valid URL. Aborting.");
  process.exit(1);
}

const isLocalDatabase =
  parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

if (!isLocalDatabase && (!allowRemoteEnv || !allowRemoteArg)) {
  console.error(
    "Refusing to run remote account DB migrations without explicit opt-in.",
  );
  console.error(
    "Set ACCOUNT_DB_MIGRATE_ALLOW_REMOTE=true and pass --allow-remote to continue.",
  );
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  idle_timeout: 5,
  onnotice: () => {}, // suppress IF NOT EXISTS notices
});

async function waitForDatabase() {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await sql`SELECT 1`;
      return;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function main() {
  console.log(
    `Running account DB migrations against ${isLocalDatabase ? "local" : "remote"} host "${parsed.hostname}" database "${parsed.pathname.slice(1) || "(default)"}".`,
  );

  await waitForDatabase();

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migrations found.");
    return;
  }

  const appliedRows = await sql`SELECT filename FROM _migrations`;
  const applied = new Set(appliedRows.map((r) => r.filename));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip ${file} (already applied)`);
      continue;
    }

    const body = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`apply ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO _migrations (filename) VALUES (${file})`;
    });
    count += 1;
  }

  console.log(`Done. Applied ${count} new migration(s).`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
