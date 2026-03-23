import { neon } from "@neondatabase/serverless";

export type PersonalServer = {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string | null;
  access_token: string | null;
  vm_ip: string | null;
  url: string | null;
  state: string;
  disk_id: string | null;
  disk_expires: string | null;
  tunnel_id: string | null;
  dns_record_id: string | null;
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

export async function findAllActiveServers(): Promise<PersonalServer[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM personal_servers WHERE state IN ('provisioning', 'running')
  `;
  return rows as PersonalServer[];
}

const UPDATABLE_COLUMNS = new Set([
  "provider_id",
  "vm_ip",
  "url",
  "state",
  "disk_id",
  "disk_expires",
  "tunnel_id",
  "dns_record_id",
]);

export async function updateServer(
  id: string,
  fields: Partial<
    Pick<
      PersonalServer,
      | "provider_id"
      | "vm_ip"
      | "url"
      | "state"
      | "disk_id"
      | "disk_expires"
      | "tunnel_id"
      | "dns_record_id"
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

// ---------------------------------------------------------------------------
// Device code auth
// ---------------------------------------------------------------------------

export type DeviceCode = {
  device_code: string;
  user_code: string;
  status: "pending" | "authorized" | "expired";
  wallet_address: string | null;
  session_token: string | null;
  last_polled_at: string | null;
  created_at: string;
  expires_at: string;
};

export type Session = {
  token: string;
  wallet_address: string;
  ps_access_token: string | null;
  created_at: string;
  expires_at: string;
};

export async function createDeviceCode(
  deviceCode: string,
  userCode: string,
  expiresAt: Date,
): Promise<DeviceCode> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO device_codes (device_code, user_code, expires_at)
    VALUES (${deviceCode}, ${userCode}, ${expiresAt.toISOString()})
    RETURNING *
  `;
  return rows[0] as DeviceCode;
}

export async function findDeviceCode(
  deviceCode: string,
): Promise<DeviceCode | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM device_codes WHERE device_code = ${deviceCode} LIMIT 1
  `;
  return (rows[0] as DeviceCode) ?? null;
}

export async function findDeviceCodeByUserCode(
  userCode: string,
): Promise<DeviceCode | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM device_codes WHERE user_code = ${userCode} AND status = 'pending' LIMIT 1
  `;
  return (rows[0] as DeviceCode) ?? null;
}

export async function updateDeviceCodeLastPolled(
  deviceCode: string,
): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE device_codes SET last_polled_at = now() WHERE device_code = ${deviceCode}
  `;
}

export async function approveDeviceCode(
  userCode: string,
  walletAddress: string,
  sessionToken: string,
): Promise<DeviceCode | null> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE device_codes
    SET status = 'authorized', wallet_address = ${walletAddress}, session_token = ${sessionToken}
    WHERE user_code = ${userCode} AND status = 'pending'
    RETURNING *
  `;
  return (rows[0] as DeviceCode) ?? null;
}

export async function createSession(
  token: string,
  walletAddress: string,
  psAccessToken: string | null,
  expiresAt: Date,
): Promise<Session> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO sessions (token, wallet_address, ps_access_token, expires_at)
    VALUES (${token}, ${walletAddress}, ${psAccessToken}, ${expiresAt.toISOString()})
    RETURNING *
  `;
  return rows[0] as Session;
}

export async function findSession(token: string): Promise<Session | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM sessions WHERE token = ${token} LIMIT 1
  `;
  return (rows[0] as Session) ?? null;
}

export async function updateServerAccessToken(
  id: string,
  accessToken: string,
): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE personal_servers SET access_token = ${accessToken}, updated_at = now() WHERE id = ${id}
  `;
}
