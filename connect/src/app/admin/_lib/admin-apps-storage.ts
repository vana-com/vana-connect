"use client";

export type RegisteredAdminApp = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};

const ADMIN_APPS_STORAGE_KEY = "vana.connect.admin.apps";

export function readRegisteredAdminApps(): RegisteredAdminApp[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(ADMIN_APPS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRegisteredAdminApp);
  } catch {
    return [];
  }
}

export function saveRegisteredAdminApp(app: RegisteredAdminApp): void {
  if (typeof window === "undefined") {
    return;
  }

  const current = readRegisteredAdminApps().filter(
    (existing) => normalizeUrl(existing.url) !== normalizeUrl(app.url),
  );
  const next = [app, ...current];
  window.localStorage.setItem(ADMIN_APPS_STORAGE_KEY, JSON.stringify(next));
}

export function deleteRegisteredAdminApp(appId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const next = readRegisteredAdminApps().filter((app) => app.id !== appId);
  window.localStorage.setItem(ADMIN_APPS_STORAGE_KEY, JSON.stringify(next));
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();

  try {
    const parsed = new URL(trimmed);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";

    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }

    parsed.pathname = parsed.pathname.replace(/\/+$/g, "") || "/";
    return parsed.toString();
  } catch {
    return trimmed.toLowerCase();
  }
}

function isRegisteredAdminApp(value: unknown): value is RegisteredAdminApp {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.url === "string" &&
    typeof record.createdAt === "string"
  );
}
