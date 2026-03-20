import { neon } from "@neondatabase/serverless";

export type PersonalServer = {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string | null;
  vm_ip: string | null;
  url: string | null;
  state: string;
  disk_id: string | null;
  disk_expires: string | null;
  created_at: string;
  updated_at: string;
};

function getSQL() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return neon(url);
}

export async function findServerByUserId(
  userId: string,
): Promise<PersonalServer | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM personal_servers WHERE user_id = ${userId} LIMIT 1
  `;
  return (rows[0] as PersonalServer) ?? null;
}

export async function findServerById(
  id: string,
): Promise<PersonalServer | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM personal_servers WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as PersonalServer) ?? null;
}

export async function insertServerIfNotExists(
  server: Pick<PersonalServer, "id" | "user_id" | "provider" | "state">,
): Promise<PersonalServer | null> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO personal_servers (id, user_id, provider, state)
    VALUES (${server.id}, ${server.user_id}, ${server.provider}, ${server.state})
    ON CONFLICT (user_id) DO NOTHING
    RETURNING *
  `;
  return (rows[0] as PersonalServer) ?? null;
}

const UPDATABLE_COLUMNS = new Set([
  "provider_id",
  "vm_ip",
  "url",
  "state",
  "disk_id",
  "disk_expires",
]);

export async function updateServer(
  id: string,
  fields: Partial<
    Pick<
      PersonalServer,
      "provider_id" | "vm_ip" | "url" | "state" | "disk_id" | "disk_expires"
    >
  >,
): Promise<PersonalServer | null> {
  const sql = getSQL();
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const [col, val] of Object.entries(fields)) {
    if (val === undefined) continue;
    if (!UPDATABLE_COLUMNS.has(col)) {
      throw new Error(`Column not in allowlist: ${col}`);
    }
    updates.push(col);
    values.push(val);
  }

  if (updates.length === 0) return findServerById(id);

  const setClauses = updates.map((col, i) => `${col} = $${i + 1}`).join(", ");
  const query = `UPDATE personal_servers SET ${setClauses}, updated_at = now() WHERE id = $${updates.length + 1} RETURNING *`;

  const rows = await sql.query(query, [...values, id]);
  return (rows[0] as PersonalServer) ?? null;
}

export async function deleteServer(id: string): Promise<void> {
  const sql = getSQL();
  await sql`DELETE FROM personal_servers WHERE id = ${id}`;
}
