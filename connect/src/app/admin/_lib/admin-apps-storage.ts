"use client";

/**
 * Admin app registry — DB-backed via /api/admin/oauth-clients.
 *
 * Previously this module wrote to localStorage. That meant apps registered
 * on one device didn't appear on another, and clearing site data hid all
 * builders behind their on-chain registrations. Now apps survive across
 * devices because the registry is persisted in Postgres (oauth_clients
 * table). Auth: master-key signature is recovered server-side to derive
 * `owner_address`; the API filters by that address.
 *
 * The legacy localStorage rows are migrated on first read by
 * {@link migrateLegacyAdminApps}; callers are expected to have already
 * obtained a master-key signature so the migration can upsert through the
 * authenticated API.
 */

export type RegisteredAdminApp = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  builderId?: string;
  ownerAddress?: string;
};

const LEGACY_LOCAL_STORAGE_KEY = "vana.connect.admin.apps";
const MIGRATION_FLAG_KEY = "vana.connect.admin.apps.migrated_at";

type ApiClient = {
  client_id: string;
  application_id: string | null;
  display_name: string;
  app_url: string;
  owner_address: string;
  grantee_address: string | null;
  builder_id: string | null;
  public_key: string | null;
  webhook_url: string | null;
  redirect_uris: string[];
  registered_at: string;
  updated_at: string;
};

function rowToApp(row: ApiClient): RegisteredAdminApp {
  return {
    id: row.client_id,
    name: row.display_name,
    url: row.app_url,
    createdAt: row.registered_at,
    builderId: row.builder_id ?? undefined,
    ownerAddress: row.owner_address,
  };
}

function readLegacyApps(): RegisteredAdminApp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRegisteredAdminApp);
  } catch {
    return [];
  }
}

function clearLegacyApps(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
    window.localStorage.setItem(MIGRATION_FLAG_KEY, new Date().toISOString());
  } catch {
    // ignore
  }
}

export async function listAdminApps(
  masterKeySignature: string,
): Promise<RegisteredAdminApp[]> {
  const res = await fetch("/api/admin/oauth-clients", {
    headers: { Authorization: `Bearer ${masterKeySignature}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to load admin apps: ${res.status}`);
  }
  const json = (await res.json()) as { data?: ApiClient[] };
  return (json.data ?? []).map(rowToApp);
}

export async function saveAdminApp(
  masterKeySignature: string,
  app: {
    clientId: string;
    name: string;
    url: string;
    builderId?: string;
    granteeAddress?: string;
    publicKey?: string;
    redirectUris?: string[];
  },
): Promise<RegisteredAdminApp> {
  const res = await fetch("/api/admin/oauth-clients", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${masterKeySignature}`,
    },
    body: JSON.stringify({
      clientId: app.clientId,
      displayName: app.name,
      appUrl: app.url,
      builderId: app.builderId,
      granteeAddress: app.granteeAddress,
      publicKey: app.publicKey,
      redirectUris: app.redirectUris ?? [],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: { message?: string } }).error?.message ??
        `Failed to save app: ${res.status}`,
    );
  }
  const row = (await res.json()) as ApiClient;
  return rowToApp(row);
}

export async function deleteAdminApp(
  masterKeySignature: string,
  clientId: string,
): Promise<void> {
  const res = await fetch(
    `/api/admin/oauth-clients/${encodeURIComponent(clientId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${masterKeySignature}` },
    },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete app: ${res.status}`);
  }
}

/**
 * Best-effort migration of any localStorage-only admin apps into the DB.
 * Runs once per browser (gated by a flag) and silently skips on errors so
 * migration failures never block the page. Legacy entries lacking a stable
 * `id`/`url` pair are dropped.
 */
export async function migrateLegacyAdminApps(
  masterKeySignature: string,
): Promise<{ migrated: number }> {
  if (typeof window === "undefined") return { migrated: 0 };
  if (window.localStorage.getItem(MIGRATION_FLAG_KEY)) return { migrated: 0 };

  const legacy = readLegacyApps();
  if (legacy.length === 0) {
    clearLegacyApps();
    return { migrated: 0 };
  }

  let migrated = 0;
  for (const app of legacy) {
    try {
      await saveAdminApp(masterKeySignature, {
        clientId: app.id,
        name: app.name,
        url: app.url,
        builderId: app.builderId,
        granteeAddress: app.ownerAddress,
      });
      migrated += 1;
    } catch {
      // Skip rows the API rejects (e.g. missing builder data); they'll need
      // to be re-registered manually. Don't block the migration on partial
      // failure.
    }
  }
  clearLegacyApps();
  return { migrated };
}

function isRegisteredAdminApp(value: unknown): value is RegisteredAdminApp {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.url === "string" &&
    typeof r.createdAt === "string"
  );
}
