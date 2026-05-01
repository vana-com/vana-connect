"use client";

import { useSignMessage, useWallets } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";

const MASTER_KEY_MESSAGE = "vana-master-key-v1";
const POLL_INTERVAL_MS = 5_000;

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
  | "running"
  | "stopped"
  | "deprovision_failed"
  | "error";

export function useServer() {
  const { signMessage } = useSignMessage();
  const { wallets, ready: walletsReady } = useWallets();
  const [server, setServer] = useState<ApiServer | null>(null);
  const [status, setStatus] = useState<ServerStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const signatureRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialFetchDone = useRef(false);
  const provisioningServerIdRef = useRef<string | null>(null);

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
      const sig = await getSignature();
      const serverId = provisioningServerIdRef.current;
      const endpoint = serverId ? `/api/servers/${serverId}` : "/api/servers";
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${sig}` },
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
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      return null;
    }
  }, [getSignature]);

  const refresh = useCallback(async () => {
    await fetchServer();
  }, [fetchServer]);

  const provision = useCallback(async () => {
    setStatus("provisioning");
    setError(null);
    try {
      const sig = await getSignature();
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    try {
      const sig = await getSignature();
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sig}` },
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
    }
  }, [server, getSignature, stopPolling]);

  // Initial fetch once wallet is ready
  useEffect(() => {
    if (!walletsReady || !embeddedWalletAddress) return;
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    fetchServer();
  }, [walletsReady, embeddedWalletAddress, fetchServer]);

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
    provision,
    deprovision,
    refresh,
  };
}
