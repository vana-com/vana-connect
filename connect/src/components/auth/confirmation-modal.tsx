"use client";

import { useEffect, useId, useMemo, useState } from "react";

export type ConfirmationModalProps = {
  open: boolean;
  confirmationId: string;
  payloadSummary: Record<string, unknown>;
  /** ISO 8601 timestamp at which this confirmation expires server-side. */
  expiresAt: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  error?: string | null;
};

/**
 * Inline modal for the high-risk signing flow described in
 * docs/auth-redesign/01-architecture.md §6.1.
 *
 * Security invariants:
 * - Backdrop click does NOT auto-cancel (high-risk action requires explicit
 *   click on Cancel).
 * - Escape DOES cancel — matches user expectation for keyboard dismissal.
 * - Confirm is disabled once `expiresAt` has elapsed; the user must refresh
 *   the originating action to issue a fresh confirmation row.
 */
export function ConfirmationModal({
  open,
  confirmationId,
  payloadSummary,
  expiresAt,
  onConfirm,
  onCancel,
  error,
}: ConfirmationModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);

  // Tick once a second while open so the countdown stays current.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [open]);

  // Esc cancels (only while open).
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const expiresAtMs = useMemo(() => {
    const parsed = Date.parse(expiresAt);
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [expiresAt]);

  const expired = expiresAtMs <= now;
  const secondsRemaining = expired
    ? 0
    : Math.max(0, Math.ceil((expiresAtMs - now) / 1000));

  const formattedSummary = useMemo(() => {
    try {
      return JSON.stringify(payloadSummary, null, 2);
    } catch {
      return "[unserializable payload]";
    }
  }, [payloadSummary]);

  if (!open) return null;

  async function handleConfirm() {
    if (submitting || expired) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      // Full-viewport overlay. Backdrop intentionally non-interactive: the
      // overlay is a plain div, not a button. Clicks here do nothing.
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="confirmation-modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-lg rounded border border-neutral-300 bg-white p-6 shadow-lg"
        data-testid="confirmation-modal"
        // Confirmation id surfaced for testing / debugging.
        data-confirmation-id={confirmationId}
      >
        <h2 id={titleId} className="text-lg font-semibold text-neutral-900">
          Confirm action
        </h2>
        <p id={descriptionId} className="mt-1 text-sm text-neutral-600">
          Review the payload below. This authorizes a single signing operation
          on your behalf.
        </p>

        <pre
          className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-900"
          data-testid="confirmation-modal-payload"
        >
          {formattedSummary}
        </pre>

        <div
          className="mt-3 text-xs text-neutral-600"
          data-testid="confirmation-modal-countdown"
        >
          {expired ? (
            <span className="text-red-600">
              This confirmation expired. Refresh to continue.
            </span>
          ) : (
            <span>Expires in {secondsRemaining}s</span>
          )}
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700"
            data-testid="confirmation-modal-error"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            data-testid="confirmation-modal-cancel"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            data-testid="confirmation-modal-confirm"
            disabled={submitting || expired}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"
                  data-testid="confirmation-modal-spinner"
                />
                Confirming…
              </span>
            ) : (
              "Confirm"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
