import { neon } from "@neondatabase/serverless";

export type ProvisioningStep = "reserved" | "tunnel" | "dns" | "compute";

export type PersonalServer = {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string | null;
  control_plane_token: string | null;
  vm_ip: string | null;
  url: string | null;
  state: string;
  disk_id: string | null;
  disk_expires: string | null;
  tunnel_id: string | null;
  dns_record_id: string | null;
  provisioning_step: ProvisioningStep | null;
  provisioning_expires_at: string | Date | null;
  compute_operation: string | null;
  compute_creation_settled_at: string | Date | null;
  cleanup_claim: string | null;
  cleanup_expires_at: string | Date | null;
  created_at: string;
  updated_at: string;
};

type PersonalServerRow = Omit<PersonalServer, "control_plane_token"> & {
  access_token: string | null;
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
  return rows[0] ? mapPersonalServerRow(rows[0] as PersonalServerRow) : null;
}

export async function findServerById(
  id: string,
): Promise<PersonalServer | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM personal_servers WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ? mapPersonalServerRow(rows[0] as PersonalServerRow) : null;
}

export async function insertServerIfNotExists(
  server: Pick<PersonalServer, "id" | "user_id" | "provider" | "state">,
): Promise<PersonalServer | null> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO personal_servers (
      id, user_id, provider, state, provisioning_step, provisioning_expires_at
    )
    VALUES (${server.id}, ${server.user_id}, ${server.provider}, ${server.state},
            'reserved', now() + interval '75 seconds')
    ON CONFLICT (user_id) DO NOTHING
    RETURNING *
  `;
  return rows[0] ? mapPersonalServerRow(rows[0] as PersonalServerRow) : null;
}

export type ProvisioningProgress = {
  step: ProvisioningStep;
  tunnelId?: string;
  dnsRecordId?: string;
  instanceName?: string | null;
  diskName?: string | null;
  computeOperation?: string;
  computeCreationSettled?: boolean;
};

export async function recordProvisioningProgress(
  id: string,
  progress: ProvisioningProgress,
): Promise<void> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE personal_servers SET
      provisioning_step = ${progress.step},
      tunnel_id = COALESCE(${progress.tunnelId ?? null}, tunnel_id),
      dns_record_id = COALESCE(${progress.dnsRecordId ?? null}, dns_record_id),
      provider_id = CASE WHEN ${progress.instanceName !== undefined} THEN ${progress.instanceName ?? null}::text ELSE provider_id END,
      disk_id = CASE WHEN ${progress.diskName !== undefined} THEN ${progress.diskName ?? null}::text ELSE disk_id END,
      compute_operation = COALESCE(${progress.computeOperation ?? null}, compute_operation),
      compute_creation_settled_at = CASE WHEN ${progress.computeCreationSettled ?? false} THEN COALESCE(compute_creation_settled_at, now()) ELSE compute_creation_settled_at END,
      updated_at = now()
    WHERE id = ${id}
      AND provisioning_expires_at > now()
      AND cleanup_claim IS NULL
    RETURNING id
  `;
  if (!rows.length) throw new Error("Provisioning attempt is no longer active");
}

export async function finishProvisioning(
  id: string,
  url: string,
  accessToken: string,
): Promise<PersonalServer | null> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE personal_servers SET
      url = ${url}, access_token = ${accessToken}, provisioning_step = NULL,
      provisioning_expires_at = NULL, updated_at = now()
    WHERE id = ${id} AND provisioning_expires_at > now()
      AND cleanup_claim IS NULL AND compute_operation IS NOT NULL
    RETURNING *
  `;
  return rows[0] ? mapPersonalServerRow(rows[0] as PersonalServerRow) : null;
}

export async function failProvisioning(id: string): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE personal_servers SET state = 'deprovision_failed',
      provisioning_expires_at = NULL, updated_at = now()
    WHERE id = ${id} AND provisioning_step IS NOT NULL AND cleanup_claim IS NULL
  `;
}

