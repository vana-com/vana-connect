/**
 * Credential management for Vana CLI authentication.
 *
 * Stores and retrieves auth credentials from ~/.vana/auth.json.
 * Supports the device code flow for browser-based login and
 * env var overrides for CI/automation.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface VanaCredentials {
  account: {
    address: string;
    session_token: string;
    expires_at: string;
  };
  personal_server: {
    url: string;
    access_token: string;
    expires_at: string;
  } | null;
}

const AUTH_FILE = "auth.json";

function getAuthFilePath(): string {
  return path.join(os.homedir(), ".vana", AUTH_FILE);
}

/**
 * Load credentials from disk or env vars.
 *
 * Priority:
 * 1. Env vars (VANA_SESSION_TOKEN, VANA_PS_TOKEN, VANA_PS_URL)
 * 2. File (~/.vana/auth.json)
 *
 * Returns null if no credentials are available or if they are expired.
 */
export function loadCredentials(): VanaCredentials | null {
  // Check env var overrides first
  const envSessionToken = process.env.VANA_SESSION_TOKEN;
  const envPsToken = process.env.VANA_PS_TOKEN;
  const envPsUrl =
    process.env.VANA_PS_URL ?? process.env.VANA_PERSONAL_SERVER_URL;

  if (envSessionToken) {
    // Build credentials from env vars — no expiry tracking for env-based tokens
    const farFuture = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000,
    ).toISOString();
    return {
      account: {
        address: "env",
        session_token: envSessionToken,
        expires_at: farFuture,
      },
      personal_server:
        envPsToken && envPsUrl
          ? {
              url: envPsUrl,
              access_token: envPsToken,
              expires_at: farFuture,
            }
          : null,
    };
  }

  // Read from file
  const filePath = getAuthFilePath();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const creds = JSON.parse(raw) as VanaCredentials;
    if (isExpired(creds)) {
      return null;
    }
    return creds;
  } catch {
    return null;
  }
}

/**
 * Save credentials to ~/.vana/auth.json with 0600 permissions.
 */
export async function saveCredentials(creds: VanaCredentials): Promise<void> {
  const filePath = getAuthFilePath();
  const dir = path.dirname(filePath);

  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(creds, null, 2) + "\n", {
    mode: 0o600,
  });
}

/**
 * Delete ~/.vana/auth.json.
 */
export async function clearCredentials(): Promise<void> {
  const filePath = getAuthFilePath();
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    // Ignore if file doesn't exist
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

/**
 * Check if the account session token has expired.
 */
export function isExpired(creds: VanaCredentials): boolean {
  try {
    const expiresAt = new Date(creds.account.expires_at);
    return expiresAt.getTime() <= Date.now();
  } catch {
    return true;
  }
}

/**
 * Format an address for display: 0x2Ab3...fa1
 */
export function formatAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-3)}`;
}

/**
 * Return human-readable time until expiry: "29 days", "3 hours", etc.
 */
export function formatExpiresIn(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";

  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;

  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;

  const minutes = Math.floor(ms / (60 * 1000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// ── Device code flow ───────────────────────────────────────────────────

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface DeviceCodePollAuthorized {
  status: "authorized";
  session_token: string;
  personal_server_url?: string;
  ps_access_token?: string;
  address: string;
  expires_in?: number;
}

export interface DeviceCodePollPending {
  status: "pending";
}

export interface DeviceCodePollExpired {
  status: "expired";
}

export type DeviceCodePollResponse =
  | DeviceCodePollAuthorized
  | DeviceCodePollPending
  | DeviceCodePollExpired;

function getAccountUrl(): string {
  return (
    process.env.VANA_ACCOUNT_URL?.replace(/\/+$/, "") ??
    "https://account.vana.org"
  );
}

/**
 * Request a device code from the auth server.
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const url = `${getAccountUrl()}/api/auth/device`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to start device code flow: HTTP ${response.status}${text ? ` — ${text}` : ""}`,
    );
  }

  return (await response.json()) as DeviceCodeResponse;
}

/**
 * Poll for device code authorization.
 */
export async function pollDeviceCode(
  deviceCode: string,
): Promise<DeviceCodePollResponse> {
  const url = `${getAccountUrl()}/api/auth/device/poll?device_code=${encodeURIComponent(deviceCode)}`;
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Poll failed: HTTP ${response.status}${text ? ` — ${text}` : ""}`,
    );
  }

  return (await response.json()) as DeviceCodePollResponse;
}

/**
 * Open a URL in the user's default browser.
 * Best-effort — failures are silently ignored.
 */
export function openBrowser(url: string): void {
  const platform = process.platform;

  try {
    if (platform === "darwin") {
      execSync(`open ${JSON.stringify(url)}`, { stdio: "ignore" });
    } else if (platform === "win32") {
      execSync(`start "" ${JSON.stringify(url)}`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open ${JSON.stringify(url)}`, { stdio: "ignore" });
    }
  } catch {
    // Best-effort — user can open manually
  }
}

/**
 * Run the full device code login flow.
 *
 * Returns credentials on success, or null if the code expired.
 * Calls the provided callbacks for UI updates.
 */
export async function runDeviceCodeFlow(callbacks: {
  onCode: (code: string, verificationUri: string) => void;
  onWaiting: () => void;
  onAuthorized: (creds: VanaCredentials) => void;
  onExpired: () => void;
  onError: (error: Error) => void;
}): Promise<VanaCredentials | null> {
  try {
    const deviceCode = await requestDeviceCode();

    callbacks.onCode(deviceCode.user_code, deviceCode.verification_uri);

    // Try to open browser
    openBrowser(deviceCode.verification_uri);

    callbacks.onWaiting();

    const interval = (deviceCode.interval ?? 5) * 1000;
    const deadline = Date.now() + deviceCode.expires_in * 1000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, interval));

      try {
        const result = await pollDeviceCode(deviceCode.device_code);

        if (result.status === "authorized") {
          const expiresIn = result.expires_in ?? 30 * 24 * 60 * 60; // default 30 days
          const expiresAt = new Date(
            Date.now() + expiresIn * 1000,
          ).toISOString();

          const creds: VanaCredentials = {
            account: {
              address: result.address,
              session_token: result.session_token,
              expires_at: expiresAt,
            },
            personal_server:
              result.personal_server_url && result.ps_access_token
                ? {
                    url: result.personal_server_url,
                    access_token: result.ps_access_token,
                    expires_at: expiresAt,
                  }
                : null,
          };

          callbacks.onAuthorized(creds);
          return creds;
        }

        if (result.status === "expired") {
          callbacks.onExpired();
          return null;
        }

        // status === "pending" — continue polling
      } catch {
        // Transient poll error — retry on next interval
      }
    }

    // Timed out
    callbacks.onExpired();
    return null;
  } catch (error) {
    callbacks.onError(
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}
