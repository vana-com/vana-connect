#!/usr/bin/env node
// Apply connect/migrations/*.sql to a local Postgres in lexicographic
// order. Idempotent: tracks applied filenames in `_migrations` and
// skips anything already recorded. Each migration runs inside a single
// transaction so partial failures roll back.
//
// Usage:
//   DATABASE_URL=postgres://vana:vana-local-pw@127.0.0.1:54329/vana_connect?sslmode=disable \
//     node connect/scripts/migrate-local.mjs
//
// Designed for the local compose stack only. Production deploys use a
// different path (Neon serverless) and are out of scope here.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "..", "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

const parsed = new URL(url);
if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
  console.error(
    `Refusing to run: DATABASE_URL host is "${parsed.hostname}". This script is local-only.`,
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