export async function updateProvisionedServerStatus(
  id: string,
  state: string,
  settled: boolean,
) {
  const sql = getSQL();
  const rows = await sql`
    UPDATE personal_servers SET state = ${state},
      updated_at = CASE WHEN state <> ${state} THEN now() ELSE updated_at END,
      compute_creation_settled_at = CASE WHEN ${settled} THEN COALESCE(compute_creation_settled_at, now()) ELSE compute_creation_settled_at END
    WHERE id = ${id} AND state = 'provisioning' AND provisioning_step IS NULL
      AND cleanup_claim IS NULL
    RETURNING *
  `;
  return rows[0] ? mapPersonalServerRow(rows[0] as PersonalServerRow) : null;
}

export async function claimServerCleanup(
  id: string,
  claim: string,
): Promise<PersonalServer | null> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE personal_servers SET cleanup_claim = ${claim},
      cleanup_expires_at = now() + interval '75 seconds',
      state = 'deprovision_failed', updated_at = now()
    WHERE id = ${id}
      AND (provisioning_expires_at IS NULL OR provisioning_expires_at <= now())
      AND (cleanup_expires_at IS NULL OR cleanup_expires_at <= now())
    RETURNING *
  `;
  return rows[0] ? mapPersonalServerRow(rows[0] as PersonalServerRow) : null;
}

export async function saveRecoveryHandles(
  id: string,
  claim: string,
  handles: Pick<
    ProvisioningProgress,
    "tunnelId" | "dnsRecordId" | "computeOperation" | "computeCreationSettled"
  >,
): Promise<void> {
  const sql = getSQL();
  const rows = await sql`
    UPDATE personal_servers SET
      tunnel_id = COALESCE(${handles.tunnelId ?? null}, tunnel_id),
      dns_record_id = COALESCE(${handles.dnsRecordId ?? null}, dns_record_id),
      compute_operation = COALESCE(${handles.computeOperation ?? null}, compute_operation),
      compute_creation_settled_at = CASE WHEN ${handles.computeCreationSettled ?? false} THEN COALESCE(compute_creation_settled_at, now()) ELSE compute_creation_settled_at END,
      updated_at = now()
    WHERE id = ${id} AND cleanup_claim = ${claim} AND cleanup_expires_at > now()
    RETURNING id
  `;
  if (!rows.length) throw new Error("Cleanup claim expired");
}

export async function finishServerCleanup(
  id: string,
  claim: string,
): Promise<boolean> {
  const sql = getSQL();
  const rows = await sql`
    SELECT id FROM remove_cleaned_personal_server(${id}, ${claim}::uuid)
  `;
  return rows.length > 0;
}

export async function releaseServerCleanup(
  id: string,
  claim: string,
): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE personal_servers SET cleanup_claim = NULL, cleanup_expires_at = NULL
    WHERE id = ${id} AND cleanup_claim = ${claim}
  `;
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
  personal_server_session_token: string | null;
  created_at: string;
  expires_at: string;
};

type SessionRow = Omit<Session, "personal_server_session_token"> & {
  ps_access_token: string | null;
};

function mapPersonalServerRow(row: PersonalServerRow): PersonalServer {
  return {
    ...row,
    control_plane_token: row.access_token,
  };
}

function mapSessionRow(row: SessionRow): Session {
  return {
    ...row,
    personal_server_session_token: row.ps_access_token,
  };
}

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
  personalServerSessionToken: string | null,
  expiresAt: Date,
): Promise<Session> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO sessions (token, wallet_address, ps_access_token, expires_at)
    VALUES (${token}, ${walletAddress}, ${personalServerSessionToken}, ${expiresAt.toISOString()})
    RETURNING *
  `;
  return mapSessionRow(rows[0] as SessionRow);
}

export async function findSession(token: string): Promise<Session | null> {
  const sql = getSQL();
  const rows = await sql`
    SELECT * FROM sessions WHERE token = ${token} LIMIT 1
  `;
  return rows[0] ? mapSessionRow(rows[0] as SessionRow) : null;
}
