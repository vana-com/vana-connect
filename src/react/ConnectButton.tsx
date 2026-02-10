import { useEffect } from "react";
import type { GrantPayload } from "../core/types.js";
import { useVanaConnect } from "./useVanaConnect.js";

export interface ConnectButtonProps {
  sessionId: string;
  deepLinkUrl?: string;
  onComplete?: (grant: GrantPayload) => void;
  onError?: (error: string) => void;
  onDenied?: (reason: string) => void;
  className?: string;
  label?: string;
}

export function ConnectButton(props: ConnectButtonProps) {
  const {
    sessionId,
    deepLinkUrl: deepLinkUrlProp,
    onComplete,
    onError,
    onDenied,
    className,
    label,
  } = props;

  const { connect, status, grant, error, deepLinkUrl } = useVanaConnect();

  useEffect(() => {
    connect({ sessionId, deepLinkUrl: deepLinkUrlProp });
  }, [sessionId, deepLinkUrlProp, connect]);

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
      {deepLinkUrl && status === "waiting" && (
        <a href={deepLinkUrl}>{label ?? "Open Vana Desktop App"}</a>
      )}
    </div>
  );
}
