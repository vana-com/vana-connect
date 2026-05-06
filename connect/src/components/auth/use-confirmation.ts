"use client";

import { useCallback, useRef, useState } from "react";
import { vanaFetch } from "@/lib/auth/vana-fetch";

/**
 * Shape of the JSON body returned by any /api/servers/* route that needs
 * an interactive confirmation. See docs/auth-redesign/01-architecture.md §6.1.
 */
export type ConfirmationRequired = {
  confirmation_id: string;
  payload_summary: Record<string, unknown>;
  expires_at: string;
};

export type ConfirmationConsumeResult = { confirmedId: string };

type Body = {
  error?: unknown;
  confirmation_id?: unknown;
  payload_summary?: unknown;
  expires_at?: unknown;
};

const VANA_ACCESS_COOKIE = "vana_access";

/**
 * Reads the `vana_access` cookie from `document.cookie`.
 *
 * The cookie is set by the auth bridge route on login. State-mutating routes
 * require the access token as `Authorization: Bearer ...`; the consume route
 * reads from the same header, so we extract the cookie value here.
 *
 * Returns null if not in a browser, or if the cookie is missing/empty.
 */
export function readVanaAccessCookie(): string | null {
  if (typeof document === "undefined") return null;
  const cookieString = document.cookie;
  if (!cookieString) return null;
  const parts = cookieString.split(";");
  for (const part of parts) {
    const [rawName, ...rest] = part.split("=");
    if (!rawName) continue;
    const name = rawName.trim();
    if (name === VANA_ACCESS_COOKIE) {
      const value = rest.join("=").trim();
      if (!value) return null;
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

function isConfirmationRequiredBody(body: Body): body is {
  error: "confirmation_required";
  confirmation_id: string;
  payload_summary: Record<string, unknown>;
  expires_at: string;
} {
  return (
    body.error === "confirmation_required" &&
    typeof body.confirmation_id === "string" &&
    typeof body.expires_at === "string" &&
    typeof body.payload_summary === "object" &&
    body.payload_summary !== null &&
    !Array.isArray(body.payload_summary)
  );
}

export type UseConfirmationResult = {
  /** The currently-pending confirmation, if any. Drives the modal `open` prop. */
  pending: ConfirmationRequired | null;
  error: string | null;
  /**
   * Inspect a `Response`. If it's a 401 with a `confirmation_required` body,
   * surface the pending modal state and return a Promise that resolves once
   * the user has acted: `{ confirmedId }` on Confirm + consume success,
   * `null` on cancel or consume failure.
   *
   * Returns `null` synchronously (well, after the body parse) for non-matching
   * responses so the caller can fall through.
   */
  handle401: (response: Response) => Promise<ConfirmationConsumeResult | null>;
  /**
   * Confirm action: POSTs to /consume. Bind to the modal's `onConfirm` prop.
   * Always wired by `handle401`; exposed for callers that want to drive the
   * modal manually (e.g. tests).
   */
  confirm: () => Promise<void>;
  /**
   * Cancel action: clears pending state and resolves the in-flight handle401
   * promise with `null`. Bind to the modal's `onCancel` prop.
   */
  dismiss: () => void;
};

type Resolver = (result: ConfirmationConsumeResult | null) => void;

/**
 * useConfirmation
 *
 * Wraps the `confirmation_required` lifecycle from
 * docs/auth-redesign/01-architecture.md §6.1.
 *
 * Usage:
 *
 *   const { handle401, pending, error, confirm, dismiss } = useConfirmation();
 *
 *   let response = await fetch('/api/servers/.../register-on-chain', { ... });
 *   if (response.status === 401) {
 *     const result = await handle401(response);
 *     if (result) {
 *       response = await fetch('/api/servers/.../register-on-chain', {
 *         method: 'POST',
 *         headers: {
 *           Authorization: `Bearer ${access}`,
 *           'x-vana-confirmation-id': result.confirmedId,
 *         },
 *       });
 *     }
 *   }
 *
 *   <ConfirmationModal
 *     open={!!pending}
 *     confirmationId={pending?.confirmation_id ?? ''}
 *     payloadSummary={pending?.payload_summary ?? {}}
 *     expiresAt={pending?.expires_at ?? ''}
 *     onConfirm={confirm}
 *     onCancel={dismiss}
 *     error={error}
 *   />
 */
export function useConfirmation(): UseConfirmationResult {
  const [pending, setPending] = useState<ConfirmationRequired | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cross-render handle to the resolver of the in-flight handle401 promise.
  // Stored in a ref so confirm/dismiss callbacks pick up the latest value
  // without re-creating the entire promise chain.
  const resolverRef = useRef<Resolver | null>(null);
  const pendingRef = useRef<ConfirmationRequired | null>(null);

  const settle = useCallback((result: ConfirmationConsumeResult | null) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    if (resolver) resolver(result);
  }, []);

  const confirm = useCallback(async () => {
    const current = pendingRef.current;
    if (!current) return;
    try {
      const response = await vanaFetch(
        `/api/auth/confirmations/${encodeURIComponent(current.confirmation_id)}/consume`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!response.ok) {
        setError(`Confirmation failed (${response.status})`);
        settle(null);
        return;
      }
      const confirmedId = current.confirmation_id;
      pendingRef.current = null;
      setPending(null);
      setError(null);
      settle({ confirmedId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Network error");
      settle(null);
    }
  }, [settle]);

  const dismiss = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
    setError(null);
    settle(null);
  }, [settle]);

  const handle401 = useCallback(
    async (response: Response): Promise<ConfirmationConsumeResult | null> => {
      if (response.status !== 401) return null;
      let body: Body;
      try {
        body = (await response.clone().json()) as Body;
      } catch {
        return null;
      }
      if (!isConfirmationRequiredBody(body)) return null;

      const next: ConfirmationRequired = {
        confirmation_id: body.confirmation_id,
        payload_summary: body.payload_summary,
        expires_at: body.expires_at,
      };

      // If a previous handle401 is still pending, settle it as cancelled
      // before starting a new one. (Concurrent confirmation prompts are
      // not supported by the modal UI.)
      if (resolverRef.current) {
        const prev = resolverRef.current;
        resolverRef.current = null;
        prev(null);
      }

      pendingRef.current = next;
      setPending(next);
      setError(null);

      return new Promise<ConfirmationConsumeResult | null>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    [],
  );

  return { pending, error, handle401, confirm, dismiss };
}
