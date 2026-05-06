"use client";

import { useSignMessage, useWallets } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirmation } from "@/components/auth/use-confirmation";

const MASTER_KEY_MESSAGE = "vana-master-key-v1";
const POLL_INTERVAL_MS = 5_000;

/**
 * Read the `vana_access` cookie (JS-readable companion to vana_session).
 * The browser sends this as `Authorization: Bearer <vana_access>` for any
 * state-mutating request — getVanaSession rejects cookie-only auth on
 * POST/PUT/PATCH/DELETE.
 */
function readVanaAccessCookie(): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k !== "vana_access") continue;
    const v = part.slice(eq + 1).trim();
    return v ? decodeURIComponent(v) : null;
  }
  return null;
}

function vanaAuthHeaders(): Record<string, string> {
  const tok = readVanaAccessCookie();
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

type ApiServer = {
  object: "server";
  id: string;
  user_id: string;
  provider: string;
  provider_id: string | null;
  url: string | null;
  mcp_endpoint: string | null;
  state: string;
  created_at: string;
  updated_at: string;
};

export type ServerStatus =
  | "loading"
  | "idle"
  | "provisioning"
  | "deprovisioning"
  | "running"
  | "stopped"
  | "deprovision_failed"
  | "error";

export type RegistrationStatus =
  | "unknown"
  | "registering"
  | "registered"
  | "not_registered";

export function useServer() {
  const { signMessage } = useSignMessage();
  const { wallets, ready: walletsReady } = useWallets();
  const confirmation = useConfirmation();
  const [server, setServer] = useState<ApiServer | null>(null);
  const [status, setStatus] = useState<ServerStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus>("unknown");
  const [serverId, setServerId] = useState<string | null>(null);
  const signatureRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialFetchDone = useRef(false);
  const provisioningServerIdRef = useRef<string | null>(null);
  // Tracks server ids we've already triggered on-chain registration for, so
  // we don't repeat the call on every poll/refresh after the server transitions
  // to `running`. Idempotent on the server too (gateway returns 409 →
  // treated as success), but avoiding the network roundtrip is cheaper.
  const registeredOnChainRef = useRef<Set<string>>(new Set());

  const embeddedWalletAddress = (() => {
    for (const wallet of wallets) {
      if (
        wallet.walletClientType === "privy" ||
        wallet.walletClientType === "privy-v2"
      ) {
        if (typeof wallet.address === "string" && wallet.address.length > 0) {
          return wallet.address;
        }
      }
    }
    return null;
  })();

  const getSignature = useCallback(async (): Promise<string> => {
    if (signatureRef.current) return signatureRef.current;
    const { signature } = await signMessage(
      { message: MASTER_KEY_MESSAGE },
      {
        uiOptions: { showWalletUIs: false },
        address: embeddedWalletAddress ?? undefined,
      },
    );
    signatureRef.current = signature;
    return signature;
  }, [signMessage, embeddedWalletAddress]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchServer = useCallback(async () => {
    try {
      const serverId = provisioningServerIdRef.current;
      const endpoint = serverId ? `/api/servers/${serverId}` : "/api/servers";
      // GET — verifier accepts vana_session cookie, but we send Bearer too
      // for explicitness and so the same call shape works on POST/DELETE.
      const res = await fetch(endpoint, {
        headers: { ...vanaAuthHeaders() },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch server: ${res.status}`);
      }
      const json = await res.json();
      const records: ApiServer[] =
        json.data ?? (json.object === "server" ? [json] : []);
      if (records.length > 0) {
        const s = records[0];
        setServer(s);
        const state = s.state as ServerStatus;
        provisioningServerIdRef.current =
          state === "provisioning" ? s.id : null;
        setStatus(state === "provisioning" ? "provisioning" : state);
        setError(null);
        return s;
      }
      provisioningServerIdRef.current = null;
      setServer(null);
      setStatus("idle");
      setError(null);
      setRegistrationStatus("unknown");
      setServerId(null);
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchServer();
  }, [fetchServer]);

  const provision = useCallback(async () => {
    setStatus("provisioning");
    setError(null);
    try {
      // Master-key signature is still required in the body — NOT for auth
      // (auth is the Vana session Bearer below) but for PS keypair
      // derivation. The PS startup script uses VANA_MASTER_KEY_SIGNATURE
      // to deterministically derive its signing keypair.
      const sig = await getSignature();
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...vanaAuthHeaders() },
        body: JSON.stringify({ masterKeySignature: sig }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error?.message ?? `Provisioning failed: ${res.status}`,
        );
      }
      const s: ApiServer = await res.json();
      setServer(s);
      provisioningServerIdRef.current = s.id;
      setStatus("provisioning");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [getSignature]);

  const deprovision = useCallback(async () => {
    if (!server) return;
    setError(null);
    // Reflect the in-flight deprovision in the UI immediately. The DELETE
    // can take 30-60s (VM teardown + disk delete + tunnel/DNS cleanup).
    // Without this, users see no feedback and assume the click was lost.
    setStatus("deprovisioning");
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "DELETE",
        headers: { ...vanaAuthHeaders() },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error?.message ?? `Deprovision failed: ${res.status}`,
        );
      }
      setServer(null);
      provisioningServerIdRef.current = null;
      setStatus("idle");
      stopPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("deprovision_failed");
    }
  }, [server, stopPolling]);

  // Initial fetch once wallet is ready
  useEffect(() => {
    if (!walletsReady || !embeddedWalletAddress) return;
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    fetchServer();
  }, [walletsReady, embeddedWalletAddress, fetchServer]);

  // When status flips to `running`, determine whether this server is already
  // registered on the gateway and kick off registration if not.
  //
  // Source of truth is the gateway, NOT PS /health. PS only sets
  // identity.serverId once at boot via gateway.getServer(); if that lookup
  // happened to fire before registration (or failed), serverId stays null
  // forever until PS restarts. Querying gateway directly sidesteps that.
  //
  // Gateway lookup is by serverAddress, not ownerAddress (the
  // /v1/servers/{address} route is keyed on serverAddress).
  useEffect(() => {
    if (status !== "running" || !server?.url) return;

    let cancelled = false;
    const serverUrl = server.url;
    const dbId = server.id;

    const gatewayUrl =
      process.env.NEXT_PUBLIC_DATA_GATEWAY_URL ??
      "https://data-gateway.vana.org";

    void (async () => {
      // 1. Fetch PS /health to discover this server's serverAddress.
      let serverAddress: string | null = null;
      try {
        const healthRes = await fetch(`${serverUrl}/health`, {
          cache: "no-store",
        });
        if (!cancelled && healthRes.ok) {
          const health = (await healthRes.json()) as {
            identity?: { address?: string; serverId?: string | null };
          };
          serverAddress = health.identity?.address ?? null;
          // If PS already knows its serverId, skip the gateway round-trip.
          if (health.identity?.serverId) {
            setServerId(health.identity.serverId);
            setRegistrationStatus("registered");
            registeredOnChainRef.current.add(dbId);
            return;
          }
        }
      } catch {
        // Health probe failed — fall through to attempt registration anyway.
      }
      if (cancelled) return;

      // 2. Ask gateway directly: does this serverAddress have a registration?
      //    PS /health.identity.serverId is unreliable (stale until restart);
      //    gateway is canonical.
      if (serverAddress) {
        try {
          const gwRes = await fetch(
            `${gatewayUrl}/v1/servers/${serverAddress}`,
            { cache: "no-store" },
          );
          if (cancelled) return;
          if (gwRes.ok) {
            const body = (await gwRes.json()) as {
              data?: { id?: string };
            };
            if (body.data?.id) {
              setServerId(body.data.id);
              setRegistrationStatus("registered");
              registeredOnChainRef.current.add(dbId);
              return;
            }
          }
          // 404 → not registered yet, fall through to register.
        } catch {
          // Gateway unreachable — fall through to attempt registration.
        }
      }

      if (cancelled) return;
      if (registeredOnChainRef.current.has(dbId)) return;
      registeredOnChainRef.current.add(dbId);

      // 3. Trigger registration. Auth is the Vana session Bearer; if the
      // server returns 401 confirmation_required, useConfirmation handles
      // the inline modal dance, then we retry with x-vana-confirmation-id.
      setRegistrationStatus("registering");
      try {
        let res = await fetch(`/api/servers/${dbId}/register-on-chain`, {
          method: "POST",
          headers: { ...vanaAuthHeaders() },
        });
        if (cancelled) return;
        if (res.status === 401) {
          const result = await confirmation.handle401(res);
          if (cancelled) return;
          if (result) {
            res = await fetch(`/api/servers/${dbId}/register-on-chain`, {
              method: "POST",
              headers: {
                ...vanaAuthHeaders(),
                "x-vana-confirmation-id": result.confirmedId,
              },
            });
          }
        }
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as { serverId?: string };
          // Helper returns "" for the 409-already-registered case. In that
          // case (or any case where serverId is missing), re-query gateway
          // to fetch the real id rather than displaying empty.
          if (body.serverId) {
            setServerId(body.serverId);
            setRegistrationStatus("registered");
          } else if (serverAddress) {
            try {
              const gwRes = await fetch(
                `${gatewayUrl}/v1/servers/${serverAddress}`,
                { cache: "no-store" },
              );
              if (gwRes.ok) {
                const gwBody = (await gwRes.json()) as {
                  data?: { id?: string };
                };
                setServerId(gwBody.data?.id ?? null);
              }
            } catch {
              // Best-effort; UI still flips to registered below.
            }
            setRegistrationStatus("registered");
          } else {
            setRegistrationStatus("registered");
          }
        } else {
          const body = await res.json().catch(() => ({}));
          console.warn("On-chain registration failed:", body);
          setRegistrationStatus("not_registered");
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("On-chain registration error:", err);
        setRegistrationStatus("not_registered");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, server, confirmation]);

  // Poll while provisioning
  useEffect(() => {
    if (status === "provisioning") {
      pollRef.current = setInterval(() => {
        fetchServer();
      }, POLL_INTERVAL_MS);
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [status, fetchServer, stopPolling]);

  return {
    server,
    status,
    error,
    walletAddress: embeddedWalletAddress,
    registrationStatus,
    serverId,
    provision,
    deprovision,
    refresh,
    /** Surface confirmation state so the page can render the modal. */
    confirmation,
  };
}
