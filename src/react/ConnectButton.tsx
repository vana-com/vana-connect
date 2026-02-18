import { useEffect } from "react";
import type { GrantPayload } from "../core/types.js";
import { useVanaConnect } from "./useVanaConnect.js";

/** Props for the {@link ConnectButton} component. */
export interface ConnectButtonProps {
  /** Session ID from the server-side `connect()` call. */
  sessionId: string;
  /** URL to account.vana.org/connect. */
  connectUrl?: string;
  /** Called when the user approves the grant. */
  onComplete?: (grant: GrantPayload) => void;
  /** Called on polling errors. */
  onError?: (error: string) => void;
  /** Called when the user denies the request. */
  onDenied?: (reason: string) => void;
  /** CSS class name for the wrapper element. */
  className?: string;
  /** Label for the connect anchor (default: `"Connect with Vana"`). */
  label?: string;
}

/**
 * Pre-built React component that displays connection status and a deep link.
 *
 * For full control over the UI, use {@link useVanaConnect} or {@link useVanaData} directly.
 *
 * @param props - Component props.
 */
export function ConnectButton(props: ConnectButtonProps) {
  const {
    sessionId,
    connectUrl: connectUrlProp,
    onComplete,
    onError,
    onDenied,
    className,
    label,
  } = props;

  const { connect, status, grant, error, connectUrl } = useVanaConnect();

  useEffect(() => {
    connect({ sessionId, connectUrl: connectUrlProp });
  }, [sessionId, connectUrlProp, connect]);

  useEffect(() => {
    if (status === "approved" && grant && onComplete) {
      onComplete(grant);
    }
    if (status === "error" && error && onError) {
      onError(error);
    }
    if (status === "denied" && onDenied) {
      onDenied(error ?? "User denied the request");
    }
  }, [status, grant, error, onComplete, onError, onDenied]);

  const statusText: Record<string, string> = {
    idle: "Initializing...",
    connecting: "Connecting...",
    waiting: "Waiting for approval...",
    approved: "Connected!",
    denied: "Request denied",
    expired: "Session expired",
    error: "Connection error",
  };

  return (
    <div className={className}>
      <p>{statusText[status] ?? status}</p>
      {connectUrl && status === "waiting" && (
        <a href={connectUrl} target="_blank" rel="noopener noreferrer">
          {label ?? "Connect with Vana"}
        </a>
      )}
    </div>
  );
}
